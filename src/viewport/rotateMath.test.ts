import { describe, expect, it } from 'vitest'
import { angleAboutAxis, distanceToPolyline, screenAngleDelta, snapAngle } from './rotateMath.ts'

describe('angleAboutAxis', () => {
  const origin: [number, number, number] = [0, 0, 0]
  const z: [number, number, number] = [0, 0, 1]

  it('繞 +Z 從 +X 轉到 +Y 是 +90°（右手定則）', () => {
    expect(angleAboutAxis(origin, z, [1, 0, 0], [0, 1, 0])).toBeCloseTo(90)
    expect(angleAboutAxis(origin, z, [0, 1, 0], [1, 0, 0])).toBeCloseTo(-90)
  })

  it('只看垂直於軸的分量，軸向高度無關', () => {
    expect(angleAboutAxis(origin, z, [1, 0, 5], [0, 1, -3])).toBeCloseTo(90)
  })

  it('有偏移的圓心', () => {
    expect(angleAboutAxis([10, 10, 0], z, [11, 10, 0], [10, 11, 0])).toBeCloseTo(90)
  })

  it('任一點在軸上 → 0', () => {
    expect(angleAboutAxis(origin, z, [0, 0, 4], [1, 0, 0])).toBe(0)
  })

  it('繞 +X 軸', () => {
    expect(angleAboutAxis(origin, [1, 0, 0], [0, 1, 0], [0, 0, 1])).toBeCloseTo(90)
  })
})

describe('screenAngleDelta', () => {
  const c = { x: 100, y: 100 }
  it('螢幕上逆時針為正', () => {
    // 右 → 上（螢幕座標 y 向下，所以上方 y 較小）
    expect(screenAngleDelta(c, { x: 150, y: 100 }, { x: 100, y: 50 })).toBeCloseTo(90)
    expect(screenAngleDelta(c, { x: 100, y: 50 }, { x: 150, y: 100 })).toBeCloseTo(-90)
  })

  it('跨越 ±180° 邊界走最短路徑', () => {
    expect(screenAngleDelta(c, { x: 50, y: 99 }, { x: 50, y: 101 })).toBeCloseTo(
      screenAngleDelta(c, { x: 50, y: 99 }, { x: 50, y: 101 }),
    )
    const d = screenAngleDelta(c, { x: 50, y: 95 }, { x: 50, y: 105 })
    expect(Math.abs(d)).toBeLessThan(20)
  })
})

describe('snapAngle / distanceToPolyline', () => {
  it('吸附', () => {
    expect(snapAngle(47, 5)).toBe(45)
    expect(snapAngle(47.4, 0)).toBe(47.4)
    expect(snapAngle(-12, 5)).toBe(-10)
  })

  it('點到折線距離', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(distanceToPolyline({ x: 5, y: 3 }, line)).toBeCloseTo(3)
    expect(distanceToPolyline({ x: 13, y: 5 }, line)).toBeCloseTo(3)
  })
})
