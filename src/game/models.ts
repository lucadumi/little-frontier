import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry,
  Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PointLight, SphereGeometry, TorusGeometry,
} from 'three'
import type { Material } from 'three'
import type { BuildingLevel, BuildingType } from './types.ts'

const material = (color: number) => new MeshStandardMaterial({ color, roughness: 1, flatShading: true })
const palette = {
  wood: material(0xa77449),
  timber: material(0x704e37),
  cutWood: material(0xe0b980),
  plaster: material(0xffe5b7),
  roof: material(0xd77954),
  roofEdge: material(0xaa523e),
  teal: material(0x559888),
  stone: material(0x9eaead),
  foundation: material(0xc3bba3),
  soil: material(0x815e43),
  leaf: material(0x72a74f),
  carrot: material(0xf5a046),
  pink: material(0xde7892),
  metal: material(0x537476),
  window: new MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc369, emissiveIntensity: 0.55, roughness: 0.7 }),
}

function addMesh(parent: Group, geometry: BufferGeometry, mat: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geometry, mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function box(parent: Group, width: number, height: number, depth: number, x: number, y: number, z: number, mat: Material): Mesh {
  return addMesh(parent, new BoxGeometry(width, height, depth), mat, x, y, z)
}

function roofGeometry(width: number, height: number, depth: number): BufferGeometry {
  const w = width / 2
  const d = depth / 2
  const a = [-w, 0, -d], b = [w, 0, -d], c = [0, height, -d]
  const e = [-w, 0, d], f = [w, 0, d], g = [0, height, d]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([
    ...a, ...c, ...b, ...e, ...f, ...g,
    ...a, ...e, ...g, ...a, ...g, ...c,
    ...b, ...c, ...g, ...b, ...g, ...f,
    ...a, ...b, ...f, ...a, ...f, ...e,
  ], 3))
  geometry.computeVertexNormals()
  return geometry
}

function fence(parent: Group, length: number, x: number, z: number, rotation = 0): void {
  const group = new Group()
  for (const side of [-1, 1]) {
    box(group, 0.1, 0.58, 0.1, side * length / 2, 0.36, 0, palette.cutWood)
  }
  box(group, length, 0.07, 0.065, 0, 0.34, 0, palette.wood)
  box(group, length, 0.07, 0.065, 0, 0.55, 0, palette.wood)
  group.position.set(x, 0, z)
  group.rotation.y = rotation
  parent.add(group)
}

function log(parent: Group, x: number, y: number, z: number, length = 1.2): void {
  const bark = addMesh(parent, new CylinderGeometry(0.15, 0.16, length, 7), palette.timber, x, y, z)
  bark.rotation.z = Math.PI / 2
  for (const side of [-1, 1]) {
    const end = addMesh(parent, new CylinderGeometry(0.125, 0.125, 0.015, 7), palette.cutWood, x + side * length / 2, y, z)
    end.rotation.z = Math.PI / 2
  }
}

function flowerBox(parent: Group, x: number, z: number): void {
  box(parent, 0.62, 0.2, 0.28, x, 0.2, z, palette.wood)
  for (let i = 0; i < 3; i++) {
    addMesh(parent, new DodecahedronGeometry(0.17, 0), palette.leaf, x - 0.2 + i * 0.2, 0.38, z)
    addMesh(parent, new DodecahedronGeometry(0.085, 0), palette.pink, x - 0.2 + i * 0.2, 0.51, z - 0.02)
  }
}

