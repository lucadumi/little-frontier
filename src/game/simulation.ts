import {
  ARRIVAL_INTERVAL,
  BUILDINGS,
  FOOD_PER_PERSON_SECOND,
  getBuildingInvestment,
  getBuildingStats,
  getUpgradeCost,
  HEARTH_NORMAL,
  HEARTH_UPGRADE_POPULATION,
  MAX_POPULATION,
  NODE_DEFINITIONS,
  PLANET_RADIUS,
  START_FORWARD,
  START_NORMAL,
  STARTING_RESOURCES,
} from './config.ts'
import type {
  ActionResult,
  BuildableType,
  Building,
  BuildingLevel,
  BuildingType,
  EconomySummary,
  GameState,
  Inventory,
  NodeKind,
  NodeState,
  NodeStatus,
  Objective,
  Resource,
  ResourceNode,
  SimulationEvent,
  UpgradeInfo,
  Vec3,
} from './types.ts'

const RESOURCES: Resource[] = ['wood', 'stone', 'food']
const NODE_KINDS: NodeKind[] = ['tree', 'rock', 'berries']
const ARRIVAL_FOOD = 8
const ARRIVAL_COST = 2
const ARRIVAL_WELLBEING = 60
const FED_RECOVERY = 0.5
const HUNGER_DECAY = 1
const TIME_EPSILON = 1e-9
const VECTOR_EPSILON = 1e-6

export function createInitialState(): GameState {
  return {
    version: 2,
    time: 0,
    resources: { ...STARTING_RESOURCES },
    buildings: [{
      id: 'hearth',
      type: 'hearth',
      level: 1,
      normal: [...HEARTH_NORMAL],
      rotation: 0,
      workers: 0,
    }],
    population: 3,
    wellbeing: 100,
    arrivalProgress: 0,
    nodeStates: {},
    player: { normal: [...START_NORMAL], forward: [...START_FORWARD] },
    stats: { gathered: { wood: 0, stone: 0, food: 0 }, buildingsBuilt: 0 },
  }
}

function production(state: GameState): Inventory {
  const rates: Inventory = { wood: 0, stone: 0, food: 0 }
  for (const building of state.buildings) {
    const stats = getBuildingStats(building)
    for (const resource of RESOURCES) {
      rates[resource] += stats.production[resource] * building.workers
    }
  }
  return rates
}

export function getEconomy(state: GameState): EconomySummary {
  const rates = production(state)
  rates.food -= state.population * FOOD_PER_PERSON_SECOND
  const housing = Math.min(MAX_POPULATION, state.buildings.reduce(
    (total, building) => total + getBuildingStats(building).beds, 0,
  ))
  const employed = state.buildings.reduce((total, building) => total + building.workers, 0)
  const moraleLabel = state.wellbeing >= 80 ? 'Thriving'
    : state.wellbeing >= 60 ? 'Content'
      : state.wellbeing >= 30 ? 'Worried' : 'Needs care'
  return { housing, employed, idle: state.population - employed, rates, moraleLabel }
}

function foodWarnings(before: number, after: number, events: SimulationEvent[]): void {
  if (before >= ARRIVAL_FOOD && after < ARRIVAL_FOOD) {
    events.push({ kind: 'warning', message: 'Food is running low. Gather berries or staff a garden.' })
  }
  if (before > 0 && after === 0) {
    events.push({ kind: 'warning', message: 'The pantry is empty. Your settlers need food to feel better.' })
  }
}

