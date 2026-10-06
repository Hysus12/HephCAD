import { describe, expect, it } from 'vitest'
import type { MeshData } from '../kernel/protocol.ts'
import { edgeBisector, edgePoints, faceBoundaryEdges, tangentChain } from './edgeSelection.ts'

/** edges：每條是折線點；組成 edgePositions（成對線段）與 edgeGroups。 */
function meshWithEdges(edges: number[][][], extra: Partial<MeshData> = {}): MeshData {
  const pos: number[] = []
  const groups: MeshData['edgeGroups'] = []
  let vertex = 0
  edges.forEach((pts, i) => {
    const start = vertex
    for (let k = 0; k + 1 < pts.length; k++) {
      pos.push(...pts[k], ...pts[k + 1])
      vertex += 2
    }
    groups.push({ topoId: i + 1, start, count: vertex - start })
  })
  return {
    positions: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    faceGroups: [],
    ...extra,
    edgePositions: new Float32Array(pos),
    edgeGroups: groups,
  }
}

describe('tangentChain', () => {
  it('一直線接圓弧再接直線：全部相切，被帶入', () => {
    // 1: 直線 (0,0)→(10,0)；2: 圓弧從 (10,0) 起、切線仍朝 +x；3: 直線接在弧的終點
    const arc = [
      [10, 0, 0],
      [14, 0.4, 0],
      [17, 1.5, 0],
      [19.5, 3.2, 0],
    ]
    const mesh = meshWithEdges([
      [[0, 0, 0], [10, 0, 0]],
      arc,
      [[19.5, 3.2, 0], [26, 9.7, 0]],
    ])
    expect(tangentChain(mesh, [1]).sort()).toEqual([1, 2, 3])
  })

  it('直角相交的邊不會被帶入（方塊的邊）', () => {
    const mesh = meshWithEdges([
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]],
    ])
    expect(tangentChain(mesh, [1])).toEqual([1])
  })

  it('封閉的圓自己就是一條鏈', () => {
    const circle: number[][] = []
    for (let i = 0; i <= 16; i++) circle.push([5 * Math.cos((i / 16) * 2 * Math.PI), 5 * Math.sin((i / 16) * 2 * Math.PI), 0])
    expect(tangentChain(meshWithEdges([circle]), [1])).toEqual([1])
  })

  it('不存在的 id 被忽略', () => {
    expect(tangentChain(meshWithEdges([[[0, 0, 0], [1, 0, 0]]]), [99])).toEqual([])
  })
})

describe('faceBoundaryEdges', () => {
  it('邊上所有點都是面頂點才算邊界', () => {
    // 單位方形面（兩個三角形）+ 它的四條邊 + 一條外面的邊
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
    const base = meshWithEdges([
      [[0, 0, 0], [1, 0, 0]],
      [[1, 0, 0], [1, 1, 0]],
      [[1, 1, 0], [0, 1, 0]],
      [[0, 1, 0], [0, 0, 0]],
      [[0, 0, 0], [0, 0, 5]],
    ])
    const mesh: MeshData = {
      ...base,
      positions,
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      faceGroups: [{ topoId: 1, start: 0, count: 6 }],
    }
    expect(faceBoundaryEdges(mesh, mesh.faceGroups[0]).sort()).toEqual([1, 2, 3, 4])
  })
})

describe('edgeBisector', () => {
  it('兩個垂直面共用的邊：法線和指向外角', () => {
    // 線段 (0,0,0)-(0,1,0) 同時屬於朝 +z 的面與朝 +x 的面
    const mesh: MeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      faceGroups: [
        { topoId: 1, start: 0, count: 3 },
        { topoId: 2, start: 3, count: 3 },
      ],
      edgePositions: new Float32Array(),
      edgeGroups: [],
    }
    const b = edgeBisector(mesh, [0, 0, 0], [0, 1, 0])!
    expect(b[0]).toBeCloseTo(Math.SQRT1_2)
    expect(b[2]).toBeCloseTo(Math.SQRT1_2)
  })

  it('找不到相鄰面 → null', () => {
    const mesh = meshWithEdges([[[0, 0, 0], [1, 0, 0]]])
    expect(edgeBisector(mesh, [0, 0, 0], [1, 0, 0])).toBeNull()
  })
})

describe('edgePoints', () => {
  it('把線段對接成折線', () => {
    const mesh = meshWithEdges([[[0, 0, 0], [1, 0, 0], [1, 1, 0]]])
    expect(edgePoints(mesh, mesh.edgeGroups[0])).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0]])
  })
})
