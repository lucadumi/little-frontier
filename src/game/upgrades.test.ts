import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDINGS, getBuildingInvestment, getBuildingStats, getUpgradeCost } from './config.ts'
import {
  assignWorker, createInitialState, demolishBuilding, getEconomy, getUpgradeInfo,
  parseSave, placeBuilding, SaveValidationError, serializeSave, tick, upgradeBuilding,
} from './simulation.ts'
import type { BuildableType, Building, GameState, Vec3 } from './types.ts'

function addBuilding(state: GameState, type: BuildableType, normal: Vec3): Building {
  const result = placeBuilding(state, type, normal, 0.4)
  assert.ok(result.ok, result.message)
  const building = state.buildings.find((entry) => entry.id === result.buildingId)
  assert.ok(building)
  return building
}

function village(population = 5): GameState {
  const state = createInitialState()
  state.resources = { wood: 1000, stone: 1000, food: 1000 }
  for (let index = 0; index < 3; index++) {
    const angle = index * Math.PI * 2 / 3
    addBuilding(state, 'cottage', [Math.cos(angle), 0, Math.sin(angle)])
  }
  state.population = population
  return state
}

function unchanged(state: GameState, id: string): void {
  const before = structuredClone(state)
  assert.equal(upgradeBuilding(state, id).ok, false)
  assert.deepEqual(state, before)
}

function legacySave(state: GameState): string {
  return JSON.stringify({
    ...state,
    version: 1,
    buildings: state.buildings.map((building) => ({
      id: building.id, type: building.type, normal: building.normal,
      rotation: building.rotation, workers: building.workers,
    })),
  })
}

describe('hearth progression', () => {
  it('gates hearth upgrades by population, wellbeing, and materials without side effects', () => {
    const state = village(4)
    assert.match(getUpgradeInfo(state, state.buildings[0]).reason, /5 settlers/)
    unchanged(state, 'hearth')
    unchanged(state, 'missing-building')
    state.population = 5
    state.wellbeing = 59
    assert.match(getUpgradeInfo(state, state.buildings[0]).reason, /wellbeing/)
    unchanged(state, 'hearth')
    state.wellbeing = 60
    state.resources.wood = 23
    assert.match(getUpgradeInfo(state, state.buildings[0]).reason, /1 wood/)
    unchanged(state, 'hearth')
    state.resources.wood = 24
    state.resources.stone = 16
    state.resources.food = 10
    assert.equal(upgradeBuilding(state, 'hearth').ok, true)
    assert.deepEqual(state.resources, { wood: 0, stone: 0, food: 0 })
    assert.equal(state.buildings[0].level, 2)
    assert.match(getUpgradeInfo(state, state.buildings[0]).reason, /8 settlers/)
    unchanged(state, 'hearth')
  })

  it('unlocks each building tier in order and caps upgrades at level three', () => {
    const state = village(8)
    const cottage = state.buildings[1]
    assert.match(getUpgradeInfo(state, cottage).reason, /hearth to level 2/)
    unchanged(state, cottage.id)
    const hearthBefore = structuredClone(state.buildings[0])
    assert.equal(upgradeBuilding(state, 'hearth').ok, true)
    assert.deepEqual(state.buildings[0], { ...hearthBefore, level: 2 })
    assert.equal(upgradeBuilding(state, cottage.id).ok, true)
    assert.match(getUpgradeInfo(state, cottage).reason, /hearth to level 3/)
    unchanged(state, cottage.id)
    assert.equal(upgradeBuilding(state, 'hearth').ok, true)
    assert.equal(upgradeBuilding(state, cottage.id).ok, true)
    assert.deepEqual(getUpgradeInfo(state, cottage), {
      available: false, nextLevel: null, cost: null,
      reason: 'Fully upgraded.', benefit: 'Maximum level reached',
    })
    unchanged(state, cottage.id)
    unchanged(state, 'hearth')
  })

  it('returns independent cost values and describes the unlocked benefits', () => {
    const state = village()
    const info = getUpgradeInfo(state, state.buildings[0])
    assert.match(info.benefit, /level 2/)
    assert.ok(info.cost)
    info.cost.wood = 0
    assert.equal(getUpgradeCost('hearth', 1)?.wood, 24)
    assert.equal(getUpgradeCost('hearth', 3), null)
    assert.match(getUpgradeInfo(state, state.buildings[1]).benefit, /3 total/)
  })
})

