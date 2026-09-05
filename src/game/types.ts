export type Vec3 = [number, number, number]
export type Resource = 'wood' | 'stone' | 'food'
export type Inventory = Record<Resource, number>
export type BuildingType = 'hearth' | 'cottage' | 'garden' | 'lumberyard' | 'quarry'
export type BuildingLevel = 1 | 2 | 3
export type BuildableType = Exclude<BuildingType, 'hearth'>
export type NodeKind = 'tree' | 'rock' | 'berries'

export interface BuildingDefinition {
  name: string
  subtitle: string
  description: string
  cost: Inventory
  footprint: number
  beds: number
  maxWorkers: number
  production: Inventory
}

export interface Building {
  id: string
  type: BuildingType
  level: BuildingLevel
  normal: Vec3
  rotation: number
  workers: number
}

export interface ResourceNode {
  id: string
  kind: NodeKind
  normal: Vec3
  scale: number
}

export interface NodeState {
  remaining: number
  readyAt: number
}

export interface GameState {
  version: 2
  time: number
  resources: Inventory
  buildings: Building[]
  population: number
  wellbeing: number
  arrivalProgress: number
  nodeStates: Record<string, NodeState>
  player: {
    normal: Vec3
    forward: Vec3
  }
  stats: {
    gathered: Inventory
    buildingsBuilt: number
  }
}

export interface ActionResult {
  ok: boolean
  message: string
  resource?: Resource
  amount?: number
  buildingId?: string
}

export interface UpgradeInfo {
  nextLevel: BuildingLevel | null
  cost: Inventory | null
  available: boolean
  reason: string
  benefit: string
}

export interface SimulationEvent {
  kind: 'arrival' | 'warning'
  message: string
}

export interface EconomySummary {
  housing: number
  employed: number
  idle: number
  rates: Inventory
  moraleLabel: string
}

export interface Objective {
  id: string
  title: string
  description: string
  complete: boolean
}

export interface NodeStatus {
  remaining: number
  capacity: number
  secondsUntilRegrowth: number
}
