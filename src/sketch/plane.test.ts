import { describe, expect, it } from 'vitest'
import { planeFromNormal } from './plane.ts'
import { GROUND_PLANE, uvToWorld, worldToUv } from './model.ts'

describe('planeFromNormal', () => {
  it('+Z 法線得到地面座標系', () => {
    expect(planeFromNormal([0, 0, 1], [37, -12, 0])).toEqual(GROUND_PLANE)
  })

  it('抬高的水平面：原點在世界原點正上方，軸與世界對齊', () => {
    const p = planeFromNormal([0, 0, 1], [5, 5, 100])
    expect(p.origin).toEqual([0, 0, 100])
    expect(p.xDir).toEqual([1, 0, 0])
    expect(p.yDir).toEqual([0, 1, 0])
  })

  it('法線接近 X 時改用 Y 當參考軸，座標系仍正交', () => {
    const p = planeFromNormal([1, 0, 0], [100, 3, 4])
    expect(p.origin).toEqual([100, 0, 0])
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(dot(p.xDir, p.normal)).toBeCloseTo(0)
    expect(dot(p.yDir, p.normal)).toBeCloseTo(0)
    expect(dot(p.xDir, p.yDir)).toBeCloseTo(0)
  })

  it('平面上的點 uv ↔ world 來回一致', () => {
    const p = planeFromNormal([0, -1, 0], [10, 0, 20])
    const w = uvToWorld(p, { x: 7, y: -3 })
    const uv = worldToUv(p, w)
    expect(uv.x).toBeCloseTo(7)
    expect(uv.y).toBeCloseTo(-3)
    expect(w[1]).toBeCloseTo(0) // 落在 y = 0 平面上
  })
})
