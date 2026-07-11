// 文件 = 線性操作日誌（journal）。每個 op 自包含重放所需的全部參數；
// bodyId 在首次執行時由 kernel 指派並記回 op，重放時強制沿用，
// 讓後續 op 的 hostBodyId 引用永遠有效（ADR 0002/0003）。

import type { SketchCurve, SketchPlane } from '../sketch/model.ts'

export type Translation = [number, number, number]

export type JournalOp =
  | {
      kind: 'createBox'
      /** 0 = 待 kernel 指派。 */
      bodyId: number
      name: string
      dx: number
      dy: number
      dz: number
      at?: Translation
    }
  | {
      kind: 'createCylinder'
      bodyId: number
      name: string
      radius: number
      height: number
      at?: Translation
    }
  | { kind: 'deleteBody'; bodyId: number }
  | {
      kind: 'extrude'
      plane: SketchPlane
      curves: SketchCurve[]
      /** 區域偵測結果中的索引（0-based），同輸入下順序確定。 */
      regionIndex: number
      height: number
      /** 有宿主：>0 fuse、<0 cut；null = 建獨立新 body。 */
      hostBodyId: number | null
      /** 獨立新 body 的 id（有宿主時為 null）。 */
      newBodyId: number | null
      name: string | null
    }
  | { kind: 'importStep'; bodyId: number; name: string; data: string }

export interface JournalEntry {
  label: string
  op: JournalOp
}

/** 存進 OPFS 的文件格式。 */
export interface DocumentFile {
  version: 1
  entries: JournalEntry[]
  cursor: number
}

export function opLabel(op: JournalOp, nameOf: (bodyId: number) => string): string {
  switch (op.kind) {
    case 'createBox':
      return `建立 ${op.name}`
    case 'createCylinder':
      return `建立 ${op.name}`
    case 'deleteBody':
      return `刪除 ${nameOf(op.bodyId)}`
    case 'extrude':
      if (op.hostBodyId === null) return `擠出 ${Math.abs(op.height).toFixed(1)}mm`
      return op.height >= 0
        ? `擠出加料 ${op.height.toFixed(1)}mm`
        : `擠出切除 ${Math.abs(op.height).toFixed(1)}mm`
    case 'importStep':
      return `匯入 "${op.name}"`
  }
}

/** 重放 ops 後每個存活 body 的名稱。 */
export function aliveBodyNames(ops: JournalOp[]): Map<number, string> {
  const names = new Map<number, string>()
  for (const op of ops) {
    switch (op.kind) {
      case 'createBox':
      case 'createCylinder':
      case 'importStep':
        names.set(op.bodyId, op.name)
        break
      case 'deleteBody':
        names.delete(op.bodyId)
        break
      case 'extrude':
        if (op.hostBodyId === null && op.newBodyId !== null) {
          names.set(op.newBodyId, op.name ?? `主體 ${op.newBodyId}`)
        }
        break
    }
  }
  return names
}
