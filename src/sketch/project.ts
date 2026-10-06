// 投影：把 3D 折線（模型邊的鑲嵌）或另一張草圖的曲線，正投影到目標草圖平面，
// 再把 2D 折線還原成直線 / 圓 / 圓弧：
//   · 共線的連續線段合併成一條直線
//   · 折線落在同一個圓上 → 圓（封閉）或圓弧（開放）
//   · 斜投影的圓會變橢圓，擬合失敗，退回折線段（鑲嵌精度，不是真橢圓）

import {
  discretizeCurve,
  distance,
  uvToWorld,
  worldToUv,
  type SketchCurve,
  type SketchPlane,
  type Vec2,
  type Vec3Tuple,
} from './model.ts'

const DUP_EPS = 1e-6
/** 擬合圓/共線的相對容差。 */
const FIT_TOL = 2e-3

/** 3D 折線 → 目標平面上的曲線（id 暫為 0，由呼叫端指派）。 */
export function projectPolyline(plane: SketchPlane, points: Vec3Tuple[]): SketchCurve[] {
  const pts: Vec2[] = []
  for (const p of points) {
    const uv = worldToUv(plane, p)
    const last = pts[pts.length - 1]
    if (!last || distance(last, uv) > DUP_EPS) pts.push(uv)
  }
  if (pts.length < 2) return []

  const closed = pts.length > 3 && distance(pts[0], pts[pts.length - 1]) < 1e-4
  const fit = pts.length >= 4 ? fitCircle(pts, closed) : null
  if (fit && closed) {
    const center = { x: round4(fit.center.x), y: round4(fit.center.y) }
    return [{ id: 0, kind: 'circle', center, radius: round4(fit.radius) }]
  }
  if (fit) {
    return [
      {
        id: 0,
        kind: 'arc',
        start: pts[0],
        through: pts[Math.floor(pts.length / 2)],
        end: pts[pts.length - 1],
      },
    ]
  }
  return mergeCollinear(pts)
}

/** 另一張草圖的曲線投影到目標平面。 */
export function projectSketchCurves(
  source: SketchPlane,
  curves: SketchCurve[],
  target: SketchPlane,
): SketchCurve[] {
  const result: SketchCurve[] = []
  for (const curve of curves) {
    const sampled = discretizeCurve(curve, 96).map((p) => uvToWorld(source, p))
    result.push(...projectPolyline(target, sampled))
  }
  return result
}

/** 模型邊的鑲嵌折線（edgePositions 中 [start, start+count) 的線段對）。 */
export function edgePolyline(positions: ArrayLike<number>, start: number, count: number): Vec3Tuple[] {
  const pts: Vec3Tuple[] = []
  for (let v = start; v + 1 < start + count; v += 2) {
    const a = v * 3
    const b = (v + 1) * 3
    if (pts.length === 0) pts.push([positions[a], positions[a + 1], positions[a + 2]])
    pts.push([positions[b], positions[b + 1], positions[b + 2]])
  }
  return pts
}

function mergeCollinear(pts: Vec2[]): SketchCurve[] {
  const curves: SketchCurve[] = []
  let runStart = 0
  const scale = Math.max(1e-9, ...pts.map((p) => distance(p, pts[0])))
  for (let i = 1; i < pts.length; i++) {
    const isLast = i === pts.length - 1
    const continues =
      !isLast && deviationFromLine(pts[runStart], pts[i + 1], pts[i]) <= FIT_TOL * scale
    if (!continues) {
      curves.push({ id: 0, kind: 'line', a: pts[runStart], b: pts[i] })
      runStart = i
    }
  }
  return curves
}

/** 點 p 到直線 ab 的距離。 */
function deviationFromLine(a: Vec2, b: Vec2, p: Vec2): number {
  const len = distance(a, b)
  if (len < 1e-12) return distance(a, p)
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
}

function fitCircle(pts: Vec2[], closed: boolean): { center: Vec2; radius: number } | null {
  const a = pts[0]
  const b = pts[Math.floor(pts.length / 2)]
  const c = closed ? pts[Math.floor(pts.length / 4)] : pts[pts.length - 1]
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const aa = a.x * a.x + a.y * a.y
  const bb = b.x * b.x + b.y * b.y
  const cc = c.x * c.x + c.y * c.y
  const center: Vec2 = {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d,
  }
  const radius = distance(a, center)
  if (!(radius > 1e-6)) return null
  for (const p of pts) {
    if (Math.abs(distance(p, center) - radius) > FIT_TOL * radius + 1e-6) return null
  }
  return { center, radius }
}

/** 擬合出的圓心/半徑去掉浮點雜訊（0.1 µm），標籤才不會顯示 49.9999982。 */
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4
}
