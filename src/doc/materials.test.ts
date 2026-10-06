import { describe, expect, it } from 'vitest'
import type { JournalOp } from './journal.ts'
import { deriveMaterials } from './materials.ts'

const alive = (...ids: number[]) => new Set(ids)

describe('deriveMaterials', () => {
  it('顏色與透明度分開設定、互不覆蓋', () => {
    const ops: JournalOp[] = [
      { kind: 'material', bodyIds: [1], color: '#ff0000' },
      { kind: 'material', bodyIds: [1], opacity: 0.4 },
    ]
    expect(deriveMaterials(ops, alive(1)).get(1)).toEqual({ color: '#ff0000', opacity: 0.4 })
  })

  it('透明度夾在 5%–100%', () => {
    const ops: JournalOp[] = [{ kind: 'material', bodyIds: [1, 2], opacity: 0 }, { kind: 'material', bodyIds: [2], opacity: 7 }]
    const m = deriveMaterials(ops, alive(1, 2))
    expect(m.get(1)?.opacity).toBe(0.05)
    expect(m.get(2)?.opacity).toBe(1)
  })

  it('複製與陣列副本沿用來源外觀；之後各自獨立', () => {
    const ops: JournalOp[] = [
      { kind: 'material', bodyIds: [1], color: '#00ff00', opacity: 0.5 },
      { kind: 'copyBody', sourceBodyId: 1, bodyId: 2, name: 'c', translation: [1, 0, 0] },
      {
        kind: 'pattern', sourceBodyId: 1, count: 3, mode: 'linear', direction: [1, 0, 0], spacing: 5,
        resultBodyIds: [3, 4], name: 'p', folderId: 1,
      },
      { kind: 'material', bodyIds: [2], color: '#0000ff' },
    ]
    const m = deriveMaterials(ops, alive(1, 2, 3, 4))
    expect(m.get(2)).toEqual({ color: '#0000ff', opacity: 0.5 })
    expect(m.get(3)).toEqual({ color: '#00ff00', opacity: 0.5 })
    expect(m.get(4)).toEqual({ color: '#00ff00', opacity: 0.5 })
    expect(m.get(1)).toEqual({ color: '#00ff00', opacity: 0.5 })
  })

  it('刪除的本體不再出現', () => {
    const ops: JournalOp[] = [{ kind: 'material', bodyIds: [1, 2], color: '#123456' }]
    expect([...deriveMaterials(ops, alive(2)).keys()]).toEqual([2])
  })
})