export function tick(state: GameState, deltaSeconds: number): SimulationEvent[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Simulation time must be a finite, nonnegative number of seconds.')
  }
  const endTime = state.time + deltaSeconds
  const output = production(state)
  if (!Number.isFinite(endTime) || RESOURCES.some((resource) =>
    !Number.isFinite(state.resources[resource] + output[resource] * deltaSeconds))) {
    throw new RangeError('This simulation step would exceed the supported numeric range.')
  }
  const events: SimulationEvent[] = []
  if (deltaSeconds === 0) return events
  const housing = getEconomy(state).housing
  let remainingTime = deltaSeconds

  // Stop at food, morale, and arrival boundaries rather than depending on frame size.
  while (true) {
    if (state.arrivalProgress >= ARRIVAL_INTERVAL - TIME_EPSILON
      && state.population < housing
      && state.wellbeing >= ARRIVAL_WELLBEING
      && state.resources.food >= ARRIVAL_FOOD) {
      const beforeFood = state.resources.food
      state.population += 1
      state.resources.food -= ARRIVAL_COST
      state.arrivalProgress = Math.max(0, state.arrivalProgress - ARRIVAL_INTERVAL)
      events.push({
        kind: 'arrival',
        message: `A new settler has arrived! Your frontier is home to ${state.population}.`,
      })
      foodWarnings(beforeFood, state.resources.food, events)
      continue
    }
    if (remainingTime === 0) break

    const foodRate = output.food - state.population * FOOD_PER_PERSON_SECOND
    const starving = state.resources.food === 0 && foodRate < 0
    const moraleRate = starving ? -HUNGER_DECAY : FED_RECOVERY
    const eligible = state.population < housing
      && state.wellbeing >= ARRIVAL_WELLBEING
      && (state.resources.food > ARRIVAL_FOOD
        || (state.resources.food === ARRIVAL_FOOD && foodRate >= 0))

    let foodBoundary = 0
    let foodBoundaryTime = Infinity
    if (foodRate < 0 && state.resources.food > 0) {
      foodBoundary = state.resources.food > ARRIVAL_FOOD ? ARRIVAL_FOOD : 0
      foodBoundaryTime = (state.resources.food - foodBoundary) / -foodRate
    } else if (foodRate > 0 && state.resources.food < ARRIVAL_FOOD) {
      foodBoundary = ARRIVAL_FOOD
      foodBoundaryTime = (foodBoundary - state.resources.food) / foodRate
    }

    let moraleBoundaryTime = Infinity
    if ((moraleRate > 0 && state.wellbeing < ARRIVAL_WELLBEING)
      || (moraleRate < 0 && state.wellbeing > ARRIVAL_WELLBEING)) {
      moraleBoundaryTime = (ARRIVAL_WELLBEING - state.wellbeing) / moraleRate
    }
    const arrivalBoundaryTime = eligible
      ? Math.max(0, ARRIVAL_INTERVAL - state.arrivalProgress) : Infinity
    const step = Math.min(remainingTime, foodBoundaryTime, moraleBoundaryTime, arrivalBoundaryTime)
    const beforeFood = state.resources.food
    const beforeWellbeing = state.wellbeing

    state.resources.wood += output.wood * step
    state.resources.stone += output.stone * step
    state.resources.food = Math.max(0, state.resources.food + foodRate * step)
    state.wellbeing = Math.max(0, Math.min(100, state.wellbeing + moraleRate * step))
    if (foodBoundaryTime - step <= TIME_EPSILON) state.resources.food = foodBoundary
    if (moraleBoundaryTime - step <= TIME_EPSILON) state.wellbeing = ARRIVAL_WELLBEING
    if (eligible) {
      state.arrivalProgress += step
      if (arrivalBoundaryTime - step <= TIME_EPSILON) state.arrivalProgress = ARRIVAL_INTERVAL
    }
    foodWarnings(beforeFood, state.resources.food, events)
    if (beforeWellbeing >= ARRIVAL_WELLBEING && state.wellbeing < ARRIVAL_WELLBEING) {
      events.push({
        kind: 'warning',
        message: 'Your settlers are feeling low. A steady food supply will help them recover.',
      })
    }
    remainingTime = Math.max(0, remainingTime - step)
  }
  state.time = endTime
  return events
}

export function getObjectives(state: GameState): Objective[] {
  const has = (type: BuildableType, staffed = false) => state.buildings.some(
    (building) => building.type === type && (!staffed || building.workers > 0),
  )
  return [
    {
      id: 'gather-wood',
      title: 'A handful of possibilities',
      description: 'Gather 12 wood by hand from meadow trees.',
      complete: state.stats.gathered.wood >= 12,
    },
    {
      id: 'build-cottage',
      title: 'Room to belong',
      description: 'Build a cottage to welcome more settlers.',
      complete: has('cottage'),
    },
    {
      id: 'staff-garden',
      title: 'Good things take root',
      description: 'Build a garden and assign at least one grower.',
      complete: has('garden', true),
    },
    {
      id: 'staff-industry',
      title: 'Many hands',
      description: 'Have both a staffed lumberyard and a staffed quarry.',
      complete: has('lumberyard', true) && has('quarry', true),
    },
    {
      id: 'grow-settlement',
      title: 'A little frontier',
      description: 'Reach 6 settlers with wellbeing of at least 75.',
      complete: state.population >= 6 && state.wellbeing >= 75,
    },
  ]
}

