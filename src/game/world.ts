import {
  BackSide, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry,
  DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HEARTH_NORMAL, PLANET_RADIUS, WATER_LEVEL } from './config.ts'
import { isWater, mapNormal, seededRandom, surfaceDistance, surfacePoint, surfaceQuaternion, terrainHeight } from './math.ts'
import type { GameState, NodeKind, ResourceNode } from './types.ts'
import { getNodeStatus } from './simulation.ts'

interface NodeVisual {
  mesh: InstancedMesh
  base: InstancedMesh | null
  index: number
  matrix: Matrix4
  depleted: boolean
}

function merged(geometries: BufferGeometry[]): BufferGeometry {
  const result = mergeGeometries(geometries)
  if (!result) throw new Error('The scenery geometry could not be created.')
  geometries.forEach((geometry) => geometry.dispose())
  return result
}

function shaded(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, flatShading: true, roughness: 1 })
}

export class PlanetWorld {
  readonly root = new Group()
  readonly nodes: ResourceNode[] = []
  readonly terrain: Mesh
  private readonly nodeVisuals = new Map<string, NodeVisual>()
  private readonly clouds = new Group()
  private readonly random = seededRandom(72819)

  constructor() {
    this.root.name = 'Meadow planet'
    this.terrain = this.createTerrain()
    this.root.add(this.terrain)
    this.createWater()
    this.generateNodes()
    this.createResources()
    this.createGroundCover()
    this.createCampPath()
    this.createClouds()
  }

