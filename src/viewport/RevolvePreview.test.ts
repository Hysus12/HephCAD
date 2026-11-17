import { describe, expect, it } from 'vitest'
import { rotateInto } from './RevolvePreview.ts'

describe('rotateInto', () => {
  it('繞 Z 軸轉 90°：(1,0,0) → (0,1,0)', () => {
    const out = new Float32Array(3)
    rotateInto([1, 0, 0], out, 0, [0, 0, 0], [0, 0, 1], Math.PI / 2)
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(1)
    expect(out[2]).toBeCloseTo(0)
  })

  it('軸不過原點：繞過 (10,0,0) 的 Z 軸轉 180°', () => {
    const out = new Float32Array(6)
    rotateInto([12, 0, 5], out, 3, [10, 0, 0], [0, 0, 1], Math.PI)
    expect([out[3], out[4], out[5]].map((v) => Math.round(v))).toEqual([8, 0, 5])
  })

  it('軸上的點不動', () => {
    const out = new Float32Array(3)
    rotateInto([0, 7, 0], out, 0, [0, 0, 0], [0, 1, 0], 1.234)
    expect(out[1]).toBeCloseTo(7)
    expect(Math.hypot(out[0], out[2])).toBeCloseTo(0)
  })
})
