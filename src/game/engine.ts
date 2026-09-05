import {
  ACESFilmicToneMapping, Color, DirectionalLight, DodecahedronGeometry, Fog, Group,
  HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, Quaternion, Raycaster, Scene, Sphere, SRGBColorSpace, Vector2,
  Vector3, WebGLRenderer,
} from 'three'
import { BUILDABLE_TYPES, BUILDINGS, DAY_LENGTH, HEARTH_NORMAL, NODE_DEFINITIONS, PLANET_RADIUS } from './config.ts'
import { advanceOnSphere, isWater, sphereFramingDistance, surfaceDistance, surfacePoint, surfaceQuaternion, surfaceRadius, tangentForward } from './math.ts'
import { animateCharacter, createBuildingModel, createCharacterModel, createSelectionRing, disposeModel } from './models.ts'
import type { CharacterRig } from './models.ts'
import { canAfford, gatherResource, getNodeStatus, placeBuilding, tick } from './simulation.ts'
import type { Building, BuildingLevel, BuildableType, GameState, Resource, ResourceNode } from './types.ts'
import type { SoundKind } from './audio.ts'
import { PlanetWorld } from './world.ts'

interface Interaction {
  title: string
  detail: string
  key: string
}

export interface EngineEvents {
  onChange(): void
  onToast(message: string, kind?: 'success' | 'info' | 'error'): void
  onInteraction(prompt: Interaction | null): void
  onPlacement(message: string, valid: boolean): void
  onBuildChange(type: BuildableType | null): void
  onBuildMenuToggle(): void
  onEscape(): void
  onSettlementToggle(): void
  onOverviewChange(active: boolean): void
  onSound(kind: SoundKind): void
  onFatal(message: string): void
}

interface VillagerVisual {
  rig: CharacterRig
  normal: Vector3
  forward: Vector3
}

interface Particle {
  mesh: Mesh
  velocity: Vector3
  remaining: number
  duration: number
}

interface Drag {
  id: number
  x: number
  y: number
  startX: number
  startY: number
  button: number
  moved: boolean
}

export class GraphicsUnavailableError extends Error {}

export class GameEngine {
  readonly renderer: WebGLRenderer
  readonly world: PlanetWorld
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(48, 1, 0.1, 220)
  private readonly sun = new DirectionalLight(0xfff1d9, 3.3)
  private readonly ambient = new HemisphereLight(0xe4f4f5, 0x89a180, 2.4)
  private readonly player = createCharacterModel(0xdf865d, true)
  private readonly normal = new Vector3()
  private readonly forward = new Vector3()
  private readonly cameraForward = new Vector3()
  private readonly cameraUp = new Vector3(0, 1, 0)
  private readonly cameraTarget = new Vector3()
  private readonly buildings = new Map<string, { model: Group; level: BuildingLevel }>()
  private readonly villagers: VillagerVisual[] = []
  private readonly selection = new Group()
  private readonly selectionRing = createSelectionRing()
  private readonly keys = new Set<string>()
  private readonly pointer = new Vector2()
  private readonly raycaster = new Raycaster()
  private readonly abort = new AbortController()
  private readonly particles: Particle[] = []
  private readonly particleGeometry = new DodecahedronGeometry(0.07, 0)
  private readonly particleMaterials: Record<Resource, MeshBasicMaterial> = {
    wood: new MeshBasicMaterial({ color: 0xeac585 }),
    stone: new MeshBasicMaterial({ color: 0xc4d9de }),
    food: new MeshBasicMaterial({ color: 0xf9a4b4 }),
  }
  private readonly nodePositions: { node: ResourceNode; normal: Vector3 }[]
  private state: GameState
  private started = false
  private paused = false
  private interfaceOpen = false
  private failed = false
  private overview = false
  private distance = 43
  private targetDistance = 9
  private pitch = 0.44
  private altitude = 0
  private verticalSpeed = 0
  private movement = new Vector2()
  private gatherHeld = false
  private gatherCooldown = 0
  private gatherAnimation = 0
  private nearest: ResourceNode | null = null
  private selectedBuild: BuildableType | null = null
  private ghost: Group | null = null
  private ghostMaterial: MeshStandardMaterial | null = null
  private ghostNormal = new Vector3()
  private ghostRotation = 0
  private placementFromPointer = false
  private placementValid = false
  private placementMessage = ''
  private drag: Drag | null = null
  private lastTime = 0
  private visualTime = 0
  private uiTimer = 0
  private movingSpeed = 0
  private readonly canvas: HTMLCanvasElement
  private readonly events: EngineEvents