export function canAfford(resources: Inventory, cost: Inventory): boolean {
  return RESOURCES.every((resource) => Number.isFinite(resources[resource])
    && Number.isFinite(cost[resource]) && cost[resource] >= 0
    && resources[resource] >= cost[resource])
}

export function getUpgradeInfo(state: GameState, building: Building): UpgradeInfo {
  const cost = getUpgradeCost(building.type, building.level)
  if (!cost) {
    return { nextLevel: null, cost: null, available: false, reason: 'Fully upgraded.', benefit: 'Maximum level reached' }
  }
  const nextLevel = building.level === 1 ? 2 : 3
  const nextStats = getBuildingStats({ type: building.type, level: nextLevel })
  let benefit: string
  if (building.type === 'hearth') benefit = `Unlock level ${nextLevel} buildings`
  else if (building.type === 'cottage') benefit = `Add one bed (${nextStats.beds} total)`
  else {
    const resource = building.type === 'garden' ? 'food' : building.type === 'lumberyard' ? 'wood' : 'stone'
    const amount = (nextStats.production[resource] * 60).toLocaleString(undefined, { maximumFractionDigits: 1 })
    benefit = `${amount} ${resource} per worker / min`
  }
  let reason = ''
  if (building.type === 'hearth') {
    const required = HEARTH_UPGRADE_POPULATION[nextLevel]
    if (state.population < required) reason = `Welcome ${required} settlers first (${state.population} / ${required}).`
    else if (state.wellbeing < ARRIVAL_WELLBEING) reason = 'Keep wellbeing at 60% or higher before expanding the hearth.'
  } else {
    const hearth = state.buildings.find((entry) => entry.type === 'hearth')
    if (!hearth || hearth.level < nextLevel) reason = `Upgrade the hearth to level ${nextLevel} first.`
  }
  if (!reason && !canAfford(state.resources, cost)) {
    const missing = RESOURCES.filter((entry) => state.resources[entry] < cost[entry])
      .map((entry) => `${Math.ceil(cost[entry] - state.resources[entry])} ${entry}`)
    reason = `Gather ${missing.join(' and ')} first.`
  }
  return { nextLevel, cost, available: !reason, reason, benefit }
}

export function upgradeBuilding(state: GameState, buildingId: string): ActionResult {
  const building = state.buildings.find((entry) => entry.id === buildingId)
  if (!building) return { ok: false, message: 'That building could not be found.' }
  const upgrade = getUpgradeInfo(state, building)
  if (!upgrade.available || !upgrade.cost || !upgrade.nextLevel) {
    return { ok: false, message: upgrade.reason }
  }
  for (const resource of RESOURCES) state.resources[resource] -= upgrade.cost[resource]
  building.level = upgrade.nextLevel
  return {
    ok: true,
    message: `${BUILDINGS[building.type].name} reached level ${building.level}.`,
    buildingId,
  }
}

export function getNodeStatus(state: GameState, node: ResourceNode): NodeStatus {
  const definition = NODE_DEFINITIONS[node.kind]
  const saved = Object.hasOwn(state.nodeStates, node.id) ? state.nodeStates[node.id] : undefined
  if (!saved || (saved.remaining === 0 && state.time >= saved.readyAt)) {
    return { remaining: definition.capacity, capacity: definition.capacity, secondsUntilRegrowth: 0 }
  }
  return {
    remaining: saved.remaining,
    capacity: definition.capacity,
    secondsUntilRegrowth: saved.remaining === 0 ? Math.max(0, saved.readyAt - state.time) : 0,
  }
}