function createBaseBuildingModel(type: BuildingType, level: BuildingLevel): Group {
  const root = new Group()
  root.name = type
  if (type === 'hearth') {
    addMesh(root, new CylinderGeometry(1.2, 1.28, 0.09, 12), palette.soil, 0, 0.03, 0)
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2
      const stone = addMesh(root, new DodecahedronGeometry(0.23, 0), palette.stone, Math.cos(angle) * 0.55, 0.16, Math.sin(angle) * 0.55)
      stone.scale.y = 0.7
    }
    log(root, 0, 0.19, -0.09, 0.8)
    log(root, 0, 0.25, 0.12, 0.7)
    const fire = new Group()
    fire.name = 'flame'
    addMesh(fire, new ConeGeometry(0.29, 0.8, 5), new MeshBasicMaterial({ color: 0xffa94d }), 0, 0.56, 0)
    addMesh(fire, new ConeGeometry(0.17, 0.63, 5), new MeshBasicMaterial({ color: 0xffed96 }), 0.05, 0.5, -0.1)
    root.add(fire)
    const light = new PointLight(0xffb565, 5, 7, 2)
    light.position.y = 0.8
    root.add(light)
    for (const side of [-1, 1]) {
      box(root, 0.28, 0.34, 1.25, side * 1, 0.25, 0, palette.wood)
    }
    box(root, 0.06, 2.4, 0.06, 0.85, 1.2, 0.8, palette.timber)
    box(root, 0.55, 0.52, 0.035, 1.08, 2.02, 0.8, palette.teal)
    box(root, 0.18, 0.18, 0.045, 1.08, 2.02, 0.775, palette.plaster).rotation.z = Math.PI / 4
    return root
  }

  const foundation = addMesh(root, new CylinderGeometry(1.4, 1.48, 0.14, 8), palette.foundation, 0, 0.055, 0)
  foundation.rotation.y = Math.PI / 8

  if (type === 'cottage') {
    const loft = (level - 1) * 0.38
    box(root, 1.8, 1.35 + loft, 1.55, 0, 0.82 + loft / 2, 0, palette.plaster)
    for (const x of [-0.84, 0.84]) {
      for (const z of [-0.74, 0.74]) box(root, 0.09, 1.38 + loft, 0.09, x, 0.83 + loft / 2, z, palette.wood)
    }
    box(root, 1.85, 0.09, 1.6, 0, 1.45 + loft, 0, palette.wood)
    addMesh(root, roofGeometry(2.23, 0.83, 1.98), palette.roof, 0, 1.49 + loft, 0)
    box(root, 0.075, 0.075, 2.06, 0, 2.31 + loft, 0, palette.roofEdge)
    box(root, 0.44, 0.85, 0.07, -0.23, 0.58, -0.805, palette.teal)
    addMesh(root, new SphereGeometry(0.033, 5, 4), palette.cutWood, -0.1, 0.58, -0.85)
    box(root, 0.43, 0.43, 0.055, 0.49, 1, -0.81, palette.wood)
    box(root, 0.32, 0.32, 0.06, 0.49, 1, -0.845, palette.window)
    box(root, 0.035, 0.34, 0.065, 0.49, 1, -0.88, palette.wood)
    box(root, 0.34, 0.035, 0.065, 0.49, 1, -0.88, palette.wood)
    box(root, 0.06, 0.43, 0.42, 0.91, 1, 0.12, palette.window)
    box(root, 0.27, 0.63, 0.29, 0.56, 2.03 + loft, 0.4, palette.stone)
    box(root, 0.36, 0.11, 0.36, 0.56, 2.39 + loft, 0.4, palette.foundation)
    box(root, 0.58, 0.15, 0.35, -0.23, 0.13, -0.99, palette.stone)
    flowerBox(root, 0.6, -0.96)
  } else if (type === 'garden') {
    box(root, 2.23, 0.13, 2.05, 0, 0.19, 0, palette.soil)
    for (let row = 0; row < 3; row++) {
      const z = (row - 1) * 0.54
      box(root, 1.8, 0.055, 0.26, 0, 0.27, z, palette.wood)
      for (let column = 0; column < 5; column++) {
        const x = (column - 2) * 0.34
        addMesh(root, new DodecahedronGeometry(0.12, 0), row === 1 ? palette.carrot : palette.pink, x, 0.36, z)
        const leaf = addMesh(root, new ConeGeometry(0.13, 0.32, 4), palette.leaf, x, 0.49, z)
        leaf.rotation.z = (column % 2 ? -1 : 1) * 0.18
      }
    }
    fence(root, 2.3, 0, 1.1)
    fence(root, 2.15, -1.17, 0, Math.PI / 2)
    fence(root, 2.15, 1.17, 0, Math.PI / 2)
    addMesh(root, new CylinderGeometry(0.18, 0.15, 0.35, 8), palette.teal, -0.97, 0.34, -1.07)
  } else if (type === 'lumberyard') {
    for (const x of [-0.93, 0.93]) {
      for (const z of [-0.73, 0.73]) box(root, 0.13, 1.6, 0.13, x, 0.93, z, palette.wood)
    }
    addMesh(root, roofGeometry(2.24, 0.53, 1.95), palette.teal, 0, 1.73, 0)
    box(root, 1.82, 0.09, 0.54, 0, 0.77, 0.4, palette.cutWood)
    for (let i = 0; i < 3; i++) log(root, -0.05, 0.32, -0.55 + i * 0.33, 1.38)
    for (let i = 0; i < 2; i++) log(root, -0.05, 0.58, -0.39 + i * 0.33, 1.3)
    box(root, 0.065, 0.62, 0.065, 0.55, 1.06, 0.35, palette.timber).rotation.z = -0.3
    box(root, 0.28, 0.23, 0.07, 0.62, 1.26, 0.35, palette.metal)
    addMesh(root, new CylinderGeometry(0.33, 0.38, 0.48, 7), palette.wood, 0.77, 0.39, -0.92)
  } else {
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.39
      const rock = addMesh(root, new DodecahedronGeometry(0.38 + (i % 3) * 0.12, 0), palette.stone, Math.cos(angle) * 0.72, 0.39, Math.sin(angle) * 0.68)
      rock.rotation.set(i, i * 0.7, i * 0.2)
    }
    box(root, 0.19, 2, 0.19, 0.8, 1.15, 0.45, palette.wood)
    box(root, 1.65, 0.14, 0.15, 0.1, 2.12, 0.45, palette.wood)
    box(root, 0.1, 1.15, 0.1, 0.38, 1.7, 0.45, palette.timber).rotation.z = -0.65
    addMesh(root, new CylinderGeometry(0.018, 0.018, 1.25, 4), palette.timber, -0.52, 1.5, 0.45)
    box(root, 0.46, 0.32, 0.4, -0.52, 0.84, 0.45, palette.metal)
    box(root, 0.9, 0.16, 0.48, 0.2, 0.26, -1.01, palette.wood)
    for (const x of [-0.1, 0.52]) {
      const wheel = addMesh(root, new CylinderGeometry(0.2, 0.2, 0.09, 8), palette.timber, x, 0.2, -1.24)
      wheel.rotation.x = Math.PI / 2
    }
  }
  return root
}

