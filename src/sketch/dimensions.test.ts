import { describe, expect, it } from 'vitest'
import { describeCurves, resizeCurve } from './dimensions.ts'
import type { SketchCurve } from './model.ts'

const line: SketchCurve = { id: 1, kind: 'line', a: { x: 0, y: 0 }, b: { x: 30, y: 40 } }

describe('describeCurves', () => {
  it('直線顯示長度、可編輯', () => {
    expect(describeCurves([line], 'line')).toMatchObject({ text: '50.0 mm', value: 50, editable: true })
  })

  it('矩形顯示寬 × 高', () => {
    const rect: SketchCurve[] = [
      { id: 0, kind: 'line', a: { x: 0, y: 0 }, b: { x: 20, y: 0 } },
      { id: 0, kind: 'line', a: { x: 20, y: 0 }, b: { x: 20, y: 7.5 } },
      { id: 0, kind: 'line', a: { x: 20, y: 7.5 }, b: { x: 0, y: 7.5 } },
      { id: 0, kind: 'line', a: { x: 0, y: 7.5 }, b: { x: 0, y: 0 } },
    ]
    expect(describeCurves(rect, 'rect')).toMatchObject({ text: '20.0 × 7.5 mm', editable: false })
  })

  it('圓顯示半徑', () => {
    const circle: SketchCurve = { id: 1, kind: 'circle', center: { x: 0, y: 0 }, radius: 12 }
    expect(describeCurves([circle], 'circle')).toMatchObject({ text: 'R 12.0 mm', value: 12 })
  })

  it('沒有曲線 → null', () => {
    expect(describeCurves([], 'line')).toBeNull()
  })
})

describe('resizeCurve', () => {
  it('直線：起點與方向不變，長度改成輸入值', () => {
    const r = resizeCurve(line, 25) as Extract<SketchCurve, { kind: 'line' }>
    expect(r.a).toEqual({ x: 0, y: 0 })
    expect(r.b.x).toBeCloseTo(15)
    expect(r.b.y).toBeCloseTo(20)
    expect(r.id).toBe(1)
  })

  it('圓：改半徑', () => {
    const c: SketchCurve = { id: 3, kind: 'circle', center: { x: 5, y: 5 }, radius: 2 }
    expect(resizeCurve(c, 9)).toEqual({ ...c, radius: 9 })
  })

  it('非正值、退化直線、圓弧 → null', () => {
    expect(resizeCurve(line, 0)).toBeNull()
    expect(resizeCurve(line, -3)).toBeNull()
    expect(resizeCurve({ ...line, b: { x: 0, y: 0 } }, 5)).toBeNull()
  })
})
