import { describe, expect, it } from 'vitest'
import { distanceToSegment, dragHeight } from './extrudeMath.ts'

describe('dragHeight', () => {
  it('沿軸拖曳 → 高度 = 拖曳距離 / 軸長比例', () => {
    // 法線每 1mm 在螢幕上移動 (0, -2) px（向上）
    const axis = { x: 0, y: -2 }
    // 往上拖 100px → 高度 +50mm
    expect(dragHeight({ x: 0, y: 0 }, { x: 0, y: -100 }, axis)).toBeCloseTo(50)
    // 往下拖 → 負高度
    expect(dragHeight({ x: 0, y: 0 }, { x: 0, y: 60 }, axis)).toBeCloseTo(-30)
  })

  it('垂直於軸的拖曳分量不影響高度', () => {
    const axis = { x: 0, y: -2 }
    expect(dragHeight({ x: 0, y: 0 }, { x: 500, y: -100 }, axis)).toBeCloseTo(50)
  })

  it('斜向軸', () => {
    const axis = { x: 3, y: 4 } // |axis| = 5 px/mm
    // 沿軸方向拖 50px → 10mm
    expect(dragHeight({ x: 0, y: 0 }, { x: 30, y: 40 }, axis)).toBeCloseTo(10)
  })

  it('軸退化（正對法線看）回傳 0', () => {
    expect(dragHeight({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 0 })).toBe(0)
  })
})

describe('distanceToSegment', () => {
  it('垂直投影在線段內', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3)
  })
  it('投影在端點外時取端點距離', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
  })
  it('退化線段', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5)
  })
})
