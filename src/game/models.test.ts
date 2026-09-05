import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Box3, Mesh } from 'three'
import { BUILDINGS } from './config.ts'
import { createBuildingModel, disposeModel } from './models.ts'

for (const type of ['hearth', 'cottage', 'garden', 'lumberyard', 'quarry'] as const) {
  test(`${type} upgrades have distinct models without expanding their placement footprint`, () => {
    let previousMeshes = 0
    for (const level of [1, 2, 3] as const) {
      const model = createBuildingModel(type, level)
      let meshes = 0
      model.traverse((object) => { if (object instanceof Mesh) meshes++ })
      assert.ok(meshes > previousMeshes)
      previousMeshes = meshes
      const bounds = new Box3().setFromObject(model, true)
      const limit = BUILDINGS[type].footprint + 0.3
      assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= limit)
      assert.ok(Number.isFinite(bounds.max.y) && bounds.max.y > 0.5)
      disposeModel(model)
    }
  })
}
