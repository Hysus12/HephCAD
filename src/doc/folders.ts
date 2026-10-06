// 項目管理的資料夾：由 journal 推導（與草圖相同的做法），kernel 完全不知道。
// 一個本體最多在一個資料夾；陣列自動建立資料夾（auto），空了就消失。

import type { JournalOp } from './journal.ts'

export interface FolderEntity {
  folderId: number
  name: string
  bodyIds: number[]
  /** 陣列自動建立的資料夾：沒有成員就不顯示。 */
  auto: boolean
}

export function deriveFolders(ops: JournalOp[], aliveBodyIds: ReadonlySet<number>): FolderEntity[] {
  const folders = new Map<number, FolderEntity>()

  const detach = (bodyId: number) => {
    for (const folder of folders.values()) {
      folder.bodyIds = folder.bodyIds.filter((id) => id !== bodyId)
    }
  }
  const place = (folderId: number, ids: number[]) => {
    const target = folders.get(folderId)
    if (!target) return
    for (const id of ids) {
      detach(id)
      target.bodyIds.push(id)
    }
  }

  for (const op of ops) {
    if (op.kind === 'pattern') {
      folders.set(op.folderId, { folderId: op.folderId, name: `${op.name} 陣列`, bodyIds: [], auto: true })
      place(op.folderId, [op.sourceBodyId, ...op.resultBodyIds])
    } else if (op.kind === 'folder') {
      if (op.action === 'create' && op.folderId !== null) {
        folders.set(op.folderId, {
          folderId: op.folderId,
          name: op.name ?? '資料夾',
          bodyIds: [],
          auto: false,
        })
        place(op.folderId, op.bodyIds ?? [])
      } else if (op.action === 'rename' && op.folderId !== null) {
        const folder = folders.get(op.folderId)
        if (folder && op.name) folder.name = op.name
      } else if (op.action === 'move') {
        if (op.folderId === null) for (const id of op.bodyIds ?? []) detach(id)
        else place(op.folderId, op.bodyIds ?? [])
      } else if (op.action === 'delete' && op.folderId !== null) {
        folders.delete(op.folderId)
      }
    }
  }

  return [...folders.values()]
    .map((f) => ({ ...f, bodyIds: f.bodyIds.filter((id) => aliveBodyIds.has(id)) }))
    .filter((f) => !f.auto || f.bodyIds.length > 0)
}

/** 新資料夾的 id：比 journal 出現過的任何資料夾都大。 */
export function nextFolderId(ops: JournalOp[]): number {
  let max = 0
  for (const op of ops) {
    if (op.kind === 'pattern') max = Math.max(max, op.folderId)
    else if (op.kind === 'folder' && op.action === 'create' && op.folderId !== null) {
      max = Math.max(max, op.folderId)
    }
  }
  return max + 1
}
