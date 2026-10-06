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
      opLabel({ kind: 'fillet', bodyId: 1, edgeIds: [3], radius: 5, chamfer: true, angleDeg: 30 }, nameOf),
    ).toBe('倒角 5.0mm ∠30°')
    // 45° 就是預設的等距倒角，不另外標示
    expect(
      opLabel({ kind: 'fillet', bodyId: 1, edgeIds: [3], radius: 5, chamfer: true, angleDeg: 45 }, nameOf),
    ).toBe('倒角 5.0mm')
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

describe('布林 op', () => {
  const box = (id: number, name: string): JournalOp => ({ kind: 'createBox', bodyId: id, name, dx: 1, dy: 1, dz: 1 })

  it('標籤', () => {
    expect(
      opLabel(
        { kind: 'boolean', mode: 'subtract', targetId: 1, toolIds: [2], keepOriginals: false, resultBodyId: 0, name: 'x' },
        nameOf,
      ),
    ).toBe('減去 主體 1')
    const extrude = (boolMode?: 'union' | 'new' | 'subtract' | 'intersect'): JournalOp => ({
      kind: 'extrude',
      plane: { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] },
      curves: [],
      regionIndex: 0,
      height: 12,
      hostBodyId: null,
      newBodyId: null,
      name: null,
      ...(boolMode ? { boolMode } : {}),
    })
    expect(opLabel(extrude(), nameOf)).toBe('擠出 12.0mm')
    expect(opLabel(extrude('intersect'), nameOf)).toBe('擠出（交集）12.0mm')
  })

  it('不保留原本體：工具體消失；保留：新增結果本體、原本體都在', () => {
    const merged = aliveBodyNames([
      box(1, 'A'),
      box(2, 'B'),
      { kind: 'boolean', mode: 'union', targetId: 1, toolIds: [2], keepOriginals: false, resultBodyId: 0, name: 'A 聯集' },
    ])
    expect([...merged.entries()]).toEqual([[1, 'A']])

    const kept = aliveBodyNames([
      box(1, 'A'),
      box(2, 'B'),
      { kind: 'boolean', mode: 'union', targetId: 1, toolIds: [2], keepOriginals: true, resultBodyId: 3, name: 'A 聯集' },
    ])
    expect([...kept.entries()]).toEqual([[1, 'A'], [2, 'B'], [3, 'A 聯集']])
  })

  it('擠出聯集到多個本體：只留第一個', () => {
    const names = aliveBodyNames([
      box(1, 'A'),
      box(2, 'B'),
      {
        kind: 'extrude',
        plane: { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] },
        curves: [],
        regionIndex: 0,
        height: 5,
        hostBodyId: null,
        newBodyId: null,
        name: null,
        boolMode: 'union',
        targetBodyIds: [1, 2],
      },
    ])
    expect([...names.keys()]).toEqual([1])
  })
})
