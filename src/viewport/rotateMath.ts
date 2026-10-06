// 旋轉 gizmo 的純數學：把指標移動換算成「繞軸旋轉的角度」。

import type { Px } from './extrudeMath.ts'

export type V3 = [number, number, number]

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/**
 * 繞 axis（單位向量，過 center）從 p0 轉到 p1 的有號角度（度，右手定則）。
 * 兩點先投影到垂直於軸的平面；其中一點在軸上（無方向）回傳 0。
 */
export function angleAboutAxis(center: V3, axis: V3, p0: V3, p1: V3): number {
  const flatten = (p: V3): V3 => {
    const v = sub(p, center)
    const k = dot(v, axis)
    return [v[0] - axis[0] * k, v[1] - axis[1] * k, v[2] - axis[2] * k]
  }
  const a = flatten(p0)
  const b = flatten(p1)
  if (Math.hypot(...a) < 1e-9 || Math.hypot(...b) < 1e-9) return 0
  const angle = Math.atan2(dot(axis, cross(a, b)), dot(a, b))
  return (angle * 180) / Math.PI
}

/**
 * 螢幕空間的角度變化（度）：以 center 為圓心、逆時針為正（螢幕 y 向下，所以翻號）。
 * 環幾乎側對相機、射線打不到環平面時的備援。
 */
export function screenAngleDelta(center: Px, p0: Px, p1: Px): number {
  const a0 = Math.atan2(-(p0.y - center.y), p0.x - center.x)
  const a1 = Math.atan2(-(p1.y - center.y), p1.x - center.x)
  let d = a1 - a0
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return (d * 180) / Math.PI
}

/** 把角度吸附到 step 的倍數；step ≤ 0 不吸附。 */
export function snapAngle(deg: number, step: number): number {
  return step > 0 ? Math.round(deg / step) * step : deg
}

/** 點到折線（環取樣）的最短螢幕距離——環的命中測試。 */
export function distanceToPolyline(p: Px, pts: Px[]): number {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lenSq = abx * abx + aby * aby
    let t = lenSq < 1e-9 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)))
  }
  return best
}
