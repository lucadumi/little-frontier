import type { BuildableType, Building, BuildingDefinition, BuildingLevel, BuildingType, Inventory, NodeKind, Resource, Vec3 } from './types.ts'

export const PLANET_RADIUS = 22
export const WATER_LEVEL = -0.12
export const DAY_LENGTH = 240
// Retain the original storage key so earlier worlds can be migrated in place.
export const SAVE_KEY = 'little-frontier-save-v1'
export const MAX_POPULATION = 18
export const ARRIVAL_INTERVAL = 30
export const FOOD_PER_PERSON_SECOND = 0.008
export const START_NORMAL: Vec3 = [0, 1, 0]
export const START_FORWARD: Vec3 = [0, 0, -1]
export const HEARTH_NORMAL: Vec3 = [0, Math.cos(0.245), -Math.sin(0.245)]
export const STARTING_RESOURCES: Inventory = { wood: 12, stone: 8, food: 24 }
export const RESOURCE_NAMES: Record<Resource, string> = { wood: 'Wood', stone: 'Stone', food: 'Food' }
export const BUILDABLE_TYPES: BuildableType[] = ['cottage', 'garden', 'lumberyard', 'quarry']

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  hearth: {
    name: 'Founders\' hearth',
    subtitle: 'The heart of your frontier',
    description: 'A welcoming camp for your first three settlers. Build cottages to make room for more.',
    cost: { wood: 0, stone: 0, food: 0 },
    footprint: 1.15,
    beds: 3,
    maxWorkers: 0,
    production: { wood: 0, stone: 0, food: 0 },
  },
  cottage: {
    name: 'Cottage',
    subtitle: 'A place to belong',
    description: 'Room for two new settlers. Well-fed settlers arrive every 30 seconds while a bed is available.',
    cost: { wood: 12, stone: 6, food: 0 },
    footprint: 1.35,
    beds: 2,
    maxWorkers: 0,
    production: { wood: 0, stone: 0, food: 0 },
  },
  garden: {
    name: 'Garden',
    subtitle: 'Good things take root',
    description: 'Assign up to two growers. Each produces 6 food per minute, keeping your frontier fed.',
    cost: { wood: 14, stone: 4, food: 0 },
    footprint: 1.4,
    beds: 0,
    maxWorkers: 2,
    production: { wood: 0, stone: 0, food: 0.1 },
  },
  lumberyard: {
    name: 'Lumberyard',
    subtitle: 'Make room to grow',
    description: 'Assign up to two woodcutters. Each sustainably produces 5 wood per minute.',
    cost: { wood: 18, stone: 8, food: 0 },
    footprint: 1.45,
    beds: 0,
    maxWorkers: 2,
    production: { wood: 1 / 12, stone: 0, food: 0 },
  },
  quarry: {
    name: 'Quarry',
    subtitle: 'A solid foundation',
    description: 'Assign up to two stoneworkers. Each produces 4 stone per minute.',
    cost: { wood: 14, stone: 12, food: 0 },
    footprint: 1.4,
    beds: 0,
    maxWorkers: 2,
    production: { wood: 0, stone: 1 / 15, food: 0 },
  },
}

export const HEARTH_UPGRADE_POPULATION = { 2: 5, 3: 8 } as const

const UPGRADE_COSTS: Record<BuildingType, [Inventory, Inventory]> = {
  hearth: [{ wood: 24, stone: 16, food: 10 }, { wood: 48, stone: 36, food: 18 }],
  cottage: [{ wood: 10, stone: 6, food: 0 }, { wood: 18, stone: 10, food: 0 }],
  garden: [{ wood: 16, stone: 8, food: 0 }, { wood: 28, stone: 16, food: 0 }],
  lumberyard: [{ wood: 14, stone: 10, food: 0 }, { wood: 24, stone: 18, food: 0 }],
  quarry: [{ wood: 12, stone: 12, food: 0 }, { wood: 20, stone: 24, food: 0 }],
}

export function getBuildingStats(building: Pick<Building, 'type' | 'level'>): { beds: number; production: Inventory } {
  const definition = BUILDINGS[building.type]
  const multiplier = 1 + (building.level - 1) * 0.5
  return {
    beds: definition.beds + (building.type === 'cottage' ? building.level - 1 : 0),
    production: {
      wood: definition.production.wood * multiplier,
      stone: definition.production.stone * multiplier,
      food: definition.production.food * multiplier,
    },
  }
}

export function getUpgradeCost(type: BuildingType, level: BuildingLevel): Inventory | null {
  return level === 3 ? null : { ...UPGRADE_COSTS[type][level - 1] }
}

export function getBuildingInvestment(building: Pick<Building, 'type' | 'level'>): Inventory {
  const cost = { ...BUILDINGS[building.type].cost }
  for (let index = 0; index < building.level - 1; index++) {
    const upgrade = UPGRADE_COSTS[building.type][index]
    cost.wood += upgrade.wood
    cost.stone += upgrade.stone
    cost.food += upgrade.food
  }
  return cost
}

export const NODE_DEFINITIONS: Record<NodeKind, {
  name: string
  action: string
  resource: Resource
  yield: number
  capacity: number
  regrowth: number
}> = {
  tree: { name: 'Meadow tree', action: 'Gather wood', resource: 'wood', yield: 4, capacity: 3, regrowth: 90 },
  rock: { name: 'Stone outcrop', action: 'Gather stone', resource: 'stone', yield: 3, capacity: 3, regrowth: 100 },
  berries: { name: 'Wild berries', action: 'Pick berries', resource: 'food', yield: 5, capacity: 2, regrowth: 65 },
}