  constructor(
    canvas: HTMLCanvasElement,
    state: GameState,
    events: EngineEvents,
  ) {
    this.canvas = canvas
    this.events = events
    this.state = state
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' })
    if (!context) throw new GraphicsUnavailableError('Little Frontier needs WebGL 2. Enable hardware acceleration or try a current version of Chrome, Firefox, or Safari.')
    this.renderer = new WebGLRenderer({ canvas, context, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.scene.background = new Color(0xc6dfe0)
    this.scene.fog = new Fog(0xc6dfe0, 80, 165)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 110 })
    this.sun.shadow.normalBias = 0.06
    this.sun.shadow.bias = -0.00015
    this.scene.add(this.sun, this.sun.target, this.ambient)
    this.world = new PlanetWorld()
    this.nodePositions = this.world.nodes.map((node) => ({ node, normal: new Vector3(...node.normal) }))
    this.scene.add(this.world.root)
    this.player.root.scale.setScalar(0.88)
    this.scene.add(this.player.root)
    this.selection.add(this.selectionRing)
    this.selection.visible = false
    this.scene.add(this.selection)
    this.restorePlayer()
    this.syncBuildings()
    this.world.refreshResources(this.state)
    this.setupInput()
    this.resize()
    this.camera.position.copy(this.normal).multiplyScalar(PLANET_RADIUS + 45)
    this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  private restorePlayer(): void {
    this.normal.fromArray(this.state.player.normal)
    this.forward.fromArray(this.state.player.forward)
    this.cameraForward.copy(this.forward)
    this.cameraUp.copy(this.normal)
    this.cameraTarget.copy(surfacePoint(this.normal, 0.8))
    this.altitude = 0
    this.verticalSpeed = 0
  }

  start(): void {
    this.started = true
    this.paused = false
    this.canvas.focus({ preventScroll: true })
  }

  replaceState(state: GameState): void {
    this.state = state
    this.keys.clear()
    this.gatherHeld = false
    this.movement.set(0, 0)
    this.selectBuilding(null)
    for (const { model } of this.buildings.values()) {
      this.scene.remove(model)
      disposeModel(model)
    }
    this.buildings.clear()
    for (const villager of this.villagers) {
      this.scene.remove(villager.rig.root)
      disposeModel(villager.rig.root)
    }
    this.villagers.length = 0
    this.restorePlayer()
    this.overview = false
    this.targetDistance = 9
    this.events.onOverviewChange(false)
    this.syncBuildings()
    this.world.refreshResources(state)
    this.nearest = null
    this.events.onChange()
  }

  setPaused(paused: boolean): void {
    if (this.failed && !paused) return
    this.paused = paused
    this.clearInput()
    if (!paused && !this.interfaceOpen) this.canvas.focus({ preventScroll: true })
  }

  setInterfaceOpen(open: boolean): void {
    if (open !== this.interfaceOpen) {
      this.interfaceOpen = open
      this.clearInput()
    }
    if (!open && this.started && !this.paused && !this.failed) this.canvas.focus({ preventScroll: true })
  }

  setMovement(x: number, y: number): void {
    if (this.interfaceOpen || this.failed) return
    this.movement.set(x, y).clampLength(0, 1)
  }

  setGathering(held: boolean): void {
    if (held && (this.interfaceOpen || this.failed)) return
    this.gatherHeld = held
    if (held) this.gatherCooldown = 0
  }

  jump(): void {
    if (this.started && !this.paused && !this.interfaceOpen && !this.failed && this.altitude <= 0.001) this.verticalSpeed = 5.4
  }

  toggleOverview(): void {
    if (this.failed) return
    this.overview = !this.overview
    this.targetDistance = this.overview ? 43 : 9
    this.events.onOverviewChange(this.overview)
  }

  selectBuilding(type: BuildableType | null): void {
    if (this.failed && type !== null) return
    if (this.ghost) {
      this.scene.remove(this.ghost)
      disposeModel(this.ghost)
      this.ghost = null
      this.ghostMaterial?.dispose()
      this.ghostMaterial = null
    }
    this.selectedBuild = type
    this.placementFromPointer = false
    this.ghostRotation = 0
    if (type) {
      this.ghost = createBuildingModel(type)
      const ghostMaterial = new MeshStandardMaterial({
        color: 0x86d6bd, transparent: true, opacity: 0.57, flatShading: true, depthWrite: false, roughness: 1,
      })
      this.ghostMaterial = ghostMaterial
      this.ghost.traverse((object) => {
        if (object instanceof Mesh) {
          object.material = ghostMaterial
          object.castShadow = false
          object.receiveShadow = false
        }
      })
      const ring = createSelectionRing(0xfff1be, BUILDINGS[type].footprint)
      ring.position.y = 0.09
      this.ghost.add(ring)
      this.scene.add(this.ghost)
      this.updatePlacement()
    }
    this.events.onBuildChange(type)
    this.updateInteraction()
  }

  rotateBuilding(direction = 1): void {
    this.ghostRotation += direction * Math.PI / 4
    if (this.selectedBuild) this.updatePlacement()
  }

  placeSelected(): void {
    if (!this.selectedBuild || !this.started || this.paused) return
    this.updatePlacement()
    if (!this.placementValid) {
      this.events.onToast(this.placementMessage, 'error')
      return
    }
    const result = placeBuilding(this.state, this.selectedBuild, this.ghostNormal.toArray(), this.ghostRotation)
    if (!result.ok) {
      this.events.onToast(result.message, 'error')
      return
    }
    this.burst(this.ghostNormal, 'wood', 16)
    this.events.onToast(result.message, 'success')
    this.events.onSound('build')
    this.selectBuilding(null)
    this.syncBuildings()
    this.events.onChange()
  }

  syncBuildings(): void {
    for (const [id, { model }] of this.buildings) {
      if (!this.state.buildings.some((building) => building.id === id)) {
        this.scene.remove(model)
        disposeModel(model)
        this.buildings.delete(id)
      }
    }
    for (const building of this.state.buildings) {
      const existing = this.buildings.get(building.id)
      if (existing?.level === building.level) continue
      if (existing) {
        this.scene.remove(existing.model)
        disposeModel(existing.model)
      }
      const model = createBuildingModel(building.type, building.level)
      const normal = new Vector3(...building.normal)
      model.position.copy(surfacePoint(normal, 0.015))
      model.quaternion.copy(surfaceQuaternion(normal))
      model.rotateY(building.rotation)
      this.buildings.set(building.id, { model, level: building.level })
      this.scene.add(model)
    }
  }

  diagnostics(): {
    normal: number[]
    forward: number[]
    nearestNode: ResourceNode | null
    selectedBuild: BuildableType | null
    placementValid: boolean
    drawCalls: number
    triangles: number
    cameraDistance: number
    planetDistance: number
    overview: boolean
    buildingLevels: { id: string; level: BuildingLevel }[]
    started: boolean
    paused: boolean
    interfaceOpen: boolean
    altitude: number
  } {
    return {
      normal: this.normal.toArray(), forward: this.forward.toArray(),
      nearestNode: this.nearest ? structuredClone(this.nearest) : null,
      selectedBuild: this.selectedBuild, placementValid: this.placementValid,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      cameraDistance: this.distance,
      planetDistance: this.camera.position.length(), overview: this.overview,
      buildingLevels: Array.from(this.buildings, ([id, visual]) => ({ id, level: visual.level })),
      started: this.started, paused: this.paused,
      interfaceOpen: this.interfaceOpen, altitude: this.altitude,
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.abort.abort()
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.sun.shadow.dispose()
    this.renderer.dispose()
  }

  private setupInput(): void {
    const options = { signal: this.abort.signal }
    window.addEventListener('resize', () => this.resize(), options)
    window.addEventListener('blur', () => this.clearInput(), options)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInput()
      this.lastTime = 0
    }, options)
    window.addEventListener('keydown', (event) => {
      if (!this.started || this.failed || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (target instanceof HTMLElement && target.isContentEditable) return
      if (event.code === 'Escape') {
        if (event.repeat) {
          event.preventDefault()
          return
        }
        if (document.querySelector('dialog[open]')) return
        event.preventDefault()
        if (this.selectedBuild) this.selectBuilding(null)
        else this.events.onEscape()
        return
      }
      if (this.paused) return
      if (['KeyB', 'KeyT', 'KeyV', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
        if (event.repeat) return
        event.preventDefault()
        if (event.code === 'KeyB') this.events.onBuildMenuToggle()
        else if (event.code === 'KeyT') this.events.onSettlementToggle()
        else if (event.code === 'KeyV') this.toggleOverview()
        else {
          const type = BUILDABLE_TYPES[Number(event.code.slice(-1)) - 1]
          this.selectBuilding(this.selectedBuild === type ? null : type)
        }
        return
      }
      if (this.interfaceOpen) return
      const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']
      if (movementKeys.includes(event.code)) {
        event.preventDefault()
        this.keys.add(event.code)
      }
      if (event.repeat) return
      if (event.code === 'KeyE') {
        event.preventDefault()
        if (this.selectedBuild) this.placeSelected()
        else this.setGathering(true)
      } else if (event.code === 'Space') {
        if (target instanceof Element && target.closest('button, summary, a[href], [role="button"]')) return
        event.preventDefault()
        this.jump()
      } else if (event.code === 'KeyR' || event.code === 'KeyQ') {
        this.rotateBuilding(event.code === 'KeyQ' ? -1 : 1)
      }
    }, options)
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code)
      if (event.code === 'KeyE') this.gatherHeld = false
    }, options)
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options)
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.started || this.paused || this.failed || this.interfaceOpen || this.drag) return
      this.canvas.focus({ preventScroll: true })
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button, moved: false }
      this.canvas.setPointerCapture(event.pointerId)
      if (this.selectedBuild && event.button === 0) this.setPointer(event.clientX, event.clientY)
    }, options)
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.started || this.paused || this.failed || this.interfaceOpen) return
      if (this.drag && this.drag.id === event.pointerId) {
        const dx = event.clientX - this.drag.x
        const dy = event.clientY - this.drag.y
        const moved = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 5
        this.drag.moved ||= moved
        if (this.drag.moved) {
          this.cameraForward.applyAxisAngle(this.normal, -dx * 0.005)
          this.pitch = Math.max(0.17, Math.min(1.25, this.pitch + dy * 0.004))
        }
        this.drag.x = event.clientX
        this.drag.y = event.clientY
      } else if (this.selectedBuild) {
        this.setPointer(event.clientX, event.clientY)
      }
    }, options)
    const releasePointer = (event: PointerEvent) => {
      if (this.drag?.id !== event.pointerId) return
      const shouldPlace = !this.drag.moved && this.drag.button === 0 && event.type !== 'pointercancel'
      this.drag = null
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
      if (shouldPlace && this.selectedBuild) this.placeSelected()
    }
    this.canvas.addEventListener('pointerup', releasePointer, options)
    this.canvas.addEventListener('pointercancel', releasePointer, options)
    this.canvas.addEventListener('wheel', (event) => {
      if (!this.started || this.paused || this.failed || this.interfaceOpen) return
      event.preventDefault()
      this.targetDistance = Math.max(6.5, Math.min(48, this.targetDistance + event.deltaY * 0.015))
      const overview = this.targetDistance > 28
      if (overview !== this.overview) {
        this.overview = overview
        this.events.onOverviewChange(overview)
      }
    }, { ...options, passive: false })
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.failed = true
      this.setPaused(true)
      this.events.onFatal('The graphics context was lost. Reload this page to continue.')
    }, options)
  }

  private clearInput(): void {
    this.keys.clear()
    this.movement.set(0, 0)
    this.gatherHeld = false
    if (this.drag && this.canvas.hasPointerCapture(this.drag.id)) this.canvas.releasePointerCapture(this.drag.id)
    this.drag = null
  }

  private setPointer(x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
    this.placementFromPointer = true
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.far = Math.max(220, sphereFramingDistance(PLANET_RADIUS + 4, this.camera.fov, this.camera.aspect) + PLANET_RADIUS * 3)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private frame(timestamp: number): void {
    const delta = this.lastTime === 0 ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.25)
    this.lastTime = timestamp
    if (document.hidden || this.failed) return
    this.visualTime += delta
    const active = this.started && !this.paused
    if (active) {
      if (delta > 0) {
        const steps = Math.ceil(delta / 0.05)
        for (let step = 0; step < steps; step++) this.updatePlayer(delta / steps)
      }
      const simulationEvents = tick(this.state, delta)
      for (const event of simulationEvents) {
        this.events.onToast(event.message, event.kind === 'arrival' ? 'success' : 'info')
        if (event.kind === 'arrival') this.events.onSound('arrival')
      }
      this.gatherCooldown -= delta
      this.gatherAnimation = Math.max(0, this.gatherAnimation - delta)
      this.updateInteraction()
      if (this.gatherHeld && !this.selectedBuild && this.nearest && this.gatherCooldown <= 0) this.gather()
      if (this.selectedBuild) this.updatePlacement()
      this.uiTimer += delta
      if (this.uiTimer >= 0.25) {
        this.uiTimer = 0
        this.events.onChange()
        this.world.refreshResources(this.state)
      }
    }
    this.updateVillagers(active ? delta : 0)
    this.player.root.position.copy(surfacePoint(this.normal, this.altitude))
    this.player.root.quaternion.copy(surfaceQuaternion(this.normal, this.forward))
    if (!this.paused) animateCharacter(this.player, this.visualTime, active ? this.movingSpeed / 3.5 : 0, this.gatherAnimation)
    this.updateCamera(delta)
    this.updateLighting()
    if (!this.paused) {
      this.world.animate(this.visualTime)
      this.updateParticles(delta)
      const flame = this.buildings.get('hearth')?.model.getObjectByName('flame')
      if (flame) {
        flame.scale.set(1 + Math.sin(this.visualTime * 9) * 0.08, 1 + Math.sin(this.visualTime * 13) * 0.13, 1)
        flame.rotation.y = this.visualTime * 0.35
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  private updatePlayer(delta: number): void {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
      - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.movement.x
    const y = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
      - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) + this.movement.y
    const right = new Vector3().crossVectors(this.cameraForward, this.normal).normalize()
    const direction = this.cameraForward.clone().multiplyScalar(y).addScaledVector(right, x)
    const inputLength = Math.hypot(x, y)
    const inputStrength = Math.min(1, inputLength)
    this.movingSpeed = 0
    if (direction.lengthSq() > 0.001) {
      direction.normalize()
      const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      const topSpeed = (sprint ? 5.8 : 3.6) * (isWater(this.normal) ? 0.52 : 1)
      const speed = topSpeed * inputStrength
      let moved = advanceOnSphere(this.normal, direction, speed * delta)
      if (this.collides(moved.normal)) {
        let accepted = false
        const scale = Math.max(1, inputLength)
        for (const component of [this.cameraForward.clone().multiplyScalar(y / scale), right.clone().multiplyScalar(x / scale)]) {
          if (component.lengthSq() < 0.001) continue
          const alternative = advanceOnSphere(this.normal, component, topSpeed * delta * component.length())
          if (!this.collides(alternative.normal)) {
            moved = alternative
            direction.copy(component).normalize()
            accepted = true
            break
          }
        }
        if (!accepted) moved = { normal: this.normal.clone(), transport: new Quaternion() }
      }
      this.movingSpeed = surfaceDistance(this.normal, moved.normal) / Math.max(delta, 0.0001)
      this.normal.copy(moved.normal)
      this.cameraForward.applyQuaternion(moved.transport).projectOnPlane(this.normal).normalize()
      this.forward.applyQuaternion(moved.transport)
      const desiredForward = direction.applyQuaternion(moved.transport).projectOnPlane(this.normal).normalize()
      const turn = Math.atan2(new Vector3().crossVectors(this.forward, desiredForward).dot(this.normal), this.forward.dot(desiredForward))
      this.forward.applyAxisAngle(this.normal, turn * (1 - Math.exp(-delta * 14))).projectOnPlane(this.normal).normalize()
    }
    if (this.altitude > 0 || this.verticalSpeed > 0) {
      this.verticalSpeed -= 15 * delta
      this.altitude += this.verticalSpeed * delta
      if (this.altitude < 0) {
        this.altitude = 0
        this.verticalSpeed = 0
      }
    }
    this.state.player.normal = this.normal.toArray()
    this.state.player.forward = this.forward.toArray()
  }

  private collides(normal: Vector3): boolean {
    for (const building of this.state.buildings) {
      const radius = BUILDINGS[building.type].footprint * (building.type === 'hearth' ? 0.65 : 0.86) + 0.22
      if (normal.dot(new Vector3(...building.normal)) > Math.cos(radius / PLANET_RADIUS)) return true
    }
    if (this.altitude > 0.65) return false
    for (const { node, normal: nodeNormal } of this.nodePositions) {
      if (node.kind === 'berries') continue
      if (node.kind === 'rock' && getNodeStatus(this.state, node).remaining === 0) continue
      const radius = node.kind === 'tree' ? 0.36 : 0.61 * node.scale
      if (normal.dot(nodeNormal) > Math.cos(radius / PLANET_RADIUS)) return true
    }
    return false
  }

  private updateCamera(delta: number): void {
    const smoothing = 1 - Math.exp(-delta * 4)
    const desired = new Vector3()
    const framingDistance = sphereFramingDistance(PLANET_RADIUS + 4, this.camera.fov, this.camera.aspect)
    if (!this.started) {
      const angle = this.visualTime * 0.045 + 0.42
      desired.set(Math.sin(angle) * 28, 50, Math.cos(angle) * 35)
      desired.setLength(Math.max(desired.length(), framingDistance))
      this.cameraTarget.set(this.camera.aspect > 1 ? -7 : 0, 0, 0)
      this.cameraUp.set(0, 1, 0)
    } else {
      this.distance += (this.targetDistance - this.distance) * smoothing
      const overviewBlend = Math.max(0, Math.min(1, (this.distance - 15) / 25))
      const target = surfacePoint(this.normal, 0.85).multiplyScalar(1 - overviewBlend)
      this.cameraTarget.lerp(target, smoothing)
      const pitch = this.pitch + overviewBlend * 0.2
      desired.copy(surfacePoint(this.normal, 1.2))
        .addScaledVector(this.cameraForward, -Math.cos(pitch) * this.distance)
        .addScaledVector(this.normal, Math.sin(pitch) * this.distance)
      const framedDistance = Math.max(desired.length(), framingDistance * Math.max(1, this.distance / 43))
      desired.setLength(desired.length() * (1 - overviewBlend) + framedDistance * overviewBlend)
      this.cameraUp.lerp(this.normal, 1 - Math.exp(-delta * 8)).normalize()
    }
    this.camera.position.lerp(desired, this.started ? 1 - Math.exp(-delta * 8) : 1)
    const cameraNormal = this.camera.position.clone().normalize()
    const minRadius = surfaceRadius(cameraNormal) + 1
    if (this.camera.position.length() < minRadius) this.camera.position.copy(cameraNormal).multiplyScalar(minRadius)
    this.camera.up.copy(this.cameraUp)
    this.camera.lookAt(this.cameraTarget)
  }

  private updateLighting(): void {
    const phase = this.state.time / DAY_LENGTH * Math.PI * 2
    const daylight = Math.max(0, Math.min(1, Math.cos(phase - 0.4) * 1.4 + 0.4))
    const sky = new Color(0x536b86).lerp(new Color(0xc6dfe0), daylight)
    if (this.scene.background instanceof Color) this.scene.background.copy(sky)
    if (this.scene.fog instanceof Fog) {
      this.scene.fog.color.copy(sky)
      this.scene.fog.near = Math.max(80, this.camera.position.length() + 35)
      this.scene.fog.far = this.scene.fog.near + 85
    }
    this.ambient.intensity = 1.3 + daylight * 1.1
    this.sun.intensity = 0.8 + daylight * 2.5
    const right = new Vector3().crossVectors(this.cameraForward, this.normal).normalize()
    this.sun.position.copy(this.normal).multiplyScalar(PLANET_RADIUS + 35)
      .addScaledVector(right, -22).addScaledVector(this.cameraForward, -15)
    this.sun.target.position.copy(this.normal).multiplyScalar(PLANET_RADIUS)
  }

  private updateInteraction(): void {
    if (this.selectedBuild || !this.started) {
      this.selection.visible = false
      this.events.onInteraction(null)
      return
    }
    let closest: ResourceNode | null = null
    let nearestDistance = 2.5
    let depleted: ResourceNode | null = null
    let depletedDistance = 2.5
    for (const { node, normal } of this.nodePositions) {
      const distance = surfaceDistance(this.normal, normal)
      if (distance > 2.5) continue
      if (getNodeStatus(this.state, node).remaining > 0) {
        if (distance < nearestDistance) {
          closest = node
          nearestDistance = distance
        }
      } else if (distance < depletedDistance) {
        depleted = node
        depletedDistance = distance
      }
    }
    this.nearest = closest ?? depleted
    if (!this.nearest) {
      this.selection.visible = false
      this.events.onInteraction(null)
      return
    }
    const definition = NODE_DEFINITIONS[this.nearest.kind]
    const status = getNodeStatus(this.state, this.nearest)
    const normal = new Vector3(...this.nearest.normal)
    this.selection.position.copy(surfacePoint(normal, 0.055))
    this.selection.quaternion.copy(surfaceQuaternion(normal))
    this.selection.scale.setScalar(this.nearest.kind === 'tree' ? 1 : 0.85)
    this.selection.visible = true
    this.events.onInteraction({
      key: 'E',
      title: status.remaining > 0 ? definition.action : 'Growing back',
      detail: status.remaining > 0
        ? `${definition.name} / ${status.remaining} harvest${status.remaining === 1 ? '' : 's'} left`
        : `Ready in ${Math.ceil(status.secondsUntilRegrowth)}s. Try another nearby resource.`,
    })
  }

  private gather(): void {
    if (!this.nearest) return
    this.gatherCooldown = 0.68
    const result = gatherResource(this.state, this.nearest)
    if (result.ok && result.resource) {
      this.gatherAnimation = 0.55
      this.burst(new Vector3(...this.nearest.normal), result.resource, 9)
      this.events.onToast(`+${result.amount} ${result.resource}`, 'success')
      this.events.onSound('gather')
      this.world.refreshResources(this.state)
      this.events.onChange()
    } else {
      this.gatherCooldown = 2
      this.events.onToast(result.message, 'info')
    }
  }

  private updatePlacement(): void {
    if (!this.selectedBuild || !this.ghost || !this.ghostMaterial) return
    let hasGround = true
    if (this.placementFromPointer) {
      this.raycaster.setFromCamera(this.pointer, this.camera)
      const point = new Vector3()
      const sphere = new Sphere(new Vector3(), PLANET_RADIUS + 1.4)
      const hit = this.raycaster.ray.intersectSphere(sphere, point)
      if (hit) {
        this.ghostNormal.copy(point).normalize()
        for (let i = 0; i < 3; i++) {
          sphere.radius = surfaceRadius(this.ghostNormal)
          if (!this.raycaster.ray.intersectSphere(sphere, point)) break
          this.ghostNormal.copy(point).normalize()
        }
      } else {
        hasGround = false
      }
    } else {
      const right = new Vector3().crossVectors(this.cameraForward, this.normal).normalize()
      const direction = this.cameraForward.clone().multiplyScalar(0.45).addScaledVector(right, 0.89).normalize()
      this.ghostNormal.copy(advanceOnSphere(this.normal, direction, 4.6).normal)
    }
    this.placementMessage = hasGround ? this.validatePlacement(this.selectedBuild, this.ghostNormal) : 'Point at the ground near your explorer.'
    this.placementValid = this.placementMessage === ''
    this.ghost.visible = hasGround
    this.ghost.position.copy(surfacePoint(this.ghostNormal, 0.045))
    this.ghost.quaternion.copy(surfaceQuaternion(this.ghostNormal))
    this.ghost.rotateY(this.ghostRotation)
    this.ghostMaterial.color.setHex(this.placementValid ? 0x8bdfb6 : 0xf39b87)
    this.events.onPlacement(this.placementMessage || 'A lovely spot. Place your building here.', this.placementValid)
  }

  private validatePlacement(type: BuildableType, normal: Vector3): string {
    const definition = BUILDINGS[type]
    if (surfaceDistance(this.normal, normal) > 9) return 'Move closer. Build within 9 steps of your explorer.'
    if (isWater(normal)) return 'Find a dry patch of land for this building.'
    if (!canAfford(this.state.resources, definition.cost)) {
      const missing = (['wood', 'stone', 'food'] as const)
        .filter((resource) => this.state.resources[resource] < definition.cost[resource])
        .map((resource) => `${Math.ceil(definition.cost[resource] - this.state.resources[resource])} ${resource}`)
      return `Gather ${missing.join(' and ')} first.`
    }
    for (const building of this.state.buildings) {
      if (surfaceDistance(normal, new Vector3(...building.normal)) < definition.footprint + BUILDINGS[building.type].footprint + 0.35) {
        return 'Leave a little more room between buildings.'
      }
    }
    for (const { node, normal: nodeNormal } of this.nodePositions) {
      const clearance = definition.footprint + (node.kind === 'tree' ? 0.8 : 0.65)
      if (surfaceDistance(normal, nodeNormal) < clearance) return 'Choose a clearing away from trees, rocks, and berry bushes.'
    }
    if (surfaceDistance(normal, this.normal) < definition.footprint + 0.6) return 'Take a step back to leave room for your explorer.'
    return ''
  }

  private updateVillagers(delta: number): void {
    const colors = [0xeac876, 0x8baec7, 0xd79188, 0x879b71, 0xcbabc5, 0x78afa1]
    while (this.villagers.length < this.state.population) {
      const index = this.villagers.length
      const rig = createCharacterModel(colors[index % colors.length])
      rig.root.scale.setScalar(0.7)
      const hearth = new Vector3(...HEARTH_NORMAL)
      const normal = advanceOnSphere(hearth, tangentForward(hearth).applyAxisAngle(hearth, index * 2.4), 2.2).normal
      this.villagers.push({ rig, normal, forward: tangentForward(normal) })
      this.scene.add(rig.root)
    }
    const jobs: Building[] = []
    for (const building of this.state.buildings) {
      for (let worker = 0; worker < building.workers; worker++) jobs.push(building)
    }
    this.villagers.forEach((villager, index) => {
      const job = jobs[index]
      const anchor = new Vector3(...(job?.normal ?? HEARTH_NORMAL))
      const phase = this.state.time * (job ? 0.12 : 0.08) + index * 2.399
      const direction = tangentForward(anchor).applyAxisAngle(anchor, phase)
      const destination = advanceOnSphere(anchor, direction, job ? 1.9 : 2.6 + index % 2).normal
      const distance = surfaceDistance(villager.normal, destination)
      if (distance > 0.02 && delta > 0) {
        const heading = destination.clone().projectOnPlane(villager.normal).normalize()
        const moved = advanceOnSphere(villager.normal, heading, Math.min(distance, delta * 0.85))
        villager.normal.copy(moved.normal)
        villager.forward.copy(heading).applyQuaternion(moved.transport).projectOnPlane(villager.normal).normalize()
      }
      villager.rig.root.position.copy(surfacePoint(villager.normal))
      villager.rig.root.quaternion.copy(surfaceQuaternion(villager.normal, villager.forward))
      if (delta > 0 || !this.started) animateCharacter(villager.rig, this.visualTime + index, distance > 0.1 ? 0.65 : 0, job && distance < 0.25 ? this.visualTime % 0.55 : 0)
    })
  }

  private burst(normal: Vector3, resource: Resource, count: number): void {
    for (let i = 0; i < count && this.particles.length < 64; i++) {
      const mesh = new Mesh(this.particleGeometry, this.particleMaterials[resource])
      mesh.position.copy(surfacePoint(normal, 0.8))
      const tangent = tangentForward(normal).applyAxisAngle(normal, Math.random() * Math.PI * 2)
      const duration = 0.6 + Math.random() * 0.4
      const velocity = normal.clone().multiplyScalar(1.3 + Math.random() * 1.5).addScaledVector(tangent, 0.5 + Math.random() * 2)
      this.particles.push({ mesh, velocity, remaining: duration, duration })
      this.scene.add(mesh)
    }
  }

  private updateParticles(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]
      particle.remaining -= delta
      if (particle.remaining <= 0) {
        this.scene.remove(particle.mesh)
        this.particles.splice(index, 1)
      } else {
        particle.velocity.addScaledVector(particle.mesh.position.clone().normalize(), -4 * delta)
        particle.mesh.position.addScaledVector(particle.velocity, delta)
        particle.mesh.scale.setScalar(particle.remaining / particle.duration)
        particle.mesh.rotation.x += delta * 3
      }
    }
  }
}
