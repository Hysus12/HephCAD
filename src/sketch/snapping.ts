// Snapping 引擎：優先序 端點 > 中點 > 圓心 > 水平/垂直對齊 > 網格。
// tolerance 是世界單位（mm），由呼叫端依縮放程度從螢幕 px 換算。

import {
  curveEndpoints,
  curveMidAndCenter,
  distance,
  type SketchCurve,
  type Vec2,
} from './model.ts'

export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'axis' | 'grid' | 'none'

export interface SnapResult {
  point: Vec2
  kind: SnapKind
  /** axis snap 時的方向（給導引線渲染）。 */
  axis?: 'h' | 'v'
  /** axis snap 的參考錨點。 */
  anchor?: Vec2
}

export interface SnapOptions {
  curves: SketchCurve[]
  /** 世界單位容差。 */
  tolerance: number
  /** 網格間距；null 關閉網格吸附。 */
  gridSpacing: number | null
  /** 筆劃起點，供水平/垂直對齊；null 關閉。 */
  axisAnchor: Vec2 | null
}

export function snapPoint(raw: Vec2, opts: SnapOptions): SnapResult {
  const { curves, tolerance, gridSpacing, axisAnchor } = opts

  const byPriority: Array<{ kind: SnapKind; points: Vec2[] }> = [
    { kind: 'endpoint', points: curves.flatMap(curveEndpoints) },
    { kind: 'midpoint', points: curves.flatMap((c) => curveMidAndCenter(c).midpoints) },
    { kind: 'center', points: curves.flatMap((c) => curveMidAndCenter(c).centers) },
  ]
  for (const { kind, points } of byPriority) {
    const best = nearestWithin(raw, points, tolerance)
    if (best) return { point: best, kind }
  }

  // 水平/垂直對齊：先對齊軸，剩下的自由座標再嘗試網格。
  if (axisAnchor) {
    const dx = Math.abs(raw.x - axisAnchor.x)
    const dy = Math.abs(raw.y - axisAnchor.y)
    if (dx <= tolerance || dy <= tolerance) {
      const vertical = dx <= dy // 較近的軸勝出
      const point: Vec2 = vertical
        ? { x: axisAnchor.x, y: maybeGrid(raw.y, gridSpacing, tolerance) }
        : { x: maybeGrid(raw.x, gridSpacing, tolerance), y: axisAnchor.y }
      return { point, kind: 'axis', axis: vertical ? 'v' : 'h', anchor: axisAnchor }
    }
  }

  if (gridSpacing) {
    const gx = Math.round(raw.x / gridSpacing) * gridSpacing
    const gy = Math.round(raw.y / gridSpacing) * gridSpacing
    if (distance(raw, { x: gx, y: gy }) <= tolerance) {
      return { point: { x: gx, y: gy }, kind: 'grid' }
    }
  }

  return { point: raw, kind: 'none' }
}

function nearestWithin(raw: Vec2, points: Vec2[], tolerance: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = tolerance
  for (const p of points) {
    const d = distance(raw, p)
    if (d <= bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

function maybeGrid(value: number, gridSpacing: number | null, tolerance: number): number {
  if (!gridSpacing) return value
  const g = Math.round(value / gridSpacing) * gridSpacing
  return Math.abs(g - value) <= tolerance ? g : value
}
