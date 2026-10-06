// 草圖實體由 journal 推導（不存 kernel 狀態）：
// 'sketch' op 增刪曲線、'extrude' op 標記被消耗的區域。
// 純函式——主執行緒在每次文件變動後重新推導，再交給 viewport 同步畫面。

import type { MeshData } from '../kernel/protocol.ts'
import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import type { JournalOp } from './journal.ts'

export interface SketchEntity {
  sketchId: number
  plane: SketchPlane
  hostBodyId: number | null
  curves: SketchCurve[]
  /** 已被擠出的區域（regionKey），畫面上不再顯示為可擠出區域。 */
  consumed: Set<string>
  /** 此草圖出現過的最大 curve id（刪掉的也算），新曲線從這之後編號。 */
  maxCurveId: number
}

export function deriveSketches(ops: JournalOp[]): Map<number, SketchEntity> {
  const sketches = new Map<number, SketchEntity>()
  const maxCurveIds = new Map<number, number>()
  for (const op of ops) {
    if (op.kind === 'sketch') {
      let entity = sketches.get(op.sketchId)
      if (!entity) {
        entity = {
          sketchId: op.sketchId,
          plane: op.plane,
          hostBodyId: op.hostBodyId,
          curves: [],
          consumed: new Set(),
          maxCurveId: maxCurveIds.get(op.sketchId) ?? 0,
        }
        sketches.set(op.sketchId, entity)
      }
      if (op.remove.length > 0) {
        const removed = new Set(op.remove)
        entity.curves = entity.curves.filter((c) => !removed.has(c.id))
      }
      for (const curve of op.add) {
        entity.curves.push({ ...curve })
        entity.maxCurveId = Math.max(entity.maxCurveId, curve.id)
      }
      maxCurveIds.set(op.sketchId, entity.maxCurveId)
      // 曲線刪光的草圖從場景消失（id 不重用，見 nextSketchId）
      if (entity.curves.length === 0) sketches.delete(op.sketchId)
    } else if (op.kind === 'extrude' && op.sketchId !== undefined && op.regionKey) {
      sketches.get(op.sketchId)?.consumed.add(op.regionKey)
    }
  }
  return sketches
}

/** 新草圖的 id：比 journal 中出現過的任何草圖都大（避免沿用舊 id 繼承到舊的消耗標記）。 */
export function nextSketchId(ops: JournalOp[]): number {
  let max = 0
  for (const op of ops) {
    if (op.kind === 'sketch') max = Math.max(max, op.sketchId)
  }
  return max + 1
}

const PLANE_DOT_TOL = 1 - 1e-6
const PLANE_OFFSET_TOL = 1e-3

/** 同一個平面（法線同向、位於同一高度）。 */
export function samePlane(a: SketchPlane, b: SketchPlane): boolean {
  const dot = a.normal[0] * b.normal[0] + a.normal[1] * b.normal[1] + a.normal[2] * b.normal[2]
  if (dot < PLANE_DOT_TOL) return false
  const offset =
    (a.origin[0] - b.origin[0]) * a.normal[0] +
    (a.origin[1] - b.origin[1]) * a.normal[1] +
    (a.origin[2] - b.origin[2]) * a.normal[2]
  return Math.abs(offset) < PLANE_OFFSET_TOL
}

/** 在同一平面、同一宿主上已有的草圖——新畫的線併進去，區域才會彼此切割。 */
export function findSketchOnPlane(
  sketches: Map<number, SketchEntity>,
  plane: SketchPlane,
  hostBodyId: number | null,
): SketchEntity | undefined {
  for (const sketch of sketches.values()) {
    if (sketch.hostBodyId === hostBodyId && samePlane(sketch.plane, plane)) return sketch
  }
  return undefined
}

/**
 * 區域的幾何指紋（面積 + 形心，四捨五入到 0.1）。同一組曲線的區域偵測結果是確定的，
 * 所以指紋穩定；之後若有新曲線把它切開，指紋改變、子區域會重新出現——這正是要的行為。
 */
export function regionKey(mesh: MeshData): string {
  const p = mesh.positions
  const idx = mesh.indices
  let area = 0
  let cx = 0
  let cy = 0
  let cz = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3
    const b = idx[t + 1] * 3
    const c = idx[t + 2] * 3
    const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2]
    const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const triArea = Math.hypot(nx, ny, nz) / 2
    area += triArea
    cx += (triArea * (p[a] + p[b] + p[c])) / 3
    cy += (triArea * (p[a + 1] + p[b + 1] + p[c + 1])) / 3
    cz += (triArea * (p[a + 2] + p[b + 2] + p[c + 2])) / 3
  }
  if (area < 1e-9) return 'empty'
  const r = (v: number) => (Math.round(v * 10) / 10).toFixed(1)
  return `${r(area)}@${r(cx / area)},${r(cy / area)},${r(cz / area)}`
}
