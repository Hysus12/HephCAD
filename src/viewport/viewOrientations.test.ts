import { describe, expect, it } from 'vitest'
import { orientationAngles } from './viewOrientations.ts'

function directionOf(theta: number, phi: number) {
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.sin(phi) * Math.sin(theta),
    z: Math.cos(phi),
  }
}

describe('orientationAngles', () => {
  it.each([
    ['front', { x: 0, y: -1, z: 0 }],
    ['back', { x: 0, y: 1, z: 0 }],
    ['right', { x: 1, y: 0, z: 0 }],
    ['left', { x: -1, y: 0, z: 0 }],
    ['top', { x: 0, y: 0, z: 1 }],
    ['bottom', { x: 0, y: 0, z: -1 }],
  ] as const)('%s 視角的相機方向正確', (orientation, expected) => {
    const { theta, phi } = orientationAngles(orientation)
    const dir = directionOf(theta, phi)
    expect(dir.x).toBeCloseTo(expected.x, 6)
    expect(dir.y).toBeCloseTo(expected.y, 6)
    expect(dir.z).toBeCloseTo(expected.z, 6)
  })

  it('iso 視角在前右上象限', () => {
    const { theta, phi } = orientationAngles('iso')
    const dir = directionOf(theta, phi)
    expect(dir.x).toBeGreaterThan(0)
    expect(dir.y).toBeLessThan(0)
    expect(dir.z).toBeGreaterThan(0)
  })
})
