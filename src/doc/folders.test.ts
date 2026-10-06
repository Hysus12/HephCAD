import { describe, expect, it } from 'vitest'
import { deriveFolders, nextFolderId } from './folders.ts'
import type { JournalOp } from './journal.ts'

const pattern = (folderId: number, source: number, results: number[]): JournalOp => ({
  kind: 'pattern',
  sourceBodyId: source,
  count: results.length + 1,
  mode: 'linear',
  direction: [1, 0, 0],
  spacing: 10,
  resultBodyIds: results,
  name: '柱',
  folderId,
})

const alive = (...ids: number[]) => new Set(ids)

describe('deriveFolders', () => {
  it('陣列自動建資料夾，含原本體與副本', () => {
    const folders = deriveFolders([pattern(1, 1, [2, 3])], alive(1, 2, 3))
    expect(folders).toEqual([{ folderId: 1, name: '柱 陣列', bodyIds: [1, 2, 3], auto: true }])
  })

  it('自動資料夾的成員全被刪光就消失，使用者資料夾不會', () => {
    const ops: JournalOp[] = [
      pattern(1, 1, [2]),
      { kind: 'folder', action: 'create', folderId: 2, name: '空的', bodyIds: [] },
    ]
    const folders = deriveFolders(ops, alive())
    expect(folders.map((f) => f.name)).toEqual(['空的'])
  })

  it('建立、改名、移入、移出、解散', () => {
    const ops: JournalOp[] = [
      { kind: 'folder', action: 'create', folderId: 1, name: 'A', bodyIds: [1, 2] },
      { kind: 'folder', action: 'rename', folderId: 1, name: '零件' },
      { kind: 'folder', action: 'move', folderId: 1, bodyIds: [3] },
      { kind: 'folder', action: 'move', folderId: null, bodyIds: [1] },
    ]
    expect(deriveFolders(ops, alive(1, 2, 3))).toEqual([
      { folderId: 1, name: '零件', bodyIds: [2, 3], auto: false },
    ])
    expect(deriveFolders([...ops, { kind: 'folder', action: 'delete', folderId: 1 }], alive(1, 2, 3))).toEqual([])
  })

  it('一個本體只在一個資料夾：移入新的會離開舊的', () => {
    const ops: JournalOp[] = [
      { kind: 'folder', action: 'create', folderId: 1, name: 'A', bodyIds: [1] },
      { kind: 'folder', action: 'create', folderId: 2, name: 'B', bodyIds: [] },
      { kind: 'folder', action: 'move', folderId: 2, bodyIds: [1] },
    ]
    const [a, b] = deriveFolders(ops, alive(1))
    expect(a.bodyIds).toEqual([])
    expect(b.bodyIds).toEqual([1])
  })

  it('已不存在的本體不出現在資料夾', () => {
    const ops: JournalOp[] = [{ kind: 'folder', action: 'create', folderId: 1, name: 'A', bodyIds: [1, 2] }]
    expect(deriveFolders(ops, alive(2))[0].bodyIds).toEqual([2])
  })
})

describe('nextFolderId', () => {
  it('比所有出現過的資料夾（含陣列的）都大', () => {
    expect(nextFolderId([])).toBe(1)
    expect(
      nextFolderId([pattern(4, 1, [2]), { kind: 'folder', action: 'create', folderId: 6, name: 'x', bodyIds: [] }]),
    ).toBe(7)
  })
})
