import { describe, expect, it } from 'vitest'
import { snapPoint } from './snapping.ts'
import type { SketchCurve } from './model.ts'

const line: SketchCurve = { id: 1, kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
const circle: SketchCurve = { id: 2, kind: 'circle', center: { x: 50, y: 50 }, radius: 5 }

const base = { curves: [line, circle], tolerance: 1, gridSpacing: 5 as number | null, axisAnchor: null as { x: number; y: number } | null }

describe('snapPoint', () => {
  it('端點優先於一切', () => {
    const r = snapPoint({ x: 10.4, y: 0.4 }, base)
    expect(r.kind).toBe('endpoint')
    expect(r.point).toEqual({ x: 10, y: 0 })
  })

  it('中點', () => {
    const r = snapPoint({ x: 5.3, y: 0.3 }, base)
    expect(r.kind).toBe('midpoint')
    expect(r.point).toEqual({ x: 5, y: 0 })
  })

  it('圓心', () => {
    const r = snapPoint({ x: 50.5, y: 49.8 }, base)
    expect(r.kind).toBe('center')
    expect(r.point).toEqual({ x: 50, y: 50 })
  })

  it('垂直對齊錨點，自由座標吸網格', () => {
    const r = snapPoint({ x: 20.4, y: 33.1 }, { ...base, axisAnchor: { x: 20, y: 0 } })
    expect(r.kind).toBe('axis')
    expect(r.axis).toBe('v')
    expect(r.point.x).toBe(20)
    expect(r.point.y).toBeCloseTo(33.1, 6) // 33.1 離 35 太遠，不吸網格
  })

  it('網格吸附', () => {
    const r = snapPoint({ x: 24.7, y: 30.2 }, base)
    expect(r.kind).toBe('grid')
    expect(r.point).toEqual({ x: 25, y: 30 })
  })

  it('都不吸時回傳原點', () => {
    const r = snapPoint({ x: 22.5, y: 32.5 }, { ...base, gridSpacing: null })
    expect(r.kind).toBe('none')
    expect(r.point).toEqual({ x: 22.5, y: 32.5 })
  })
})
