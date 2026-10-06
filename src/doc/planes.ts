// 建構平面：由 journal 推導（kernel 不需要）。
// 偏移平面 = 基準平面（法向 + 基準點）沿法向平移 offset；草圖與擠出都直接用推導出的 SketchPlane。

import { planeFromNormal } from '../sketch/plane.ts'
import type { SketchPlane, Vec3Tuple } from '../sketch/model.ts'
import type { JournalOp } from './journal.ts'

export interface PlaneEntity {
  planeId: number
  name: string
  plane: SketchPlane
  /** 顯示用方塊的中心與邊長（mm）。 */
  center: Vec3Tuple
  size: number
  offset: number
}

export function derivePlanes(ops: JournalOp[]): Map<number, PlaneEntity> {
  const planes = new Map<number, PlaneEntity>()
  for (const op of ops) {
    if (op.kind !== 'plane') continue
    if (op.action === 'delete') {
      planes.delete(op.planeId)
      continue
    }
    const n = op.normal
    const len = Math.hypot(n[0], n[1], n[2]) || 1
    const unit: Vec3Tuple = [n[0] / len, n[1] / len, n[2] / len]
    const center: Vec3Tuple = [
      op.point[0] + unit[0] * op.offset,
      op.point[1] + unit[1] * op.offset,
      op.point[2] + unit[2] * op.offset,
    ]
    planes.set(op.planeId, {
      planeId: op.planeId,
      name: op.name,
      plane: planeFromNormal(unit, center),
      center,
      size: op.size,
      offset: op.offset,
    })
  }
  return planes
}

export function nextPlaneId(ops: JournalOp[]): number {
  let max = 0
  for (const op of ops) if (op.kind === 'plane') max = Math.max(max, op.planeId)
  return max + 1
}