describe('upgraded buildings', () => {
  for (const type of ['cottage', 'garden', 'lumberyard', 'quarry'] as const) {
    it(`keeps ${type} identity, position, rotation, and workers while scaling its useful output`, () => {
      const state = village(8)
      assert.equal(upgradeBuilding(state, 'hearth').ok, true)
      assert.equal(upgradeBuilding(state, 'hearth').ok, true)
      const building = type === 'cottage' ? state.buildings[1] : addBuilding(state, type, [0, -1, 0])
      if (type !== 'cottage') assert.equal(assignWorker(state, building.id, 1).ok, true)
      const original = structuredClone(building)
      const buildCount = state.stats.buildingsBuilt
      const initialHousing = getEconomy(state).housing
      for (const level of [2, 3] as const) {
        const cost = getUpgradeCost(type, building.level)
        assert.ok(cost)
        const before = { ...state.resources }
        assert.equal(upgradeBuilding(state, building.id).ok, true)
        assert.deepEqual(building, { ...original, level })
        assert.deepEqual(state.resources, {
          wood: before.wood - cost.wood,
          stone: before.stone - cost.stone,
          food: before.food - cost.food,
        })
        assert.equal(state.stats.buildingsBuilt, buildCount)
        const stats = getBuildingStats(building)
        assert.equal(stats.beds, type === 'cottage' ? level + 1 : 0)
        if (type === 'cottage') assert.equal(getEconomy(state).housing, initialHousing + level - 1)
        for (const resource of ['wood', 'stone', 'food'] as const) {
          assert.equal(stats.production[resource], BUILDINGS[type].production[resource] * (1 + (level - 1) * 0.5))
        }
        const rates = getEconomy(state).rates
        const stock = { ...state.resources }
        tick(state, 10)
        for (const resource of ['wood', 'stone', 'food'] as const) {
          assert.ok(Math.abs(state.resources[resource] - stock[resource] - rates[resource] * 10) < 1e-8)
        }
      }
      assert.deepEqual(parseSave(serializeSave(state)), state)
    })
  }

  it('does not spend materials or change workers when a workplace upgrade is unaffordable', () => {
    const state = village()
    upgradeBuilding(state, 'hearth')
    const garden = addBuilding(state, 'garden', [0, -1, 0])
    assignWorker(state, garden.id, 1)
    state.resources.stone = 0
    unchanged(state, garden.id)
    assert.equal(garden.workers, 1)
    assert.match(getUpgradeInfo(state, garden).reason, /8 stone/)
  })

  it('refunds half the total investment and releases workers on demolition', () => {
    const state = village(8)
    upgradeBuilding(state, 'hearth')
    upgradeBuilding(state, 'hearth')
    const quarry = addBuilding(state, 'quarry', [0, -1, 0])
    assignWorker(state, quarry.id, 1)
    upgradeBuilding(state, quarry.id)
    upgradeBuilding(state, quarry.id)
    const invested = getBuildingInvestment(quarry)
    assert.deepEqual(invested, { wood: 46, stone: 48, food: 0 })
    const before = { ...state.resources }
    const buildCount = state.stats.buildingsBuilt
    assert.equal(demolishBuilding(state, quarry.id).ok, true)
    assert.equal(state.resources.wood, before.wood + Math.floor(invested.wood / 2))
    assert.equal(state.resources.stone, before.stone + Math.floor(invested.stone / 2))
    assert.equal(state.stats.buildingsBuilt, buildCount)
    assert.equal(getEconomy(state).employed, 0)
  })

  it('counts upgraded beds when protecting homes and welcoming settlers', () => {
    const state = village(8)
    upgradeBuilding(state, 'hearth')
    const cottage = state.buildings[1]
    upgradeBuilding(state, cottage.id)
    assert.equal(getEconomy(state).housing, 10)
    assert.equal(demolishBuilding(state, cottage.id).ok, false)
    tick(state, 60)
    assert.equal(state.population, 10)
    assert.deepEqual(parseSave(serializeSave(state)), state)
  })
})

describe('building-level save migration', () => {
  it('migrates a version-one world without losing progress or advancing time', () => {
    const state = village()
    const garden = addBuilding(state, 'garden', [0, -1, 0])
    assignWorker(state, garden.id, 1)
    state.player.normal = [1, 0, 0]
    state.player.forward = [0, 0, -1]
    tick(state, 12.5)
    const migrated = parseSave(legacySave(state))
    assert.equal(migrated.version, 2)
    assert.deepEqual(migrated, state)
    assert.ok(migrated.buildings.every((building) => building.level === 1))
    assert.deepEqual(parseSave(serializeSave(migrated)), migrated)
  })

  it('rejects missing, nonnumeric, fractional, and out-of-range levels in new saves', () => {
    const state = village()
    for (const level of [undefined, null, '2', 0, 4, 1.5, Infinity]) {
      const value = { ...state, buildings: [{ ...state.buildings[0], level }, ...state.buildings.slice(1)] }
      assert.throws(() => parseSave(JSON.stringify(value)), SaveValidationError)
    }
  })

  it('rejects a building tier above its hearth and upgraded data disguised as an older save', () => {
    const state = village()
    state.buildings[1].level = 2
    assert.throws(() => serializeSave(state), SaveValidationError)
    assert.throws(() => parseSave(JSON.stringify({ ...state, version: 1 })), SaveValidationError)
  })
})
