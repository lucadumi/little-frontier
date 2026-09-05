import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ARRIVAL_INTERVAL,
  BUILDINGS,
  FOOD_PER_PERSON_SECOND,
  HEARTH_NORMAL,
  MAX_POPULATION,
  NODE_DEFINITIONS,
  PLANET_RADIUS,
  START_FORWARD,
  START_NORMAL,
  STARTING_RESOURCES,
} from './config.ts'
import {
  assignWorker,
  canAfford,
  createInitialState,
  demolishBuilding,
  gatherResource,
  getEconomy,
  getNodeStatus,
  getObjectives,
  parseSave,
  placeBuilding,
  SaveValidationError,
  serializeSave,
  tick,
} from './simulation.ts'
import type { BuildableType, Building, GameState, NodeKind, ResourceNode, SimulationEvent, Vec3 } from './types.ts'

function fundedState(): GameState {
  const state = createInitialState()
  state.resources = { wood: 1000, stone: 1000, food: 100 }
  return state
}

function build(state: GameState, type: BuildableType, normal: Vec3): string {
  const result = placeBuilding(state, type, normal, 0)
  assert.ok(result.ok, result.message)
  assert.ok(result.buildingId)
  return result.buildingId
}

function findBuilding(state: GameState, id: string): Building {
  const building = state.buildings.find((entry) => entry.id === id)
  assert.ok(building)
  return building
}

function resourceNode(kind: NodeKind, id = `${kind}-test`): ResourceNode {
  return { id, kind, normal: [1, 0, 0], scale: 1 }
}

