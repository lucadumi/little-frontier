import { mapNormal } from '../src/game/math.ts'
import { assignWorker, createInitialState, placeBuilding } from '../src/game/simulation.ts'

export function villageFixture(population = 8) {
  const state = createInitialState()
  state.resources = { wood: 1000, stone: 1000, food: 1000 }
  for (const [x, z] of [[4.8, -1.5], [-4.8, -3.5], [4.8, 3.2]]) {
    const result = placeBuilding(state, 'cottage', mapNormal(x, z).toArray(), 0)
    if (!result.ok) throw new Error(result.message)
  }
  const garden = placeBuilding(state, 'garden', mapNormal(0, 4.5).toArray(), 0)
  if (!garden.ok || !garden.buildingId) throw new Error(garden.message)
  const assigned = assignWorker(state, garden.buildingId, 1)
  if (!assigned.ok) throw new Error(assigned.message)
  state.population = population
  return { state, gardenId: garden.buildingId, cottageId: state.buildings[1].id }
}
