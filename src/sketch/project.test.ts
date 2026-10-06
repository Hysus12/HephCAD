import { describe, expect, it } from 'vitest'
import { GROUND_PLANE, type SketchCurve, type SketchPlane, type Vec3Tuple } from './model.ts'
import { edgePolyline, projectPolyline, projectSketchCurves } from './project.ts'
import { planeFromNormal } from './plane.ts'

const circle3d = (cx: number, cy: number, cz: number, r: number, n = 64): Vec3Tuple[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return [cx + r * Math.cos(t), cy + r * Math.sin(t), cz]
  })

describe('projectPolyline', () => {
  it('直線邊 → 一條直線，高度被拍平', () => {
    const [line] = projectPolyline(GROUND_PLANE, [[0, 0, 10], [30, 40, 25]]) as Extract<SketchCurve, { kind: 'line' }>[]
    expect(line.a).toEqual({ x: 0, y: 0 })
    expect(line.b).toEqual({ x: 30, y: 40 })
  })

  it('平行投影的圓邊 → 精確的圓', () => {
    const curves = projectPolyline(GROUND_PLANE, circle3d(5, 7, 12, 10))
    expect(curves).toHaveLength(1)
    const c = curves[0] as Extract<SketchCurve, { kind: 'circle' }>
    expect(c.kind).toBe('circle')
    expect(c.center.x).toBeCloseTo(5)
    expect(c.center.y).toBeCloseTo(7)
    expect(c.radius).toBeCloseTo(10)
  })

  it('開放的圓弧 → 圓弧（起點、終點保留）', () => {
    const arc = circle3d(0, 0, 0, 20, 64).slice(0, 33) // 半圓
    const [curve] = projectPolyline(GROUND_PLANE, arc)
    expect(curve.kind).toBe('arc')
    const a = curve as Extract<SketchCurve, { kind: 'arc' }>
    expect(a.start.x).toBeCloseTo(20)
    expect(a.end.x).toBeCloseTo(-20)
  })

  it('斜投影的圓是橢圓：擬合失敗，退回折線段', () => {
    const tilted: SketchPlane = planeFromNormal([1, 0, 1], [0, 0, 0])
    const curves = projectPolyline(tilted, circle3d(0, 0, 0, 10))
    expect(curves.length).toBeGreaterThan(8)
    expect(curves.every((c) => c.kind === 'line')).toBe(true)
  })

  it('共線的連續段合併成一條', () => {
    const curves = projectPolyline(GROUND_PLANE, [[0, 0, 0], [10, 0, 0], [20, 0, 0], [20, 15, 0]])
    expect(curves).toHaveLength(2)
  })

  it('投影後退化成一點 → 沒有曲線', () => {
    expect(projectPolyline(GROUND_PLANE, [[3, 4, 0], [3, 4, 50]])).toEqual([])
  })
})

describe('projectSketchCurves', () => {
  it('矩形投影到平行的偏移平面：座標不變', () => {
    const target = planeFromNormal([0, 0, 1], [0, 0, 30])
    const rect: SketchCurve[] = [
      { id: 1, kind: 'line', a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
      { id: 2, kind: 'line', a: { x: 40, y: 0 }, b: { x: 40, y: 20 } },
    ]
    const out = projectSketchCurves(GROUND_PLANE, rect, target) as Extract<SketchCurve, { kind: 'line' }>[]
    expect(out).toHaveLength(2)
    expect(out[1].b).toEqual({ x: 40, y: 20 })
  })

  it('圓投影到平行平面仍是圓', () => {
    const target = planeFromNormal([0, 0, 1], [0, 0, 5])
    const circle: SketchCurve = { id: 1, kind: 'circle', center: { x: 3, y: 4 }, radius: 9 }
    const [out] = projectSketchCurves(GROUND_PLANE, [circle], target)
    expect(out).toMatchObject({ kind: 'circle', radius: expect.closeTo(9, 3) })
  })
})

describe('edgePolyline', () => {
  it('把線段對接成折線', () => {
    const pos = [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0]
    expect(edgePolyline(pos, 0, 4)).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0]])
  })
})