export function createBuildingModel(type: BuildingType, level: BuildingLevel = 1): Group {
  const root = createBaseBuildingModel(type, level)
  if (level === 1) return root
  if (type === 'hearth') {
    box(root, 0.07, 2.4, 0.07, -0.85, 1.2, 0.8, palette.timber)
    box(root, 0.5, 0.54, 0.035, -1.04, 2.02, 0.8, palette.roof)
    box(root, 1.75, 0.12, 0.12, 0, 2.38, 0.8, palette.cutWood)
    if (level === 3) {
      for (const x of [-0.78, 0.78]) {
        box(root, 0.06, 1.85, 0.06, x, 0.92, -0.65, palette.timber)
        box(root, 0.22, 0.3, 0.22, x, 1.85, -0.65, palette.window)
        addMesh(root, new ConeGeometry(0.21, 0.18, 4), palette.teal, x, 2.09, -0.65)
      }
      box(root, 0.4, 0.36, 0.055, 0, 2.11, 0.8, palette.plaster)
      box(root, 0.15, 0.15, 0.065, 0, 2.11, 0.765, palette.teal).rotation.z = Math.PI / 4
    }
  } else if (type === 'cottage') {
    const loft = (level - 1) * 0.38
    box(root, 1.85, 0.075, 1.6, 0, 1.47, 0, palette.wood)
    for (const x of level === 2 ? [0] : [-0.4, 0.4]) {
      for (const side of [-1, 1]) {
        box(root, 0.32, 0.26, 0.06, x, 1.25 + loft, side * 0.81, palette.wood)
        box(root, 0.23, 0.18, 0.065, x, 1.25 + loft, side * 0.85, palette.window)
      }
    }
    addMesh(root, roofGeometry(0.78, 0.2, 0.5), palette.teal, -0.23, 1.1, -0.96)
    if (level === 3) {
      box(root, 0.04, 0.42, 0.04, 0, 3.22, 0.12, palette.metal)
      box(root, 0.4, 0.1, 0.035, 0.08, 3.43, 0.12, palette.cutWood)
    }
  } else if (type === 'garden') {
    for (const z of level === 2 ? [0.88] : [0.88, -0.88]) {
      for (const x of [-0.85, 0.85]) box(root, 0.07, 1.4, 0.07, x, 0.85, z, palette.wood)
      for (const y of [0.72, 1.1, 1.5]) box(root, 1.8, 0.05, 0.05, 0, y, z, palette.cutWood)
      for (let index = 0; index < 6; index++) {
        const x = -0.68 + index * 0.27
        const y = 0.8 + index % 3 * 0.23
        addMesh(root, new DodecahedronGeometry(0.2, 0), palette.leaf, x, y, z)
        addMesh(root, new DodecahedronGeometry(0.085, 0), palette.pink, x + 0.08, y - 0.08, z - 0.1)
      }
    }
  } else if (type === 'lumberyard') {
    log(root, -0.05, 0.83, -0.22, 1.3)
    box(root, 0.58, 0.06, 0.26, -0.63, 1.19, -0.77, palette.cutWood)
    if (level === 3) {
      box(root, 1.4, 0.075, 0.55, 0, 1.25, 0.42, palette.wood)
      for (let index = 0; index < 3; index++) {
        box(root, 1.25, 0.065, 0.12, 0, 1.33, 0.24 + index * 0.15, palette.cutWood)
      }
      addMesh(root, new CylinderGeometry(0.2, 0.2, 0.045, 12), palette.metal, -0.62, 1.35, -0.77).rotation.x = Math.PI / 2
    }
  } else {
    for (let index = 0; index < level; index++) {
      box(root, 0.4, 0.27, 0.32, -0.5 + index * 0.43, 0.34, -0.81, palette.foundation)
    }
    if (level === 3) {
      box(root, 0.25, 0.26, 0.22, 0.8, 1.67, 0.45, palette.metal)
      addMesh(root, new CylinderGeometry(0.16, 0.16, 0.1, 8), palette.metal, -0.52, 2.12, 0.45).rotation.x = Math.PI / 2
      box(root, 0.85, 0.07, 0.52, 0.08, 0.67, -0.79, palette.wood)
    }
  }
  return root
}

