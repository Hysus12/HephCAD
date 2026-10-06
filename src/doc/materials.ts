// 外觀（顏色、透明度）：由 journal 推導，kernel 不知道。
// 副本（複製、陣列、保留原本體的布林結果）沿用來源本體當下的外觀。

import type { JournalOp } from './journal.ts'

export interface BodyMaterial {
  color: string
  opacity: number
}

export const DEFAULT_MATERIAL: BodyMaterial = { color: '#9a9aa0', opacity: 1 }
export const MIN_OPACITY = 0.05

export function clampOpacity(value: number): number {
  return Math.min(1, Math.max(MIN_OPACITY, value))
}

/** 只回傳「與預設不同」的本體；本體消失後不再出現。 */
export function deriveMaterials(
  ops: JournalOp[],
  aliveBodyIds: ReadonlySet<number>,
): Map<number, BodyMaterial> {
  const materials = new Map<number, BodyMaterial>()
  const inherit = (from: number, to: number) => {
    const source = materials.get(from)
    if (source && to > 0) materials.set(to, { ...source })
  }
  for (const op of ops) {
    if (op.kind === 'material') {
      for (const id of op.bodyIds) {
        const current = materials.get(id) ?? DEFAULT_MATERIAL
        materials.set(id, {
          color: op.color ?? current.color,
          opacity: op.opacity === undefined ? current.opacity : clampOpacity(op.opacity),
        })
      }
    } else if (op.kind === 'copyBody') {
      inherit(op.sourceBodyId, op.bodyId)
    } else if (op.kind === 'pattern') {
      for (const id of op.resultBodyIds) inherit(op.sourceBodyId, id)
    } else if (op.kind === 'boolean' && op.keepOriginals) {
      inherit(op.targetId, op.resultBodyId)
    }
  }
  for (const id of [...materials.keys()]) if (!aliveBodyIds.has(id)) materials.delete(id)
  return materials
}
