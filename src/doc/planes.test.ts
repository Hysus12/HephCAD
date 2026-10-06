import { describe, expect, it } from 'vitest'
import type { JournalOp } from './journal.ts'
import { derivePlanes, nextPlaneId } from './planes.ts'

const create = (planeId: number, offset: number, normal: [number, number, number] = [0, 0, 1]): JournalOp => ({
  kind: 'plane',
  action: 'create',
  planeId,
  name: `平面 ${planeId}`,
  normal,
  point: [5, 5, 10],
  offset,
  size: 100,
})

describe('derivePlanes', () => {
  it('偏移平面：沿法向平移基準點', () => {
    const p = derivePlanes([create(1, 20)]).get(1)!
    expect(p.center).toEqual([5, 5, 30])
    expect(p.plane.normal).toEqual([0, 0, 1])
    expect(p.plane.origin[2]).toBeCloseTo(30)
  })

  it('負偏移往反方向；非單位法向會被正規化', () => {
    const p = derivePlanes([create(1, -4, [2, 0, 0])]).get(1)!
    expect(p.center[0]).toBeCloseTo(1)
    expect(p.plane.normal[0]).toBeCloseTo(1)
  })

  it('同 id 再建立＝取代（amend 後只留新的）；delete 移除', () => {
    const ops: JournalOp[] = [create(1, 10), create(1, 15), create(2, 5)]
    expect(derivePlanes(ops).get(1)!.offset).toBe(15)
    ops.push({ kind: 'plane', action: 'delete', planeId: 1 })
    expect([...derivePlanes(ops).keys()]).toEqual([2])
  })

  it('nextPlaneId 比出現過的都大', () => {
    expect(nextPlaneId([])).toBe(1)
    expect(nextPlaneId([create(1, 1), create(3, 1)])).toBe(4)
  })
})
