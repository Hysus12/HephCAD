import { describe, expect, it } from 'vitest'
import type { MeshData } from '../kernel/protocol.ts'
import { edgeMidpoint, edgeSnapPoints, faceInfo, faceSubMesh } from './meshGeometry.ts'

/** 兩個面：z=0 的 10×10 正方形（法線 +Z）＋ 一個斜面三角形。 */
function mesh(): MeshData {
  return {
    positions: new Float32Array([
      // face 1（頂點 0–3）
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      // face 2（頂點 4–6，傾斜）
      0, 0, 0, 10, 0, 0, 0, 0, 10,
    ]),
    normals: new Float32Array(21),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6]),
    faceGroups: [
      { topoId: 1, start: 0, count: 6 },
      { topoId: 2, start: 6, count: 3 },
    ],
    // edge 1：直線（2 頂點）；edge 2：兩段折線（4 頂點 = 2 段）
    edgePositions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 0, 5, 5, 0, 5, 5, 0, 10, 10, 0]),
    edgeGroups: [
      { topoId: 1, start: 0, count: 2 },
      { topoId: 2, start: 2, count: 4 },
    ],
  }
}

describe('faceInfo', () => {
  it('平面正方形：法線、形心、面積', () => {
    const info = faceInfo(mesh(), mesh().faceGroups[0])
    expect(info.planar).toBe(true)
    expect(info.normal).toEqual([0, 0, 1])
    expect(info.centroid.map((v) => +v.toFixed(6))).toEqual([5, 5, 0])
    expect(info.area).toBeCloseTo(100)
  })

  it('法線不一致的面不是平面', () => {
    const m = mesh()
    // 把正方形的一個角抬高 → 兩個三角形法線不同
    m.positions[8] = 3
    expect(faceInfo(m, m.faceGroups[0]).planar).toBe(false)
  })
})

describe('faceSubMesh', () => {
  it('只取該面的三角形，邊界是外圍四條邊（對角線是內部邊）', () => {
    const sub = faceSubMesh(mesh(), mesh().faceGroups[0])
    expect(sub.positions.length / 3).toBe(4)
    expect(sub.indices.length).toBe(6)
    expect(sub.edgePositions.length / 6).toBe(4)
  })
})

describe('edgeSnapPoints / edgeMidpoint', () => {
  it('每條邊取端點；只有直線邊取中點', () => {
    const { endpoints, midpoints } = edgeSnapPoints(mesh())
    expect(endpoints).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 0, 0],
      [10, 10, 0],
    ])
    expect(midpoints).toEqual([[5, 0, 0]])
  })

  it('折線中點沿長度取一半', () => {
    const mid = edgeMidpoint(mesh(), mesh().edgeGroups[1])
    expect(mid.map((v) => +v.toFixed(6))).toEqual([5, 5, 0])
  })
})
