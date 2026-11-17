import { describe, expect, it } from 'vitest'
import { cubeDirection } from './ViewCube.ts'

describe('cubeDirection', () => {
  it('面中央 → 該面的法線', () => {
    expect(cubeDirection([0.5, 0.05, -0.1])).toEqual([1, 0, 0])
    expect(cubeDirection([0, 0.1, -0.5])).toEqual([0, 0, -1])
  })

  it('靠近一條邊 → 兩面之間的 45° 方向', () => {
    const d = cubeDirection([0.5, -0.45, 0])
    expect(d[0]).toBeCloseTo(Math.SQRT1_2)
    expect(d[1]).toBeCloseTo(-Math.SQRT1_2)
    expect(d[2]).toBe(0)
  })

  it('靠近角 → 等角視方向', () => {
    const d = cubeDirection([0.5, -0.47, 0.44])
    expect(d.map((v) => Math.sign(v))).toEqual([1, -1, 1])
    expect(Math.hypot(...d)).toBeCloseTo(1)
  })
})
