import { describe, expect, it } from 'vitest'
import type { SketchCurve } from './model.ts'
import { moveJoint, resizeLineConnected } from './edit.ts'

const line = (id: number, ax: number, ay: number, bx: number, by: number): SketchCurve => ({
  id,
  kind: 'line',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
})

/** 40×20 矩形，逆時針：底、右、頂、左。 */
const rect = (): SketchCurve[] => [
  line(1, 0, 0, 40, 0),
  line(2, 40, 0, 40, 20),
  line(3, 40, 20, 0, 20),
  line(4, 0, 20, 0, 0),
]

const byId = (list: SketchCurve[] | null) => new Map((list ?? []).map((c) => [c.id, c]))

describe('resizeLineConnected', () => {
  it('矩形改底邊長度：仍是矩形（右邊整條平移、頂邊跟著伸縮）', () => {
    const changed = byId(resizeLineConnected(rect(), 1, 60))
    expect(changed.get(1)).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 60, y: 0 } })
    expect(changed.get(2)).toMatchObject({ a: { x: 60, y: 0 }, b: { x: 60, y: 20 } })
    expect(changed.get(3)).toMatchObject({ a: { x: 60, y: 20 }, b: { x: 0, y: 20 } })
    expect(changed.has(4)).toBe(false) // 左邊不受影響
  })

  it('矩形改右邊（縮短）：頂邊平移、左邊跟著伸縮', () => {
    const changed = byId(resizeLineConnected(rect(), 2, 10))
    expect(changed.get(2)).toMatchObject({ a: { x: 40, y: 0 }, b: { x: 40, y: 10 } })
    expect(changed.get(3)).toMatchObject({ a: { x: 40, y: 10 }, b: { x: 0, y: 10 } })
    expect(changed.get(4)).toMatchObject({ a: { x: 0, y: 10 }, b: { x: 0, y: 0 } })
  })

  it('三角形：沒有垂直邊，只有共用頂點被拉動', () => {
    const tri = [line(1, 0, 0, 10, 0), line(2, 10, 0, 5, 8), line(3, 5, 8, 0, 0)]
    const changed = byId(resizeLineConnected(tri, 1, 20))
    expect(changed.get(1)).toMatchObject({ b: { x: 20, y: 0 } })
    expect(changed.get(2)).toMatchObject({ a: { x: 20, y: 0 }, b: { x: 5, y: 8 } })
    expect(changed.has(3)).toBe(false)
  })

  it('孤立直線：只有自己改變', () => {
    const changed = resizeLineConnected([line(1, 0, 0, 3, 4)], 1, 10)!
    expect(changed).toHaveLength(1)
    const l = changed[0] as Extract<SketchCurve, { kind: 'line' }>
    expect(l.b.x).toBeCloseTo(6)
    expect(l.b.y).toBeCloseTo(8)
  })

  it('非直線、長度非正、退化直線 → null', () => {
    const circle: SketchCurve = { id: 9, kind: 'circle', center: { x: 0, y: 0 }, radius: 3 }
    expect(resizeLineConnected([circle], 9, 5)).toBeNull()
    expect(resizeLineConnected(rect(), 1, 0)).toBeNull()
    expect(resizeLineConnected([line(1, 1, 1, 1, 1)], 1, 5)).toBeNull()
    expect(resizeLineConnected(rect(), 99, 5)).toBeNull()
  })

  it('相接的圓弧：只移動共用端點', () => {
    const curves: SketchCurve[] = [
      line(1, 0, 0, 10, 0),
      { id: 2, kind: 'arc', start: { x: 10, y: 0 }, through: { x: 15, y: 5 }, end: { x: 10, y: 10 } },
    ]
    const changed = byId(resizeLineConnected(curves, 1, 14))
    expect(changed.get(2)).toMatchObject({ start: { x: 14, y: 0 }, through: { x: 15, y: 5 }, end: { x: 10, y: 10 } })
  })
})

describe('moveJoint', () => {
  it('位移為零不產生任何變動', () => {
    expect(moveJoint(rect(), 1, { x: 40, y: 0 }, { x: 0, y: 0 })).toEqual([])
  })

  it('不改變輸入陣列', () => {
    const input = rect()
    const snapshot = JSON.stringify(input)
    resizeLineConnected(input, 1, 60)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
