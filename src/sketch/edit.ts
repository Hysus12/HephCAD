// 草圖編輯：改變一條線的長度、或移動一條線的端點。
// 沒有約束求解器——用「相接的端點跟著動」這條務實規則近似 Shapr3D 的約束行為：
//   移動端點 P（位移 d）時，所有端點也在 P 的曲線一起處理：
//     · 與 d 垂直的直線：整條平移 d（保持方向與長度），並在它的另一端繼續傳遞
//     · 其他（平行、斜向、圓弧）：只移動共用的那個端點
// 結果：矩形改一邊長仍是矩形；多邊形/折線則是頂點被拉動、鄰邊跟著伸縮。

import { distance, type SketchCurve, type Vec2 } from './model.ts'

/** 兩點視為同一個接點的距離（mm）。 */
const JOIN_EPS = 1e-3
/** 直線與 d「垂直」的容差（cos 值）。 */
const PERP_EPS = 1e-6

type Line = Extract<SketchCurve, { kind: 'line' }>

const near = (a: Vec2, b: Vec2) => distance(a, b) < JOIN_EPS

/** 只回傳「有變動」的曲線（新版本，id 不變）。 */
export function resizeLineConnected(
  curves: SketchCurve[],
  lineId: number,
  newLength: number,
): SketchCurve[] | null {
  const line = curves.find((c): c is Line => c.id === lineId && c.kind === 'line')
  if (!line || !(newLength > 0)) return null
  const len = distance(line.a, line.b)
  if (len < 1e-9) return null
  const k = newLength / len
  const delta: Vec2 = { x: (line.b.x - line.a.x) * (k - 1), y: (line.b.y - line.a.y) * (k - 1) }
  return moveJoint(curves, line.id, line.b, delta)
}

/**
 * 把「curveId 的端點 joint」移動 delta，並依上面的規則傳遞到相接曲線。
 * curveId 自己只移動該端點（它是被編輯的那條）。
 */
export function moveJoint(
  curves: SketchCurve[],
  curveId: number,
  joint: Vec2,
  delta: Vec2,
): SketchCurve[] {
  const result = new Map<number, SketchCurve>()
  const current = (id: number) => result.get(id) ?? curves.find((c) => c.id === id)!
  const dLen = Math.hypot(delta.x, delta.y)
  if (dLen < 1e-12) return []

  const visited = new Set<number>()
  const queue: { fromId: number; point: Vec2 }[] = [{ fromId: curveId, point: joint }]

  // 被編輯的曲線本身：只動指定端點
  const self = curves.find((c) => c.id === curveId)
  if (!self) return []
  result.set(curveId, withEndpointMoved(self, joint, delta))
  visited.add(curveId)

  while (queue.length > 0) {
    const { fromId, point } = queue.shift()!
    for (const other of curves) {
      if (other.id === fromId || visited.has(other.id)) continue
      const original = current(other.id)
      if (!hasEndpointAt(original, point)) continue
      if (original.kind === 'line' && isPerpendicular(original, delta, dLen)) {
        // 與位移垂直的直線：整條平移，另一端再往下傳
        const farEnd = near(original.a, point) ? original.b : original.a
        result.set(other.id, translate(original, delta))
        visited.add(other.id)
        queue.push({ fromId: other.id, point: farEnd })
      } else {
        result.set(other.id, withEndpointMoved(original, point, delta))
        visited.add(other.id)
      }
    }
  }
  return [...result.values()]
}

function hasEndpointAt(c: SketchCurve, p: Vec2): boolean {
  if (c.kind === 'line') return near(c.a, p) || near(c.b, p)
  if (c.kind === 'arc') return near(c.start, p) || near(c.end, p)
  return false
}

function isPerpendicular(line: Line, d: Vec2, dLen: number): boolean {
  const lx = line.b.x - line.a.x
  const ly = line.b.y - line.a.y
  const ll = Math.hypot(lx, ly)
  if (ll < 1e-9) return false
  return Math.abs((lx * d.x + ly * d.y) / (ll * dLen)) < PERP_EPS
}

function translate(c: Line, d: Vec2): Line {
  return {
    ...c,
    a: { x: c.a.x + d.x, y: c.a.y + d.y },
    b: { x: c.b.x + d.x, y: c.b.y + d.y },
  }
}

function withEndpointMoved(c: SketchCurve, p: Vec2, d: Vec2): SketchCurve {
  const moved = (v: Vec2): Vec2 => ({ x: v.x + d.x, y: v.y + d.y })
  if (c.kind === 'line') {
    return near(c.a, p) ? { ...c, a: moved(c.a) } : { ...c, b: moved(c.b) }
  }
  if (c.kind === 'arc') {
    return near(c.start, p) ? { ...c, start: moved(c.start) } : { ...c, end: moved(c.end) }
  }
  return c
}
