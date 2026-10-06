import { describe, expect, it } from 'vitest'
import { GROUND_PLANE, type SketchCurve, type SketchPlane } from '../sketch/model.ts'
import type { MeshData } from '../kernel/protocol.ts'
import type { JournalOp } from './journal.ts'
import {
  deriveSketches,
  findSketchOnPlane,
  nextSketchId,
  regionKey,
  samePlane,
} from './sketches.ts'

const line = (id: number, x = 0): SketchCurve => ({
  id,
  kind: 'line',
  a: { x, y: 0 },
  b: { x: x + 10, y: 0 },
})

function sketchOp(
  sketchId: number,
  add: SketchCurve[],
  remove: number[] = [],
  plane: SketchPlane = GROUND_PLANE,
): JournalOp {
  return { kind: 'sketch', sketchId, plane, hostBodyId: null, add, remove }
}

describe('deriveSketches', () => {
  it('累加曲線、刪除曲線', () => {
    const s = deriveSketches([
      sketchOp(1, [line(1), line(2, 20)]),
      sketchOp(1, [line(3, 40)]),
      sketchOp(1, [], [2]),
    ])
    expect([...s.get(1)!.curves.map((c) => c.id)]).toEqual([1, 3])
    expect(s.get(1)!.maxCurveId).toBe(3)
  })

  it('曲線刪光的草圖消失', () => {
    const s = deriveSketches([sketchOp(1, [line(1)]), sketchOp(1, [], [1])])
    expect(s.size).toBe(0)
  })

  it('被擠出的區域記為已消耗', () => {
    const s = deriveSketches([
      sketchOp(1, [line(1)]),
      {
        kind: 'extrude',
        plane: GROUND_PLANE,
        curves: [line(1)],
        regionIndex: 0,
        height: 10,
        hostBodyId: null,
        newBodyId: 3,
        name: null,
        sketchId: 1,
        regionKey: 'k',
      },
    ])
    expect(s.get(1)!.consumed.has('k')).toBe(true)
  })

  it('不修改輸入的 op（重放要能重複推導）', () => {
    const ops = [sketchOp(1, [line(1)])]
    const a = deriveSketches(ops)
    a.get(1)!.curves[0].id = 99
    const b = deriveSketches(ops)
    expect(b.get(1)!.curves[0].id).toBe(1)
  })
})

describe('nextSketchId', () => {
  it('比出現過的任何草圖都大（含已刪光的）', () => {
    expect(nextSketchId([])).toBe(1)
    expect(nextSketchId([sketchOp(4, [line(1)]), sketchOp(4, [], [1])])).toBe(5)
  })
})

describe('samePlane / findSketchOnPlane', () => {
  const raised: SketchPlane = { ...GROUND_PLANE, origin: [0, 0, 100] }
  const shifted: SketchPlane = { ...GROUND_PLANE, origin: [50, -20, 0] }

  it('同高度的平移視為同平面，不同高度不是', () => {
    expect(samePlane(GROUND_PLANE, shifted)).toBe(true)
    expect(samePlane(GROUND_PLANE, raised)).toBe(false)
  })

  it('反向法線不是同一平面（底面 vs 頂面）', () => {
    const flipped: SketchPlane = { ...GROUND_PLANE, normal: [0, 0, -1] }
    expect(samePlane(GROUND_PLANE, flipped)).toBe(false)
  })

  it('依平面與宿主找既有草圖', () => {
    const sketches = deriveSketches([sketchOp(1, [line(1)]), sketchOp(2, [line(1)], [], raised)])
    expect(findSketchOnPlane(sketches, shifted, null)?.sketchId).toBe(1)
    expect(findSketchOnPlane(sketches, raised, null)?.sketchId).toBe(2)
    expect(findSketchOnPlane(sketches, GROUND_PLANE, 7)).toBeUndefined()
  })
})

describe('regionKey', () => {
  const square = (offset: number): MeshData => ({
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0].map((v, i) => (i % 3 === 0 ? v + offset : v))),
    normals: new Float32Array(12),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    faceGroups: [],
    edgePositions: new Float32Array(),
    edgeGroups: [],
  })

  it('面積與形心決定指紋', () => {
    expect(regionKey(square(0))).toBe('100.0@5.0,5.0,0.0')
    expect(regionKey(square(0))).toBe(regionKey(square(0)))
    expect(regionKey(square(20))).not.toBe(regionKey(square(0)))
  })
})