export interface CharacterRig {
  root: Group
  body: Group
  leftArm: Group
  rightArm: Group
  leftLeg: Group
  rightLeg: Group
}

export function createCharacterModel(shirtColor = 0xe6845e, explorer = false): CharacterRig {
  const root = new Group()
  const body = new Group()
  root.add(body)
  const shirt = material(shirtColor)
  const skin = material(explorer ? 0xeac397 : 0xd5ab7f)
  const trousers = material(0x3d6463)
  const hair = material(0x594237)
  const boots = material(0x755843)
  const shadow = addMesh(root, new CylinderGeometry(0.31, 0.31, 0.004, 16), new MeshBasicMaterial({ color: 0x233a2a, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.025, 0)
  shadow.castShadow = false
  box(body, 0.49, 0.53, 0.3, 0, 0.87, 0, shirt)
  box(body, 0.46, 0.07, 0.32, 0, 0.65, 0, palette.cutWood)
  const head = addMesh(body, new DodecahedronGeometry(0.28, 1), skin, 0, 1.35, -0.015)
  head.scale.set(0.94, 1.06, 0.94)
  const hairCap = addMesh(body, new DodecahedronGeometry(0.29, 0), hair, 0, 1.49, 0.035)
  hairCap.scale.set(1, 0.66, 0.95)
  box(body, 0.065, 0.07, 0.09, 0, 1.33, -0.28, skin)
  for (const x of [-0.09, 0.09]) box(body, 0.035, 0.04, 0.02, x, 1.4, -0.265, hair)
  if (explorer) {
    addMesh(body, new CylinderGeometry(0.39, 0.39, 0.055, 10), palette.cutWood, 0, 1.56, -0.015)
    addMesh(body, new CylinderGeometry(0.23, 0.27, 0.18, 9), palette.cutWood, 0, 1.66, -0.015)
    box(body, 0.4, 0.43, 0.21, 0, 0.93, 0.24, palette.teal)
    box(body, 0.42, 0.12, 0.23, 0, 1.11, 0.24, palette.cutWood)
    for (const x of [-0.16, 0.16]) box(body, 0.055, 0.47, 0.32, x, 0.93, 0.02, palette.wood)
    box(body, 0.32, 0.11, 0.1, 0, 1.12, -0.19, palette.plaster)
  }
  const limbs: Group[] = []
  for (let i = 0; i < 4; i++) {
    const arm = i < 2
    const limb = new Group()
    const side = i % 2 === 0 ? -1 : 1
    limb.position.set(side * (arm ? 0.31 : 0.14), arm ? 1.04 : 0.63, 0)
    box(limb, arm ? 0.17 : 0.18, arm ? 0.34 : 0.42, arm ? 0.19 : 0.21, 0, arm ? -0.15 : -0.2, 0, arm ? shirt : trousers)
    box(limb, arm ? 0.16 : 0.2, 0.17, arm ? 0.17 : 0.29, 0, arm ? -0.35 : -0.5, arm ? 0 : -0.035, arm ? skin : boots)
    body.add(limb)
    limbs.push(limb)
  }
  const [leftArm, rightArm, leftLeg, rightLeg] = limbs
  return { root, body, leftArm, rightArm, leftLeg, rightLeg }
}

export function animateCharacter(rig: CharacterRig, time: number, speed: number, gathering = 0): void {
  const stride = Math.sin(time * 10) * Math.min(speed, 1) * 0.58
  rig.leftLeg.rotation.x = stride
  rig.rightLeg.rotation.x = -stride
  rig.leftArm.rotation.x = -stride * 0.75
  rig.rightArm.rotation.x = gathering > 0 ? -1.3 + Math.sin(gathering * 16) * 0.65 : stride * 0.75
  rig.body.position.y = Math.abs(Math.sin(time * 10)) * 0.035 * Math.min(speed, 1)
  rig.body.rotation.z = Math.sin(time * 2.5) * 0.012
}

export function createSelectionRing(color = 0xffedba, radius = 0.8): Mesh {
  const ring = new Mesh(
    new TorusGeometry(radius, 0.025, 5, 40),
    new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.8, depthWrite: false }),
  )
  ring.rotation.x = Math.PI / 2
  return ring
}

export function disposeModel(root: Group): void {
  root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose()
  })
}