function close(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`)
}

function assertUnchanged(state: GameState, action: () => { ok: boolean }): void {
  const before = structuredClone(state)
  assert.equal(action().ok, false)
  assert.deepEqual(state, before)
}

function addHousing(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count
    build(state, 'cottage', [Math.cos(angle), 0, Math.sin(angle)])
  }
}

function assertSameSimulation(actual: GameState, expected: GameState): void {
  assert.equal(actual.population, expected.population)
  close(actual.time, expected.time)
  close(actual.arrivalProgress, expected.arrivalProgress)
  close(actual.wellbeing, expected.wellbeing)
  close(actual.resources.wood, expected.resources.wood)
  close(actual.resources.stone, expected.resources.stone)
  close(actual.resources.food, expected.resources.food)
  assert.deepEqual(actual.stats, expected.stats)
  assert.deepEqual(actual.buildings, expected.buildings)
  assert.deepEqual(actual.nodeStates, expected.nodeStates)
}

describe('initial state', () => {
  it('initializes every shared field and copies mutable configuration', () => {
    const state = createInitialState()
    assert.equal(state.version, 1)
    assert.equal(state.time, 0)
    assert.equal(state.arrivalProgress, 0)
    assert.equal(state.population, 3)
    assert.equal(state.wellbeing, 100)
    assert.deepEqual(state.resources, STARTING_RESOURCES)
    assert.deepEqual(state.buildings, [{
      id: 'hearth', type: 'hearth', normal: HEARTH_NORMAL, rotation: 0, workers: 0,
    }])
    assert.deepEqual(state.player, { normal: START_NORMAL, forward: START_FORWARD })
    assert.deepEqual(state.nodeStates, {})
    assert.deepEqual(state.stats, { gathered: { wood: 0, stone: 0, food: 0 }, buildingsBuilt: 0 })
    assert.notEqual(state.resources, STARTING_RESOURCES)
    assert.notEqual(state.player.normal, START_NORMAL)
    assert.notEqual(state.player.forward, START_FORWARD)
    assert.notEqual(state.buildings[0].normal, HEARTH_NORMAL)
    state.resources.wood = 0
    state.player.normal[0] = 1
    assert.deepEqual(createInitialState().resources, STARTING_RESOURCES)
    assert.deepEqual(createInitialState().player.normal, START_NORMAL)
  })
})

describe('gathering and regrowth', () => {
  for (const kind of ['tree', 'rock', 'berries'] satisfies NodeKind[]) {
    it(`counts ${kind} harvest actions, prevents depleted harvesting, and regrows on time`, () => {
      const state = createInitialState()
      const node = resourceNode(kind)
      const definition = NODE_DEFINITIONS[kind]
      const before = state.resources[definition.resource]
      assert.deepEqual(getNodeStatus(state, node), {
        remaining: definition.capacity, capacity: definition.capacity, secondsUntilRegrowth: 0,
      })
      assert.deepEqual(state.nodeStates, {})
      for (let i = 0; i < definition.capacity; i++) {
        const result = gatherResource(state, node)
        assert.equal(result.ok, true)
        assert.equal(result.resource, definition.resource)
        assert.equal(result.amount, definition.yield)
        assert.equal(state.nodeStates[node.id].remaining, definition.capacity - i - 1)
        assert.equal(state.nodeStates[node.id].readyAt, i === definition.capacity - 1 ? definition.regrowth : 0)
      }
      assert.equal(state.resources[definition.resource], before + definition.yield * definition.capacity)
      assert.equal(state.stats.gathered[definition.resource], definition.yield * definition.capacity)
      assertUnchanged(state, () => gatherResource(state, node))
      assertUnchanged(state, () => gatherResource(state, node))
      tick(state, definition.regrowth - 0.01)
      close(getNodeStatus(state, node).secondsUntilRegrowth, 0.01)
      assertUnchanged(state, () => gatherResource(state, node))
      tick(state, 0.01)
      const snapshot = structuredClone(state)
      assert.equal(getNodeStatus(state, node).remaining, definition.capacity)
      assert.deepEqual(state, snapshot)
      assert.equal(gatherResource(state, node).ok, true)
      assert.equal(state.nodeStates[node.id].remaining, definition.capacity - 1)
      assert.equal(state.nodeStates[node.id].readyAt, 0)
    })
  }

  it('starts the regrowth timer at the last action and keeps nodes independent', () => {
    const state = createInitialState()
    const tree = resourceNode('tree', 'tree-one')
    const other = resourceNode('tree', 'tree-two')
    gatherResource(state, tree)
    tick(state, 25)
    gatherResource(state, tree)
    gatherResource(state, tree)
    assert.equal(state.nodeStates[tree.id].readyAt, 25 + NODE_DEFINITIONS.tree.regrowth)
    assert.equal(getNodeStatus(state, other).remaining, 3)
    assert.equal(state.stats.gathered.wood, 12)
  })

  it('does not restart an expired regrowth timer before the next depletion', () => {
    const state = createInitialState()
    const node = resourceNode('berries')
    gatherResource(state, node)
    gatherResource(state, node)
    tick(state, 100)
    assert.equal(getNodeStatus(state, node).remaining, 2)
    gatherResource(state, node)
    gatherResource(state, node)
    assert.equal(state.nodeStates[node.id].readyAt, 165)
  })
})

describe('construction and workers', () => {
  it('checks all costs without changing either inventory', () => {
    const resources = { wood: 12, stone: 6, food: 0 }
    const before = { ...resources }
    assert.equal(canAfford(resources, BUILDINGS.cottage.cost), true)
    assert.equal(canAfford({ ...resources, stone: 5.99 }, BUILDINGS.cottage.cost), false)
    assert.equal(canAfford(resources, { wood: 0, stone: 0, food: 1 }), false)
    assert.equal(canAfford(resources, { wood: -1, stone: 0, food: 0 }), false)
    assert.equal(canAfford({ ...resources, wood: NaN }, BUILDINGS.cottage.cost), false)
    assert.deepEqual(resources, before)
  })

  it('rejects an unaffordable building with no side effects', () => {
    const state = createInitialState()
    const result = placeBuilding(state, 'garden', [1, 0, 0], 0)
    assert.equal(result.ok, false)
    assert.match(result.message, /2 wood/)
    assert.deepEqual(state, createInitialState())
  })

  it('validates types, normalized coordinates, and finite rotation without side effects', () => {
    const state = fundedState()
    // @ts-expect-error Unknown building types must also be rejected at runtime.
    assertUnchanged(state, () => placeBuilding(state, 'castle', [1, 0, 0], 0))
    // @ts-expect-error The hearth is not a buildable type.
    assertUnchanged(state, () => placeBuilding(state, 'hearth', [1, 0, 0], 0))
    for (const normal of [[0, 0, 0], [2, 0, 0], [NaN, 0, 0], [Infinity, 0, 0]] satisfies Vec3[]) {
      assertUnchanged(state, () => placeBuilding(state, 'cottage', normal, 0))
    }
    for (const rotation of [Infinity, -Infinity, NaN]) {
      assertUnchanged(state, () => placeBuilding(state, 'cottage', [1, 0, 0], rotation))
    }
  })

  it('rejects footprint overlap with the hearth or another building', () => {
    const state = fundedState()
    assertUnchanged(state, () => placeBuilding(state, 'cottage', HEARTH_NORMAL, 0))
    build(state, 'cottage', [1, 0, 0])
    assertUnchanged(state, () => placeBuilding(state, 'garden', [1, 0, 0], 0))
    const angle = (BUILDINGS.cottage.footprint * 2 - 0.001) / PLANET_RADIUS
    assertUnchanged(state, () => placeBuilding(state, 'cottage', [Math.cos(angle), Math.sin(angle), 0], 0))
  })

  it('uses spherical arc clearance and allows exactly touching footprints', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    const angle = BUILDINGS.cottage.footprint * 2 / PLANET_RADIUS
    assert.equal(placeBuilding(state, 'cottage', [Math.cos(angle), Math.sin(angle), 0], 0).ok, true)
    assert.equal(placeBuilding(state, 'cottage', [-1, 0, 0], 0).ok, true)
  })

  it('deducts exact costs, copies coordinates, records construction, and leaves jobs empty', () => {
    const state = createInitialState()
    const normal: Vec3 = [1, 0, 0]
    const result = placeBuilding(state, 'cottage', normal, 0.75)
    assert.equal(result.ok, true)
    assert.equal(result.buildingId, 'building-1')
    assert.deepEqual(state.resources, { wood: 0, stone: 2, food: 24 })
    assert.equal(state.stats.buildingsBuilt, 1)
    assert.deepEqual(state.buildings[1], {
      id: 'building-1', type: 'cottage', normal: [1, 0, 0], rotation: 0.75, workers: 0,
    })
    normal[0] = 0
    assert.deepEqual(state.buildings[1].normal, [1, 0, 0])
    assert.equal(getEconomy(state).employed, 0)
  })

  it('preserves unique building IDs through demolition and save reloads', () => {
    let state = fundedState()
    const first = build(state, 'cottage', [1, 0, 0])
    demolishBuilding(state, first)
    state = parseSave(serializeSave(state))
    const second = build(state, 'cottage', [1, 0, 0])
    assert.equal(second, 'building-2')
    findBuilding(state, second).id = 'building-3'
    state = parseSave(serializeSave(state))
    const third = build(state, 'cottage', [-1, 0, 0])
    assert.notEqual(third, 'building-3')
    assert.equal(new Set(state.buildings.map((building) => building.id)).size, state.buildings.length)
    assert.equal(state.stats.buildingsBuilt, 3)
  })

  it('enforces job slots and available settlers, then releases workers', () => {
    const state = fundedState()
    const garden = build(state, 'garden', [1, 0, 0])
    const lumberyard = build(state, 'lumberyard', [-1, 0, 0])
    assert.equal(assignWorker(state, garden, 1).ok, true)
    assert.equal(assignWorker(state, garden, 1).ok, true)
    assertUnchanged(state, () => assignWorker(state, garden, 1))
    assert.equal(assignWorker(state, lumberyard, 1).ok, true)
    assert.equal(getEconomy(state).idle, 0)
    assertUnchanged(state, () => assignWorker(state, lumberyard, 1))
    assert.equal(assignWorker(state, garden, -1).ok, true)
    assert.equal(getEconomy(state).idle, 1)
    assert.equal(assignWorker(state, lumberyard, 1).ok, true)
    assert.equal(assignWorker(state, garden, -1).ok, true)
    assertUnchanged(state, () => assignWorker(state, garden, -1))
    assert.equal(findBuilding(state, garden).workers, 0)
    assert.equal(getEconomy(state).employed, 2)
  })

  it('rejects assigning workers to homes, the hearth, or missing buildings', () => {
    const state = fundedState()
    const cottage = build(state, 'cottage', [1, 0, 0])
    assertUnchanged(state, () => assignWorker(state, cottage, 1))
    assertUnchanged(state, () => assignWorker(state, 'hearth', 1))
    assertUnchanged(state, () => assignWorker(state, 'missing', 1))
    assertUnchanged(state, () => assignWorker(state, 'missing', -1))
  })
})

describe('economy and settlement time', () => {
  it('reports initial capacity, idle workers, net food consumption, and readable morale', () => {
    const state = createInitialState()
    const economy = getEconomy(state)
    assert.equal(economy.housing, 3)
    assert.equal(economy.employed, 0)
    assert.equal(economy.idle, 3)
    assert.deepEqual(economy.rates, { wood: 0, stone: 0, food: -3 * FOOD_PER_PERSON_SECOND })
    assert.equal(typeof economy.moraleLabel, 'string')
    assert.ok(economy.moraleLabel.length > 0)
    tick(state, 5)
    close(state.resources.food, STARTING_RESOURCES.food - 15 * FOOD_PER_PERSON_SECOND)
  })

  it('integrates worker production and consumption using the same net rates', () => {
    const state = fundedState()
    const garden = build(state, 'garden', [1, 0, 0])
    const lumberyard = build(state, 'lumberyard', [-1, 0, 0])
    const quarry = build(state, 'quarry', [0, 0, 1])
    for (const id of [garden, lumberyard, quarry]) assert.equal(assignWorker(state, id, 1).ok, true)
    const economy = getEconomy(state)
    assert.equal(economy.employed, 3)
    assert.equal(economy.idle, 0)
    close(economy.rates.wood, 1 / 12)
    close(economy.rates.stone, 1 / 15)
    close(economy.rates.food, 0.1 - 3 * FOOD_PER_PERSON_SECOND)
    const before = { ...state.resources }
    assert.deepEqual(tick(state, 10), [])
    close(state.resources.wood, before.wood + economy.rates.wood * 10)
    close(state.resources.stone, before.stone + economy.rates.stone * 10)
    close(state.resources.food, before.food + economy.rates.food * 10)
    assert.deepEqual(state.stats.gathered, { wood: 0, stone: 0, food: 0 })
  })

  it('arrives exactly on the interval and charges both arrival meals and changing consumption', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    assert.deepEqual(tick(state, ARRIVAL_INTERVAL - 0.1), [])
    assert.equal(state.population, 3)
    const first = tick(state, 0.1)
    assert.equal(first.filter((event) => event.kind === 'arrival').length, 1)
    assert.equal(state.population, 4)
    close(state.arrivalProgress, 0)
    close(state.resources.food, 100 - 3 * FOOD_PER_PERSON_SECOND * ARRIVAL_INTERVAL - 2)
    assert.equal(tick(state, ARRIVAL_INTERVAL).filter((event) => event.kind === 'arrival').length, 1)
    close(state.resources.food, 100 - 7 * FOOD_PER_PERSON_SECOND * ARRIVAL_INTERVAL - 4)
    assert.equal(state.population, 5)
    assert.deepEqual(tick(state, ARRIVAL_INTERVAL), [])
    assert.equal(state.population, 5)
    assert.equal(state.arrivalProgress, 0)
  })

  it('handles several arrivals in one tick and caps both housing and population', () => {
    const state = fundedState()
    state.resources.food = 10000
    addHousing(state, 9)
    assert.equal(getEconomy(state).housing, MAX_POPULATION)
    const events = tick(state, 10000)
    assert.equal(events.filter((event) => event.kind === 'arrival').length, MAX_POPULATION - 3)
    assert.equal(state.population, MAX_POPULATION)
    assert.equal(state.time, 10000)
    assert.equal(state.arrivalProgress, 0)
  })

  it('does not accrue arrival time without spare beds', () => {
    const state = fundedState()
    tick(state, 100)
    assert.equal(state.population, 3)
    assert.equal(state.arrivalProgress, 0)
    build(state, 'cottage', [1, 0, 0])
    tick(state, ARRIVAL_INTERVAL - 1)
    assert.equal(state.population, 3)
    tick(state, 1)
    assert.equal(state.population, 4)
  })

  it('pauses arrival progress when food is low and resumes after restocking', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    tick(state, 10)
    state.resources.food = 7
    tick(state, 20)
    assert.equal(state.population, 3)
    assert.equal(state.arrivalProgress, 10)
    state.resources.food = 20
    tick(state, 20)
    assert.equal(state.population, 4)
    assert.equal(state.arrivalProgress, 0)
  })

  it('requires 30 eligible seconds after recovering to the wellbeing threshold', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    state.wellbeing = 50
    tick(state, 49)
    assert.equal(state.population, 3)
    close(state.arrivalProgress, 29)
    tick(state, 1)
    assert.equal(state.population, 4)
    close(state.wellbeing, 75)
  })

  it('can arrive with exactly 8 food at the boundary, but cannot accrue time below it', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    state.resources.food = 8 + 3 * FOOD_PER_PERSON_SECOND * ARRIVAL_INTERVAL
    tick(state, ARRIVAL_INTERVAL)
    assert.equal(state.population, 4)
    close(state.resources.food, 6)
    tick(state, ARRIVAL_INTERVAL)
    assert.equal(state.population, 4)
    assert.equal(state.arrivalProgress, 0)
  })

  it('starts the arrival clock only after production raises food to 8', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    const garden = build(state, 'garden', [-1, 0, 0])
    assignWorker(state, garden, 1)
    state.resources.food = 0
    const foodRate = getEconomy(state).rates.food
    tick(state, 8 / foodRate + ARRIVAL_INTERVAL)
    assert.equal(state.population, 4)
    close(state.resources.food, 8 + foodRate * ARRIVAL_INTERVAL - 2)
    assert.equal(state.wellbeing, 100)
  })

  it('handles food depletion midway through a tick and never kills hungry settlers', () => {
    const state = createInitialState()
    state.resources.food = 3 * FOOD_PER_PERSON_SECOND * 10
    state.wellbeing = 90
    tick(state, 30)
    assert.equal(state.resources.food, 0)
    close(state.wellbeing, 75)
    tick(state, 10000)
    assert.equal(state.wellbeing, 0)
    assert.equal(state.population, 3)
    assert.equal(getEconomy(state).rates.food, -3 * FOOD_PER_PERSON_SECOND)
  })

  it('recovers wellbeing when fed, including production into an empty pantry', () => {
    const state = fundedState()
    state.resources.food = 0
    state.wellbeing = 50
    tick(state, 10)
    assert.equal(state.wellbeing, 40)
    const garden = build(state, 'garden', [1, 0, 0])
    assignWorker(state, garden, 1)
    tick(state, 20)
    assert.equal(state.wellbeing, 50)
    tick(state, 200)
    assert.equal(state.wellbeing, 100)
    assert.ok(state.resources.food > 0)
  })

  it('emits threshold warnings once, not on every tick of continued hunger', () => {
    const state = createInitialState()
    state.resources.food = 8.1
    assert.equal(tick(state, 10).filter((event) => event.kind === 'warning').length, 1)
    assert.deepEqual(tick(state, 10), [])
    const starvation = tick(state, 500)
    assert.equal(starvation.filter((event) => event.kind === 'warning').length, 2)
    assert.deepEqual(tick(state, 500), [])
    assert.deepEqual(tick(state, 0.1), [])
  })

  it('does not advance zero-duration steps and rejects invalid deltas before mutation', () => {
    const state = createInitialState()
    const before = structuredClone(state)
    assert.deepEqual(tick(state, 0), [])
    for (const delta of [-1, NaN, Infinity, -Infinity]) {
      assert.throws(() => tick(state, delta), RangeError)
      assert.deepEqual(state, before)
    }
    state.time = Number.MAX_VALUE
    const overflow = structuredClone(state)
    assert.throws(() => tick(state, Number.MAX_VALUE), RangeError)
    assert.deepEqual(state, overflow)
  })

  it('keeps fractional frame sizes stable at an exact arrival boundary', () => {
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    const events: SimulationEvent[] = []
    for (let i = 0; i < 300; i++) events.push(...tick(state, 0.1))
    assert.equal(state.population, 4)
    assert.equal(events.filter((event) => event.kind === 'arrival').length, 1)
    close(state.arrivalProgress, 0)
    close(state.time, ARRIVAL_INTERVAL)
  })

  for (const scenario of ['arrivals', 'hunger', 'recovery', 'food gate']) {
    it(`matches a large tick to small timesteps through ${scenario}`, () => {
      const whole = fundedState()
      addHousing(whole, 2)
      if (scenario === 'hunger') {
        whole.resources.food = 0.24
        whole.wellbeing = 90
      } else if (scenario === 'recovery') {
        whole.resources.food = 0
        whole.wellbeing = 30
        const garden = build(whole, 'garden', [0, 0, 1])
        assignWorker(whole, garden, 1)
      } else if (scenario === 'food gate') {
        whole.resources.food = 8.1
        whole.arrivalProgress = 10
      }
      const split = structuredClone(whole)
      const wholeEvents = tick(whole, 240)
      const splitEvents: SimulationEvent[] = []
      for (let i = 0; i < 2400; i++) splitEvents.push(...tick(split, 0.1))
      assertSameSimulation(whole, split)
      assert.deepEqual(wholeEvents, splitEvents)
    })
  }
})

describe('demolition and objectives', () => {
  it('protects the hearth and occupied housing without mutation', () => {
    const state = fundedState()
    assertUnchanged(state, () => demolishBuilding(state, 'hearth'))
    assertUnchanged(state, () => demolishBuilding(state, 'missing'))
    const cottage = build(state, 'cottage', [1, 0, 0])
    tick(state, ARRIVAL_INTERVAL)
    assertUnchanged(state, () => demolishBuilding(state, cottage))
    build(state, 'cottage', [-1, 0, 0])
    assert.equal(demolishBuilding(state, cottage).ok, true)
    assert.ok(getEconomy(state).housing >= state.population)
  })

  it('refunds half the costs, releases workers, and preserves lifetime build statistics', () => {
    const state = fundedState()
    const garden = build(state, 'garden', [1, 0, 0])
    assignWorker(state, garden, 1)
    assignWorker(state, garden, 1)
    const before = { ...state.resources }
    const result = demolishBuilding(state, garden)
    assert.equal(result.ok, true)
    assert.match(result.message, /7 wood, 2 stone/)
    assert.equal(state.resources.wood, before.wood + Math.floor(BUILDINGS.garden.cost.wood / 2))
    assert.equal(state.resources.stone, before.stone + Math.floor(BUILDINGS.garden.cost.stone / 2))
    assert.equal(state.resources.food, before.food)
    assert.equal(state.buildings.length, 1)
    assert.equal(getEconomy(state).employed, 0)
    assert.equal(getEconomy(state).idle, 3)
    assert.equal(state.stats.buildingsBuilt, 1)
    assertUnchanged(state, () => demolishBuilding(state, garden))
  })

  it('derives all five objectives from hand gathering, existing buildings, jobs, and wellbeing', () => {
    const state = fundedState()
    assert.equal(getObjectives(state).length, 5)
    assert.ok(getObjectives(state).every((objective) => !objective.complete))
    const tree = resourceNode('tree')
    gatherResource(state, tree)
    gatherResource(state, tree)
    assert.equal(getObjectives(state)[0].complete, false)
    gatherResource(state, tree)
    assert.equal(getObjectives(state)[0].complete, true)
    build(state, 'cottage', [1, 0, 0])
    assert.equal(getObjectives(state)[1].complete, true)
    const garden = build(state, 'garden', [-1, 0, 0])
    assert.equal(getObjectives(state)[2].complete, false)
    assignWorker(state, garden, 1)
    assert.equal(getObjectives(state)[2].complete, true)
    const lumberyard = build(state, 'lumberyard', [0, 0, 1])
    const quarry = build(state, 'quarry', [0, 0, -1])
    assignWorker(state, lumberyard, 1)
    assert.equal(getObjectives(state)[3].complete, false)
    assignWorker(state, quarry, 1)
    assert.equal(getObjectives(state)[3].complete, true)
    build(state, 'cottage', [0, -1, 0])
    tick(state, 3 * ARRIVAL_INTERVAL)
    assert.equal(state.population, 6)
    state.wellbeing = 74.99
    assert.equal(getObjectives(state)[4].complete, false)
    state.wellbeing = 75
    assert.ok(getObjectives(state).every((objective) => objective.complete))
    assignWorker(state, quarry, -1)
    assert.equal(getObjectives(state)[3].complete, false)
    assignWorker(state, garden, -1)
    assert.equal(getObjectives(state)[2].complete, false)
    const objectives = getObjectives(state)
    assert.equal(new Set(objectives.map((objective) => objective.id)).size, 5)
  })
})

describe('save validation', () => {
  it('roundtrips initial and active settlements without advancing time or sharing objects', () => {
    const initial = createInitialState()
    assert.deepEqual(parseSave(serializeSave(initial)), initial)
    const state = fundedState()
    build(state, 'cottage', [1, 0, 0])
    const garden = build(state, 'garden', [-1, 0, 0])
    assignWorker(state, garden, 1)
    gatherResource(state, resourceNode('tree'))
    gatherResource(state, resourceNode('berries'))
    gatherResource(state, resourceNode('berries'))
    tick(state, 12.5)
    const restored = parseSave(serializeSave(state))
    assert.deepEqual(restored, state)
    assert.notEqual(restored.resources, state.resources)
    assert.notEqual(restored.buildings[0].normal, state.buildings[0].normal)
    assert.notEqual(restored.player.forward, state.player.forward)
    assert.equal(restored.time, 12.5)
    tick(state, 100)
    assert.deepEqual(parseSave(serializeSave(state)), state)
  })

  it('wraps JSON syntax errors in SaveValidationError', () => {
    for (const raw of ['', '{', 'undefined', '{"version":1,}', '[NaN]', 'Infinity']) {
      assert.throws(() => parseSave(raw), SaveValidationError)
    }
    const error = new SaveValidationError('bad save')
    assert.equal(error.name, 'SaveValidationError')
    assert.ok(error instanceof Error)
  })

  const initial = createInitialState()
  const invalidStates: [string, unknown][] = [
    ['null root', null],
    ['array root', []],
    ['primitive root', 1],
    ['missing fields', { version: 1 }],
    ['unknown fields', { ...initial, extra: true }],
    ['unsupported version', { ...initial, version: 2 }],
    ['negative time', { ...initial, time: -1 }],
    ['string time', { ...initial, time: '1' }],
    ['null time', { ...initial, time: null }],
    ['negative resource', { ...initial, resources: { ...initial.resources, food: -1 } }],
    ['missing resource', { ...initial, resources: { wood: 12, stone: 8 } }],
    ['null resource', { ...initial, resources: { ...initial.resources, wood: NaN } }],
    ['nonfinite resource', { ...initial, resources: { ...initial.resources, wood: Infinity } }],
    ['string resource', { ...initial, resources: { ...initial.resources, wood: '12' } }],
    ['fractional population', { ...initial, population: 2.5 }],
    ['negative population', { ...initial, population: -1 }],
    ['population above cap', { ...initial, population: MAX_POPULATION + 1 }],
    ['population above housing', { ...initial, population: 4 }],
    ['negative wellbeing', { ...initial, wellbeing: -1 }],
    ['excess wellbeing', { ...initial, wellbeing: 100.01 }],
    ['negative arrival timer', { ...initial, arrivalProgress: -1 }],
    ['excess arrival timer', { ...initial, arrivalProgress: ARRIVAL_INTERVAL + 0.1 }],
    ['invalid building collection', { ...initial, buildings: {} }],
    ['no hearth', { ...initial, buildings: [] }],
    ['unknown building', { ...initial, buildings: [{ ...initial.buildings[0], type: 'castle' }] }],
    ['empty building ID', { ...initial, buildings: [{ ...initial.buildings[0], id: '' }] }],
    ['reserved building ID', { ...initial, buildings: [{ ...initial.buildings[0], id: '__proto__' }] }],
    ['unnormalized building', { ...initial, buildings: [{ ...initial.buildings[0], normal: [0, 2, 0] }] }],
    ['nonfinite rotation', { ...initial, buildings: [{ ...initial.buildings[0], rotation: Infinity }] }],
    ['staffed hearth', { ...initial, buildings: [{ ...initial.buildings[0], workers: 1 }] }],
    ['negative workers', { ...initial, buildings: [{ ...initial.buildings[0], workers: -1 }] }],
    ['fractional workers', { ...initial, buildings: [{ ...initial.buildings[0], workers: 0.5 }] }],
    ['missing player', { ...initial, player: null }],
    ['nonunit normal', { ...initial, player: { ...initial.player, normal: [0, 0, 0] } }],
    ['nonunit forward', { ...initial, player: { ...initial.player, forward: [0, 0, -2] } }],
    ['nontangent forward', { ...initial, player: { ...initial.player, forward: [0, 1, 0] } }],
    ['oversized vector', { ...initial, player: { ...initial.player, normal: [0, 1, 0, 0] } }],
    ['string vector', { ...initial, player: { ...initial.player, normal: ['0', 1, 0] } }],
    ['nonfinite vector', { ...initial, player: { ...initial.player, normal: [NaN, 1, 0] } }],
    ['missing stats', { ...initial, stats: {} }],
    ['negative gathered count', { ...initial, stats: { ...initial.stats, gathered: { wood: -1, stone: 0, food: 0 } } }],
    ['fractional gathered count', { ...initial, stats: { ...initial.stats, gathered: { wood: 0.5, stone: 0, food: 0 } } }],
    ['fractional building counter', { ...initial, stats: { ...initial.stats, buildingsBuilt: 0.5 } }],
    ['unsafe building counter', { ...initial, stats: { ...initial.stats, buildingsBuilt: 2 ** 53 } }],
    ['negative building counter', { ...initial, stats: { ...initial.stats, buildingsBuilt: -1 } }],
    ['missing node states', { ...initial, nodeStates: undefined }],
    ['array node states', { ...initial, nodeStates: [] }],
    ['negative harvest actions', { ...initial, nodeStates: { 'tree-0': { remaining: -1, readyAt: 0 } } }],
    ['fractional harvest actions', { ...initial, nodeStates: { 'tree-0': { remaining: 1.5, readyAt: 0 } } }],
    ['excess harvest actions', { ...initial, nodeStates: { 'tree-0': { remaining: 4, readyAt: 0 } } }],
    ['excess berry harvest actions', { ...initial, nodeStates: { 'berries-0': { remaining: 3, readyAt: 0 } } }],
    ['negative regrowth timer', { ...initial, nodeStates: { 'tree-0': { remaining: 0, readyAt: -1 } } }],
    ['impossible regrowth timer', { ...initial, nodeStates: { 'tree-0': { remaining: 0, readyAt: 91 } } }],
    ['active regrowth timer', { ...initial, nodeStates: { 'tree-0': { remaining: 1, readyAt: 90 } } }],
    ['missing node timer', { ...initial, nodeStates: { 'tree-0': { remaining: 1 } } }],
    ['empty node ID', { ...initial, nodeStates: { '': { remaining: 1, readyAt: 0 } } }],
    ['prototype node ID', { ...initial, nodeStates: { ['__proto__']: { remaining: 1, readyAt: 0 } } }],
  ]
  for (const [name, value] of invalidStates) {
    it(`rejects ${name}`, () => {
      assert.throws(() => parseSave(JSON.stringify(value)), SaveValidationError)
    })
  }

  it('rejects nonfinite numbers encoded as otherwise valid JSON exponents', () => {
    const raw = serializeSave(createInitialState())
    for (const replacement of ['1e400', '-1e400']) {
      assert.throws(() => parseSave(raw.replace('"time":0', `"time":${replacement}`)), SaveValidationError)
      assert.throws(() => parseSave(raw.replace('"wood":12', `"wood":${replacement}`)), SaveValidationError)
    }
  })

  it('rejects duplicate IDs, multiple hearths, worker overcapacity, and inconsistent statistics', () => {
    const state = fundedState()
    const garden = build(state, 'garden', [1, 0, 0])
    const lumberyard = build(state, 'lumberyard', [-1, 0, 0])
    const encode = (buildings: Building[]) => JSON.stringify({ ...state, buildings })
    assert.throws(() => parseSave(encode(state.buildings.map((entry) =>
      entry.id === garden ? { ...entry, id: 'hearth' } : entry))), SaveValidationError)
    assert.throws(() => parseSave(encode([
      ...state.buildings, { ...state.buildings[0], id: 'second-hearth' },
    ])), SaveValidationError)
    assert.throws(() => parseSave(encode(state.buildings.map((entry) =>
      entry.id === garden ? { ...entry, workers: 3 } : entry))), SaveValidationError)
    assert.throws(() => parseSave(encode(state.buildings.map((entry) =>
      entry.id === garden || entry.id === lumberyard ? { ...entry, workers: 2 } : entry))), SaveValidationError)
    assert.throws(() => parseSave(JSON.stringify({
      ...state, stats: { ...state.stats, buildingsBuilt: 0 },
    })), SaveValidationError)
  })

  it('rejects invalid state before serializing rather than writing null for nonfinite numbers', () => {
    const state = createInitialState()
    state.resources.wood = NaN
    assert.throws(() => serializeSave(state), SaveValidationError)
  })
})
