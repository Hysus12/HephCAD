import { describe, expect, it } from 'vitest'
import { aliveBodyNames, opLabel, type JournalOp } from './journal.ts'

const nameOf = (id: number) => `主體 ${id}`

describe('opLabel', () => {
  it('修改工具的標籤', () => {
    expect(
      opLabel({ kind: 'transform', bodyId: 1, translation: [1, 2, 3] }, nameOf),
    ).toBe('移動 主體 1')
    expect(
      opLabel(
        { kind: 'copyBody', sourceBodyId: 1, bodyId: 2, name: 'x 副本', translation: [0, 0, 0] },
        nameOf,
      ),
    ).toBe('複製 主體 1')
    expect(
      opLabel({ kind: 'fillet', bodyId: 1, edgeIds: [3], radius: 2.5, chamfer: false }, nameOf),
    ).toBe('圓角 2.5mm')
    expect(
      opLabel({ kind: 'fillet', bodyId: 1, edgeIds: [3], radius: 1, chamfer: true }, nameOf),
    ).toBe('倒角 1.0mm')
    expect(
      opLabel({ kind: 'shell', bodyId: 1, faceIds: [2], thickness: 3 }, nameOf),
    ).toBe('抽殼 3.0mm')
  })
})

describe('aliveBodyNames', () => {
  it('copyBody 加入名稱、修改類 op 不影響', () => {
    const ops: JournalOp[] = [
      { kind: 'createBox', bodyId: 1, name: '方塊', dx: 1, dy: 1, dz: 1 },
      { kind: 'copyBody', sourceBodyId: 1, bodyId: 2, name: '方塊 副本', translation: [40, 0, 0] },
      { kind: 'fillet', bodyId: 2, edgeIds: [1], radius: 2, chamfer: false },
      { kind: 'transform', bodyId: 1, translation: [10, 0, 0] },
      { kind: 'deleteBody', bodyId: 1 },
    ]
    const names = aliveBodyNames(ops)
    expect([...names.entries()]).toEqual([[2, '方塊 副本']])
  })
})