  private createTerrain(): Mesh {
    const geometry = new SphereGeometry(1, 112, 72).toNonIndexed()
    const position = geometry.getAttribute('position')
    const normal = new Vector3()
    const face = new Vector3()
    const colors = new Float32Array(position.count * 3)
    const color = new Color()
    const meadow = new Color(0x91bd69)
    const forest = new Color(0x6aa579)
    const sand = new Color(0xe9d4a0)
    for (let i = 0; i < position.count; i++) {
      normal.fromBufferAttribute(position, i).normalize()
      normal.multiplyScalar(PLANET_RADIUS + terrainHeight(normal))
      position.setXYZ(i, normal.x, normal.y, normal.z)
    }
    for (let i = 0; i < position.count; i += 3) {
      face.set(0, 0, 0)
      for (let vertex = 0; vertex < 3; vertex++) face.add(normal.fromBufferAttribute(position, i + vertex))
      face.normalize()
      const height = terrainHeight(face)
      if (height < WATER_LEVEL + 0.13) {
        color.copy(sand)
      } else {
        const mix = Math.max(0, Math.min(1, (Math.sin(face.x * 8 + face.z * 5) + 0.5) * 0.27))
        color.copy(meadow).lerp(forest, mix)
        if (height > 0.76) color.lerp(new Color(0xbed08d), (height - 0.76) * 0.7)
      }
      color.multiplyScalar(0.96 + this.random() * 0.08)
      for (let vertex = 0; vertex < 3; vertex++) {
        const index = (i + vertex) * 3
        colors[index] = color.r
        colors[index + 1] = color.g
        colors[index + 2] = color.b
      }
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }))
    mesh.receiveShadow = true
    return mesh
  }

  private createWater(): void {
    const water = new Mesh(
      new SphereGeometry(PLANET_RADIUS + WATER_LEVEL, 96, 64),
      new MeshStandardMaterial({ color: 0x69cbd0, roughness: 0.38, metalness: 0.04, flatShading: true }),
    )
    water.receiveShadow = true
    this.root.add(water)
    const atmosphere = new Mesh(
      new SphereGeometry(PLANET_RADIUS + 0.8, 48, 32),
      new MeshBasicMaterial({ color: 0xb3f1db, side: BackSide, transparent: true, opacity: 0.1, depthWrite: false }),
    )
    this.root.add(atmosphere)
    const geometry = new CylinderGeometry(0.16, 0.16, 0.008, 8)
    const glints = new InstancedMesh(geometry, new MeshBasicMaterial({ color: 0xd4f5e9, transparent: true, opacity: 0.5 }), 150)
    const dummy = new Object3D()
    let count = 0
    for (let attempt = 0; attempt < 1800 && count < 150; attempt++) {
      const normal = this.randomNormal()
      if (!isWater(normal)) continue
      dummy.position.copy(normal).multiplyScalar(PLANET_RADIUS + WATER_LEVEL + 0.012)
      dummy.quaternion.copy(surfaceQuaternion(normal))
      dummy.scale.set(0.8 + this.random() * 2, 1, 0.13 + this.random() * 0.4)
      dummy.updateMatrix()
      glints.setMatrixAt(count++, dummy.matrix)
    }
    glints.count = count
    this.root.add(glints)
  }

  private randomNormal(random = this.random): Vector3 {
    const y = 1 - 2 * random()
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(1 - y * y)
    return new Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  }

  private generateNodes(): void {
    // Keep gameplay placements stable when decorative geometry changes.
    const random = seededRandom(19381)
    const add = (kind: NodeKind, normal: Vector3, scale: number) => {
      this.nodes.push({ id: `${kind}-${this.nodes.length}`, kind, normal: normal.toArray(), scale })
    }
    add('tree', mapNormal(-2.5, -2.4), 1.05)
    add('rock', mapNormal(2.1, 1.1), 0.92)
    add('berries', mapNormal(-1.5, 1.45), 1)
    add('tree', mapNormal(6.7, -5.6), 1.12)
    add('tree', mapNormal(-6.7, -6.5), 1.05)
    add('rock', mapNormal(7, 1), 1.06)
    add('berries', mapNormal(-6.6, 2.4), 1)
    const hearth = new Vector3(...HEARTH_NORMAL)
    const other = new Vector3()
    const counts: [NodeKind, number][] = [['tree', 126], ['rock', 42], ['berries', 38]]
    for (const [kind, count] of counts) {
      let placed = 0
      for (let attempt = 0; placed < count && attempt < 9000; attempt++) {
        const normal = this.randomNormal(random)
        if (terrainHeight(normal) < WATER_LEVEL + 0.2) continue
        if (normal.y > 0.92 || surfaceDistance(normal, hearth) < 5.3) continue
        const clearance = kind === 'tree' ? 2.3 : 1.8
        if (this.nodes.some((node) => surfaceDistance(normal, other.fromArray(node.normal)) < clearance)) continue
        add(kind, normal, 0.8 + random() * 0.45)
        placed++
      }
    }
  }

  private createResources(): void {
    const trunkGeometry = new CylinderGeometry(0.12, 0.2, 1.45, 5).translate(0, 0.67, 0)
    const foliageGeometry = merged([
      new DodecahedronGeometry(0.89, 0).scale(1, 0.83, 1).translate(0, 1.94, 0),
      new DodecahedronGeometry(0.63, 0).scale(1, 0.95, 1).translate(-0.48, 1.62, 0.15),
      new DodecahedronGeometry(0.64, 0).translate(0.41, 1.68, -0.08),
    ])
    const rockGeometry = new DodecahedronGeometry(0.7, 0).scale(1, 0.69, 0.86).translate(0, 0.37, 0)
    const bushGeometry = merged([
      new DodecahedronGeometry(0.5, 0).scale(1.2, 0.9, 1).translate(0, 0.43, 0),
      new DodecahedronGeometry(0.35, 0).translate(0.3, 0.35, 0.1),
    ])
    const berriesGeometry = merged(Array.from({ length: 9 }, (_, i) => {
      const angle = i * 2.4
      return new DodecahedronGeometry(0.075, 0).translate(
        Math.sin(angle) * 0.4, 0.52 + Math.sin(i * 1.7) * 0.15, Math.cos(angle) * 0.33,
      )
    }))
    const trunkMaterial = shaded(0x93754c)
    const treeMaterial = shaded(0xffffff)
    const rockMaterial = shaded(0xffffff)
    const bushMaterial = shaded(0x63996a)
    const berryMaterial = shaded(0xe384a2)
    const dummy = new Object3D()
    const color = new Color()

    for (const kind of ['tree', 'rock', 'berries'] as const) {
      const nodes = this.nodes.filter((node) => node.kind === kind)
      const mainGeometry = kind === 'tree' ? foliageGeometry : kind === 'rock' ? rockGeometry : berriesGeometry
      const mainMaterial = kind === 'tree' ? treeMaterial : kind === 'rock' ? rockMaterial : berryMaterial
      const main = new InstancedMesh(mainGeometry, mainMaterial, nodes.length)
      main.instanceMatrix.setUsage(DynamicDrawUsage)
      main.castShadow = true
      main.receiveShadow = true
      const base = kind === 'rock' ? null : new InstancedMesh(
        kind === 'tree' ? trunkGeometry : bushGeometry,
        kind === 'tree' ? trunkMaterial : bushMaterial,
        nodes.length,
      )
      if (base) {
        base.castShadow = true
        base.receiveShadow = true
        this.root.add(base)
      }
      nodes.forEach((node, index) => {
        const normal = new Vector3(...node.normal)
        dummy.position.copy(surfacePoint(normal, -0.01))
        dummy.quaternion.copy(surfaceQuaternion(normal))
        dummy.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.random() * Math.PI * 2))
        dummy.scale.setScalar(node.scale)
        dummy.updateMatrix()
        main.setMatrixAt(index, dummy.matrix)
        base?.setMatrixAt(index, dummy.matrix)
        if (kind === 'tree') {
          const colors = [0x70aa64, 0x9ec766, 0x68a986, 0xadc966, 0x72b17a, 0xd5c976]
          color.setHex(colors[Math.floor(this.random() * colors.length)])
        } else if (kind === 'rock') {
          color.setHex(this.random() > 0.4 ? 0xa2b2b4 : 0x879da5)
        } else {
          color.setHex(0xffffff)
        }
        main.setColorAt(index, color)
        this.nodeVisuals.set(node.id, { mesh: main, base, index, matrix: dummy.matrix.clone(), depleted: false })
      })
      main.computeBoundingSphere()
      base?.computeBoundingSphere()
      this.root.add(main)
    }
  }

  refreshResources(state: GameState): void {
    const scale = new Matrix4()
    for (const node of this.nodes) {
      const visual = this.nodeVisuals.get(node.id)
      if (!visual) continue
      const depleted = getNodeStatus(state, node).remaining === 0
      if (depleted === visual.depleted) continue
      visual.depleted = depleted
      scale.makeScale(depleted ? 0 : 1, depleted ? 0 : 1, depleted ? 0 : 1)
      visual.mesh.setMatrixAt(visual.index, visual.matrix.clone().multiply(scale))
      visual.mesh.instanceMatrix.needsUpdate = true
      if (node.kind === 'tree' && visual.base) {
        scale.makeScale(1, depleted ? 0.18 : 1, 1)
        visual.base.setMatrixAt(visual.index, visual.matrix.clone().multiply(scale))
        visual.base.instanceMatrix.needsUpdate = true
      }
    }
  }

  private createGroundCover(): void {
    const grassGeometry = merged([
      new ConeGeometry(0.09, 0.35, 3).translate(0, 0.15, 0),
      new ConeGeometry(0.065, 0.25, 3).rotateZ(-0.35).translate(0.095, 0.13, 0),
    ])
    const grass = new InstancedMesh(grassGeometry, shaded(0xffffff), 2400)
    const flowers = new InstancedMesh(
      new DodecahedronGeometry(0.065, 0).translate(0, 0.26, 0),
      shaded(0xffffff), 280,
    )
    const dummy = new Object3D()
    const color = new Color()
    let count = 0
    let flowerCount = 0
    for (let attempt = 0; attempt < 16000 && count < 2400; attempt++) {
      const normal = this.randomNormal()
      if (terrainHeight(normal) < WATER_LEVEL + 0.16) continue
      if (surfaceDistance(normal, new Vector3(...HEARTH_NORMAL)) < 1.6) continue
      dummy.position.copy(surfacePoint(normal, -0.04))
      dummy.quaternion.copy(surfaceQuaternion(normal))
      dummy.rotateY(this.random() * Math.PI * 2)
      dummy.scale.setScalar(0.6 + this.random() * 0.7)
      dummy.updateMatrix()
      grass.setMatrixAt(count, dummy.matrix)
      grass.setColorAt(count, color.setHex(this.random() > 0.45 ? 0x769e58 : 0xaccd78))
      if (flowerCount < 280 && this.random() > 0.65) {
        flowers.setMatrixAt(flowerCount, dummy.matrix)
        flowers.setColorAt(flowerCount, color.setHex([0xffefb0, 0xe997b5, 0xffe4cb][flowerCount % 3]))
        flowerCount++
      }
      count++
    }
    grass.count = count
    flowers.count = flowerCount
    this.root.add(grass, flowers)
  }

  private createCampPath(): void {
    const stones = new InstancedMesh(
      new CylinderGeometry(0.24, 0.26, 0.045, 6),
      shaded(0xd4c9a5), 11,
    )
    const dummy = new Object3D()
    for (let i = 0; i < 11; i++) {
      const normal = mapNormal(Math.sin(i * 2.7) * 0.28, -0.7 - i * 0.35)
      dummy.position.copy(surfacePoint(normal, 0.025))
      dummy.quaternion.copy(surfaceQuaternion(normal))
      dummy.scale.set(0.7 + this.random() * 0.5, 1, 0.75)
      dummy.rotateY(i)
      dummy.updateMatrix()
      stones.setMatrixAt(i, dummy.matrix)
    }
    stones.receiveShadow = true
    this.root.add(stones)
  }

  private createClouds(): void {
    const geometry = merged([
      new DodecahedronGeometry(0.9, 1).translate(0, 0.1, 0),
      new DodecahedronGeometry(0.73, 1).translate(-0.83, -0.12, 0.02),
      new DodecahedronGeometry(0.73, 1).translate(0.75, -0.1, 0),
      new DodecahedronGeometry(0.5, 1).translate(1.32, -0.18, 0),
    ])
    const mat = new MeshStandardMaterial({ color: 0xfffcf1, roughness: 1, flatShading: true, transparent: true, opacity: 0.9 })
    for (let i = 0; i < 13; i++) {
      const normal = this.randomNormal()
      if (normal.y > 0.75) normal.y *= -1
      const cloud = new Mesh(geometry, mat)
      cloud.position.copy(normal).multiplyScalar(PLANET_RADIUS + 4.5 + this.random() * 2)
      cloud.quaternion.copy(surfaceQuaternion(normal))
      cloud.scale.set(1.9 + this.random(), 0.58, 0.9)
      this.clouds.add(cloud)
    }
    this.root.add(this.clouds)
  }

  animate(time: number): void {
    this.clouds.rotation.y = time * 0.003
    this.clouds.rotation.z = Math.sin(time * 0.01) * 0.035
  }
}