export function gatherResource(state: GameState, node: ResourceNode): ActionResult {
  if (!isNodeKind(node.kind) || !isIdentifier(node.id)) {
    return { ok: false, message: 'This resource node is not valid.' }
  }
  const definition = NODE_DEFINITIONS[node.kind]
  const status = getNodeStatus(state, node)
  if (status.remaining === 0) {
    return {
      ok: false,
      message: `${definition.name} is regrowing. Try again in ${Math.ceil(status.secondsUntilRegrowth)} seconds.`,
    }
  }
  const remaining = status.remaining - 1
  state.nodeStates[node.id] = {
    remaining,
    readyAt: remaining === 0 ? state.time + definition.regrowth : 0,
  }
  state.resources[definition.resource] += definition.yield
  state.stats.gathered[definition.resource] += definition.yield
  return {
    ok: true,
    message: `Gathered ${definition.yield} ${definition.resource}.`,
    resource: definition.resource,
    amount: definition.yield,
  }
}

function isBuildableType(value: unknown): value is BuildableType {
  return value === 'cottage' || value === 'garden' || value === 'lumberyard' || value === 'quarry'
}

function isBuildingType(value: unknown): value is BuildingType {
  return value === 'hearth' || isBuildableType(value)
}

function isBuildingLevel(value: unknown): value is BuildingLevel {
  return value === 1 || value === 2 || value === 3
}

function isNodeKind(value: unknown): value is NodeKind {
  return value === 'tree' || value === 'rock' || value === 'berries'
}

function isUnitVector(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3
    && value.every((component: unknown) => typeof component === 'number' && Number.isFinite(component))
    && Math.abs(Math.hypot(value[0], value[1], value[2]) - 1) <= VECTOR_EPSILON
}

function surfaceDistance(a: Vec3, b: Vec3): number {
  const cosine = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * PLANET_RADIUS
}

