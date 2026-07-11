// 拖曳擠出的螢幕→高度換算。純數學、可測試。

export interface Px {
  x: number
  y: number
}

/**
 * 由拖曳向量求擠出高度。
 * axisScreenPxPerUnit：平面法線方向每 1 世界單位在螢幕上的位移（px），
 * 由呼叫端用相機投影 origin 與 origin+normal 兩點求得。
 * 高度 = 拖曳向量在該軸上的投影 / 軸長平方（把 px 換回世界單位）。
 * 軸在螢幕上退化（正對法線看）時回傳 0。
 */
export function dragHeight(start: Px, current: Px, axisScreenPxPerUnit: Px): number {
  const ax = axisScreenPxPerUnit.x
  const ay = axisScreenPxPerUnit.y
  const lenSq = ax * ax + ay * ay
  if (lenSq < 1e-6) return 0
  const dx = current.x - start.x
  const dy = current.y - start.y
  return (dx * ax + dy * ay) / lenSq
}

/** 點到線段的距離（px），Z 軸把手的命中測試用。 */
export function distanceToSegment(p: Px, a: Px, b: Px): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}
