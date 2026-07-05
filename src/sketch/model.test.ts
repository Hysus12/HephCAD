import { describe, expect, it } from 'vitest'
import {
  arcGeometry,
  discretizeCurve,
  uvToWorld,
  worldToUv,
  GROUND_PLANE,
  type ArcCurve,
  type SketchPlane,
} from './model.ts'

describe('uv ↔ world', () => {
  it('地面平面是恆等映射', () => {
    expect(uvToWorld(GROUND_PLANE, { x: 3, y: -2 })).toEqual([3, -2, 0])
    expect(worldToUv(GROUND_PLANE, [3, -2, 0])).toEqual({ x: 3, y: -2 })
  })

  it('偏移且旋轉的平面來回一致', () => {
    // 面向 +X 的直立平面（如方塊右面）
    const plane: SketchPlane = {
      origin: [100, 0, 0],
      xDir: [0, 1, 0],
      yDir: [0, 0, 1],
      normal: [1, 0, 0],
    }
    const world = uvToWorld(plane, { x: 10, y: 20 })
    expect(world).toEqual([100, 10, 20])
    expect(worldToUv(plane, world)).toEqual({ x: 10, y: 20 })
  })
})

describe('arcGeometry', () => {
  const arc: ArcCurve = {
    id: 1,
    kind: 'arc',
    start: { x: -10, y: 0 },
    through: { x: 0, y: 10 },
    end: { x: 10, y: 0 },
  }

  it('三點求圓：上半圓', () => {
    const geo = arcGeometry(arc)!
    expect(geo.center.x).toBeCloseTo(0, 6)
    expect(geo.center.y).toBeCloseTo(0, 6)
    expect(geo.radius).toBeCloseTo(10, 6)
    expect(geo.ccw).toBe(false) // start(-10,0)→through(0,10)→end(10,0) 是順時針
  })

  it('共線回傳 null', () => {
    expect(
      arcGeometry({
        id: 1,
        kind: 'arc',
        start: { x: 0, y: 0 },
        through: { x: 5, y: 0 },
        end: { x: 10, y: 0 },
      }),
    ).toBeNull()
  })

  it('離散化通過 through 點附近', () => {
    const pts = discretizeCurve(arc, 64)
    expect(pts[0].x).toBeCloseTo(-10, 5)
    expect(pts[pts.length - 1].x).toBeCloseTo(10, 5)
    const near = pts.some((p) => Math.hypot(p.x - 0, p.y - 10) < 1)
    expect(near).toBe(true)
    // 所有點都在圓上
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 5)
    }
  })

  it('離散化不會繞遠路（劣弧不是優弧）', () => {
    const pts = discretizeCurve(arc, 64)
    // 上半圓的點 y 都 >= 0
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(-1e-9)
  })
})
