import { Matrix4, Quaternion, Vector3 } from 'three'
import { PLANET_RADIUS, WATER_LEVEL } from './config.ts'

const UP = new Vector3(0, 1, 0)
const NORTH = new Vector3(0, 0, -1)

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

export function sphereFramingDistance(radius: number, verticalFov: number, aspect: number): number {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(verticalFov)
    || verticalFov <= 0 || verticalFov >= 180 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('Framing a sphere requires a positive radius, a valid field of view, and a positive aspect ratio.')
  }
  const verticalHalfAngle = verticalFov * Math.PI / 360
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect)
  return radius * 1.12 / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle))
}

export function terrainHeight(normal: Vector3): number {
  const { x, y, z } = normal
  const continents = Math.sin(x * 3.8 - 0.4) * Math.cos(z * 3.2 + 0.5)
    + Math.sin(y * 5.4 + z * 2) * 0.3
  const hills = Math.sin(x * 14 + y * 5) * Math.cos(z * 12 - y * 7) * 0.15
    + Math.sin(z * 26 + x * 19) * Math.cos(y * 21) * 0.045
  const wild = continents * 0.88 + hills + 0.03
  const clearing = smoothstep(0.8, 0.94, y)
  return wild * (1 - clearing) + 0.36 * clearing
}

export function isWater(normal: Vector3): boolean {
  return terrainHeight(normal) < WATER_LEVEL + 0.035
}

export function surfaceRadius(normal: Vector3): number {
  return PLANET_RADIUS + Math.max(terrainHeight(normal), WATER_LEVEL + 0.015)
}

export function surfacePoint(normal: Vector3, lift = 0): Vector3 {
  return normal.clone().multiplyScalar(surfaceRadius(normal) + lift)
}

export function mapNormal(x: number, z: number): Vector3 {
  return new Vector3(x, PLANET_RADIUS, z).normalize()
}

export function surfaceDistance(a: Vector3, b: Vector3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * PLANET_RADIUS
}

export function tangentForward(normal: Vector3, preferred = NORTH): Vector3 {
  const forward = preferred.clone().projectOnPlane(normal)
  if (forward.lengthSq() < 0.000001) {
    forward.copy(Math.abs(normal.y) < 0.9 ? UP : new Vector3(1, 0, 0)).projectOnPlane(normal)
  }
  return forward.normalize()
}

export function surfaceQuaternion(normal: Vector3, forward = tangentForward(normal)): Quaternion {
  const tangent = tangentForward(normal, forward)
  const right = new Vector3().crossVectors(tangent, normal).normalize()
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(right, normal, tangent.negate()),
  )
}

export function advanceOnSphere(normal: Vector3, direction: Vector3, distance: number): {
  normal: Vector3
  transport: Quaternion
} {
  const tangent = tangentForward(normal, direction)
  const axis = new Vector3().crossVectors(normal, tangent).normalize()
  const transport = new Quaternion().setFromAxisAngle(axis, distance / PLANET_RADIUS)
  return { normal: normal.clone().applyQuaternion(transport).normalize(), transport }
}