export function placeBuilding(
  state: GameState, type: BuildableType, normal: Vec3, rotation: number,
): ActionResult {
  if (!isBuildableType(type)) return { ok: false, message: 'That building type is not available.' }
  if (!isUnitVector(normal) || !Number.isFinite(rotation)) {
    return { ok: false, message: 'Choose a valid position and rotation on the planet.' }
  }
  const definition = BUILDINGS[type]
  if (!canAfford(state.resources, definition.cost)) {
    const missing = RESOURCES.filter((resource) => state.resources[resource] < definition.cost[resource])
      .map((resource) => `${Math.ceil(definition.cost[resource] - state.resources[resource])} ${resource}`)
    return { ok: false, message: `Not enough materials for a ${definition.name.toLowerCase()}. Need ${missing.join(', ')}.` }
  }
  const obstacle = state.buildings.find((building) =>
    surfaceDistance(normal, building.normal) < definition.footprint + BUILDINGS[building.type].footprint - 1e-8)
  if (obstacle) {
    return { ok: false, message: `Too close to ${BUILDINGS[obstacle.type].name.toLowerCase()}. Leave room between buildings.` }
  }
  if (!Number.isSafeInteger(state.stats.buildingsBuilt + 1)) {
    return { ok: false, message: 'The building record is full.' }
  }
  const baseId = `building-${state.stats.buildingsBuilt + 1}`
  const usedIds = new Set(state.buildings.map((building) => building.id))
  let id = baseId
  let suffix = 2
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`

  for (const resource of RESOURCES) state.resources[resource] -= definition.cost[resource]
  state.buildings.push({ id, type, level: 1, normal: [...normal], rotation, workers: 0 })
  state.stats.buildingsBuilt += 1
  return { ok: true, message: `${definition.name} built.`, buildingId: id }
}

export function assignWorker(state: GameState, buildingId: string, change: 1 | -1): ActionResult {
  const building = state.buildings.find((entry) => entry.id === buildingId)
  if (!building) return { ok: false, message: 'That building could not be found.' }
  if (change !== 1 && change !== -1) return { ok: false, message: 'Assign or release one worker at a time.' }
  const definition = BUILDINGS[building.type]
  if (change === 1) {
    if (definition.maxWorkers === 0) return { ok: false, message: `${definition.name} does not need workers.` }
    if (building.workers >= definition.maxWorkers) return { ok: false, message: `${definition.name} is fully staffed.` }
    if (getEconomy(state).idle <= 0) return { ok: false, message: 'No idle settlers are available.' }
  } else if (building.workers === 0) {
    return { ok: false, message: 'There are no workers to release here.' }
  }
  building.workers += change
  return {
    ok: true,
    message: change === 1 ? `A worker joined the ${definition.name.toLowerCase()}.` : 'A settler is now available for other work.',
    buildingId,
  }
}

export function demolishBuilding(state: GameState, buildingId: string): ActionResult {
  const index = state.buildings.findIndex((building) => building.id === buildingId)
  const building = state.buildings[index]
  if (!building) return { ok: false, message: 'That building could not be found.' }
  if (building.type === 'hearth') return { ok: false, message: 'The founders\' hearth must stay.' }
  const remainingBeds = state.buildings.reduce(
    (total, entry) => total + (entry.id === buildingId ? 0 : getBuildingStats(entry).beds), 0,
  )
  if (Math.min(MAX_POPULATION, remainingBeds) < state.population) {
    return { ok: false, message: 'These beds are needed. Build another cottage before removing this one.' }
  }
  const definition = BUILDINGS[building.type]
  const investment = getBuildingInvestment(building)
  const refunds = RESOURCES.map((resource) => {
    const amount = Math.floor(investment[resource] / 2)
    state.resources[resource] += amount
    return amount > 0 ? `${amount} ${resource}` : ''
  }).filter(Boolean)
  state.buildings.splice(index, 1)
  return {
    ok: true,
    message: `${definition.name} removed. Recovered ${refunds.join(', ')}. Assigned settlers are available again.`,
    buildingId,
  }
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveValidationError'
  }
}

function invalid(path: string, detail: string): never {
  throw new SaveValidationError(`Invalid save: ${path} ${detail}.`)
}

function readObject(value: unknown, path: string, keys?: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(path, 'must be an object')
  }
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(value))
  if (keys && (keys.some((key) => !Object.hasOwn(record, key))
    || Object.keys(record).some((key) => !keys.includes(key)))) {
    return invalid(path, 'has missing or unexpected fields')
  }
  return record
}

function readNumber(value: unknown, path: string, minimum = 0, maximum = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return invalid(path, `must be a finite number between ${minimum} and ${maximum}`)
  }
  return value
}

function readInteger(value: unknown, path: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const number = readNumber(value, path, 0, maximum)
  if (!Number.isSafeInteger(number)) return invalid(path, 'must be a safe integer')
  return number
}

function readInventory(value: unknown, path: string, integer = false): Inventory {
  const record = readObject(value, path, RESOURCES)
  const read = integer ? readInteger : readNumber
  return {
    wood: read(record.wood, `${path}.wood`),
    stone: read(record.stone, `${path}.stone`),
    food: read(record.food, `${path}.food`),
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
    && value !== '__proto__' && value !== 'constructor' && value !== 'prototype'
}

function readIdentifier(value: unknown, path: string): string {
  if (!isIdentifier(value)) return invalid(path, 'must be a valid nonempty identifier')
  return value
}

function readVector(value: unknown, path: string): Vec3 {
  if (!isUnitVector(value)) return invalid(path, 'must be a normalized three-dimensional vector')
  return [value[0], value[1], value[2]]
}

function validateState(value: unknown): GameState {
  const record = readObject(value, 'state', [
    'version', 'time', 'resources', 'buildings', 'population', 'wellbeing',
    'arrivalProgress', 'nodeStates', 'player', 'stats',
  ])
  if (record.version !== 1 && record.version !== 2) return invalid('version', 'must be 1 or 2')
  const legacy = record.version === 1
  const time = readNumber(record.time, 'time')
  const resources = readInventory(record.resources, 'resources')
  const population = readInteger(record.population, 'population', MAX_POPULATION)
  const wellbeing = readNumber(record.wellbeing, 'wellbeing', 0, 100)
  const arrivalProgress = readNumber(record.arrivalProgress, 'arrivalProgress', 0, ARRIVAL_INTERVAL)
  if (!Array.isArray(record.buildings) || record.buildings.length > 4096) {
    return invalid('buildings', 'must be a reasonably sized array')
  }
  const ids = new Set<string>()
  const buildings: Building[] = record.buildings.map((entry: unknown, index: number) => {
    const path = `buildings[${index}]`
    const building = readObject(entry, path, ['id', 'type', 'normal', 'rotation', 'workers', ...(legacy ? [] : ['level'])])
    const id = readIdentifier(building.id, `${path}.id`)
    if (ids.has(id)) return invalid(`${path}.id`, 'duplicates another building')
    ids.add(id)
    if (!isBuildingType(building.type)) return invalid(`${path}.type`, 'is not a known building type')
    const level = legacy ? 1 : building.level
    if (!isBuildingLevel(level)) return invalid(`${path}.level`, 'must be 1, 2, or 3')
    return {
      id,
      type: building.type,
      level,
      normal: readVector(building.normal, `${path}.normal`),
      rotation: readNumber(building.rotation, `${path}.rotation`, -Infinity),
      workers: readInteger(building.workers, `${path}.workers`, BUILDINGS[building.type].maxWorkers),
    }
  })
  const hearth = buildings.find((building) => building.type === 'hearth')
  if (!hearth || buildings.filter((building) => building.type === 'hearth').length !== 1) {
    return invalid('buildings', 'must contain exactly one hearth')
  }
  if (buildings.some((building) => building.level > hearth.level)) {
    return invalid('buildings', 'cannot have a higher level than the hearth')
  }
  if (buildings.reduce((total, building) => total + building.workers, 0) > population) {
    return invalid('workers', 'exceed the settlement population')
  }
  if (buildings.reduce((total, building) => total + getBuildingStats(building).beds, 0) < population) {
    return invalid('population', 'exceeds available housing')
  }

  const playerRecord = readObject(record.player, 'player', ['normal', 'forward'])
  const normal = readVector(playerRecord.normal, 'player.normal')
  const forward = readVector(playerRecord.forward, 'player.forward')
  if (Math.abs(normal[0] * forward[0] + normal[1] * forward[1] + normal[2] * forward[2]) > VECTOR_EPSILON) {
    return invalid('player.forward', 'must be tangent to the planet')
  }
  const statsRecord = readObject(record.stats, 'stats', ['gathered', 'buildingsBuilt'])
  const gathered = readInventory(statsRecord.gathered, 'stats.gathered', true)
  const buildingsBuilt = readInteger(statsRecord.buildingsBuilt, 'stats.buildingsBuilt')
  if (buildingsBuilt < buildings.length - 1) return invalid('stats.buildingsBuilt', 'is smaller than the existing building count')

  const nodes = readObject(record.nodeStates, 'nodeStates')
  if (Object.keys(nodes).length > 10000) return invalid('nodeStates', 'contains too many entries')
  const nodeStates: Record<string, NodeState> = {}
  for (const [id, value] of Object.entries(nodes)) {
    readIdentifier(id, 'nodeStates key')
    const path = `nodeStates.${id}`
    const node = readObject(value, path, ['remaining', 'readyAt'])
    const kind = NODE_KINDS.find((entry) => id.startsWith(`${entry}-`))
    const capacity = kind ? NODE_DEFINITIONS[kind].capacity
      : Math.max(...NODE_KINDS.map((entry) => NODE_DEFINITIONS[entry].capacity))
    const regrowth = kind ? NODE_DEFINITIONS[kind].regrowth
      : Math.max(...NODE_KINDS.map((entry) => NODE_DEFINITIONS[entry].regrowth))
    const remaining = readInteger(node.remaining, `${path}.remaining`, capacity)
    const readyAt = readNumber(node.readyAt, `${path}.readyAt`)
    if (remaining > 0 && readyAt !== 0) return invalid(path, 'cannot regrow while harvest actions remain')
    if (remaining === 0 && (readyAt === 0 || readyAt - time > regrowth + TIME_EPSILON)) {
      return invalid(`${path}.readyAt`, 'is outside the possible regrowth window')
    }
    nodeStates[id] = { remaining, readyAt }
  }

  return {
    version: 2,
    time,
    resources,
    buildings,
    population,
    wellbeing,
    arrivalProgress,
    nodeStates,
    player: { normal, forward },
    stats: { gathered, buildingsBuilt },
  }
}

export function serializeSave(state: GameState): string {
  return JSON.stringify(validateState(state))
}

export function parseSave(raw: string): GameState {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) throw new SaveValidationError('This save is not valid JSON.')
    throw error
  }
  return validateState(value)
}
