import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { PLANET_RADIUS } from './config.ts'
import { advanceOnSphere, mapNormal, seededRandom, surfaceDistance, surfaceQuaternion, surfaceRadius, tangentForward } from './math.ts'

test('walking a complete great circle returns to the starting point without losing radial gravity', () => {
  let normal = new Vector3(0, 1, 0)
  let forward = new Vector3(0, 0, -1)
  const step = Math.PI * 2 * PLANET_RADIUS / 1000
  for (let i = 0; i < 1000; i++) {
    const moved = advanceOnSphere(normal, forward, step)
    normal = moved.normal
    forward.applyQuaternion(moved.transport)
    assert.ok(Math.abs(normal.length() - 1) < 1e-10)
    assert.ok(Math.abs(normal.dot(forward)) < 1e-10)
  }
  assert.ok(normal.distanceTo(new Vector3(0, 1, 0)) < 1e-9)
  assert.ok(forward.distanceTo(new Vector3(0, 0, -1)) < 1e-9)
})

test('spherical movement is frame-rate independent', () => {
  const normal = new Vector3(0, 1, 0)
  const forward = new Vector3(0, 0, -1)
  const whole = advanceOnSphere(normal, forward, 9)
  const half = advanceOnSphere(normal, forward, 4.5)
  const second = advanceOnSphere(half.normal, forward.clone().applyQuaternion(half.transport), 4.5)
  assert.ok(whole.normal.distanceTo(second.normal) < 1e-12)
  assert.ok(Math.abs(surfaceDistance(normal, whole.normal) - 9) < 1e-10)
})

test('character up remains outward even at the south pole', () => {
  for (const normal of [new Vector3(0, -1, 0), new Vector3(0, 0, -1), mapNormal(8, -4)]) {
    const quaternion = surfaceQuaternion(normal)
    const up = new Vector3(0, 1, 0).applyQuaternion(quaternion)
    assert.ok(up.distanceTo(normal) < 1e-10)
    assert.ok(Math.abs(tangentForward(normal).dot(normal)) < 1e-10)
  }
})

test('deterministic scenery and traversable surfaces are stable', () => {
  const a = seededRandom(27)
  const b = seededRandom(27)
  for (let i = 0; i < 100; i++) {
    assert.equal(a(), b())
    const radius = surfaceRadius(mapNormal(i - 50, i * 0.3))
    assert.ok(Number.isFinite(radius) && radius > PLANET_RADIUS - 0.2)
  }
})
