import { describe, expect, it } from 'vitest'
import { edgePickThreshold, findTopoGroup } from './picking.ts'
import type { TopoGroup } from '../kernel/protocol.ts'

describe('findTopoGroup', () => {
  const groups: TopoGroup[] = [
    { topoId: 1, start: 0, count: 6 },
    { topoId: 2, start: 6, count: 12 },
    { topoId: 3, start: 18, count: 3 },
  ]

  it('找到包含 offset 的群組', () => {
    expect(findTopoGroup(groups, 0)?.topoId).toBe(1)
    expect(findTopoGroup(groups, 5)?.topoId).toBe(1)
    expect(findTopoGroup(groups, 6)?.topoId).toBe(2)
    expect(findTopoGroup(groups, 17)?.topoId).toBe(2)
    expect(findTopoGroup(groups, 18)?.topoId).toBe(3)
    expect(findTopoGroup(groups, 20)?.topoId).toBe(3)
  })

  it('超出範圍回傳 null', () => {
    expect(findTopoGroup(groups, 21)).toBeNull()
    expect(findTopoGroup(groups, -1)).toBeNull()
    expect(findTopoGroup([], 0)).toBeNull()
  })

  it('允許群組間有洞（被過濾的縫線邊）', () => {
    const gapped: TopoGroup[] = [
      { topoId: 1, start: 0, count: 4 },
      { topoId: 3, start: 10, count: 4 },
    ]
    expect(findTopoGroup(gapped, 5)).toBeNull()
    expect(findTopoGroup(gapped, 10)?.topoId).toBe(3)
  })
})

describe('edgePickThreshold', () => {
  it('容差隨距離線性放大', () => {
    const near = edgePickThreshold(10, 100, 45, 1000)
    const far = edgePickThreshold(10, 200, 45, 1000)
    expect(far / near).toBeCloseTo(2, 6)
  })

  it('10px 在典型視距下是合理的世界尺寸', () => {
    // 600mm 視距、45° FOV、800px 高：每 px ≈ 0.62mm
    const t = edgePickThreshold(10, 600, 45, 800)
    expect(t).toBeGreaterThan(4)
    expect(t).toBeLessThan(10)
  })
})
