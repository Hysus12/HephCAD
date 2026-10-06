import type { SketchPlane, Vec3Tuple } from './model.ts'

/**
 * 由法線與平面上一點建立草圖座標系，與世界座標對齊：
 * 原點 = 世界原點在平面上的投影（網格因此與世界網格對齊），
 * xDir = 世界 +X 投影到平面（法線接近 X 時改用 +Y），yDir = n × xDir。
 * 地面（法線 +Z）因此恰好是 GROUND_PLANE。
 */
export function planeFromNormal(normal: Vec3Tuple, point: Vec3Tuple): SketchPlane {
  const n = normalize(normal)
  const d = dot(n, point)
  const origin: Vec3Tuple = [n[0] * d, n[1] * d, n[2] * d]

  const ref: Vec3Tuple = Math.abs(n[0]) > 0.99 ? [0, 1, 0] : [1, 0, 0]
  const k = dot(ref, n)
  const xDir = normalize([ref[0] - k * n[0], ref[1] - k * n[1], ref[2] - k * n[2]])
  const yDir = cross(n, xDir)
  return { origin, xDir, yDir, normal: n }
}

function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}
