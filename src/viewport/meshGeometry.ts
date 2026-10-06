// 從 kernel 回傳的網格推導面/邊的幾何資訊——讓把手與推拉預覽不必等 kernel 往返。
// 純函式，可測試。tessellate.ts 已把 REVERSED face 的三角形翻正，所以三角形法線朝外。

import type { MeshData, TopoGroup } from '../kernel/protocol.ts'
import type { Vec3Tuple } from '../sketch/model.ts'

export interface FaceInfo {
  planar: boolean
  /** 面積加權平均法線（單位向量，朝外）。 */
  normal: Vec3Tuple
  centroid: Vec3Tuple
  area: number
}

const PLANAR_TOL = 1e-3

export function faceInfo(mesh: MeshData, group: TopoGroup): FaceInfo {
  const p = mesh.positions
  const idx = mesh.indices
  let area = 0
  const n: Vec3Tuple = [0, 0, 0]
  const c: Vec3Tuple = [0, 0, 0]
  const triNormals: Vec3Tuple[] = []
  for (let t = group.start; t < group.start + group.count; t += 3) {
    const a = idx[t] * 3
    const b = idx[t + 1] * 3
    const cc = idx[t + 2] * 3
    const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2]
    const acx = p[cc] - p[a], acy = p[cc + 1] - p[a + 1], acz = p[cc + 2] - p[a + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue
    const triArea = len / 2
    area += triArea
    n[0] += nx
    n[1] += ny
    n[2] += nz
    c[0] += (triArea * (p[a] + p[b] + p[cc])) / 3
    c[1] += (triArea * (p[a + 1] + p[b + 1] + p[cc + 1])) / 3
    c[2] += (triArea * (p[a + 2] + p[b + 2] + p[cc + 2])) / 3
    triNormals.push([nx / len, ny / len, nz / len])
  }
  const nLen = Math.hypot(n[0], n[1], n[2]) || 1
  const normal: Vec3Tuple = [n[0] / nLen, n[1] / nLen, n[2] / nLen]
  const planar =
    triNormals.length > 0 &&
    triNormals.every(
      (tn) => tn[0] * normal[0] + tn[1] * normal[1] + tn[2] * normal[2] > 1 - PLANAR_TOL,
    )
  const centroid: Vec3Tuple =
    area > 0 ? [c[0] / area, c[1] / area, c[2] / area] : [0, 0, 0]
  return { planar, normal, centroid, area }
}

/**
 * 取出單一面的子網格，邊界由「只被一個三角形使用的邊」求得——
 * 給 ExtrudePreview 拉出側壁用（推拉面的即時預覽）。
 */
export function faceSubMesh(mesh: MeshData, group: TopoGroup): MeshData {
  const p = mesh.positions
  const idx = mesh.indices
  const remap = new Map<number, number>()
  const positions: number[] = []
  const indices: number[] = []
  const vertexOf = (src: number): number => {
    let v = remap.get(src)
    if (v === undefined) {
      v = positions.length / 3
      remap.set(src, v)
      positions.push(p[src * 3], p[src * 3 + 1], p[src * 3 + 2])
    }
    return v
  }
  // 同一面的頂點在 tessellate 中共用索引，所以用索引配對邊即可
  const edgeUse = new Map<string, { a: number; b: number; count: number }>()
  for (let t = group.start; t < group.start + group.count; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]]
    indices.push(vertexOf(tri[0]), vertexOf(tri[1]), vertexOf(tri[2]))
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const entry = edgeUse.get(key)
      if (entry) entry.count++
      else edgeUse.set(key, { a, b, count: 1 })
    }
  }
  const edgePositions: number[] = []
  for (const { a, b, count } of edgeUse.values()) {
    if (count !== 1) continue
    edgePositions.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2])
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
    faceGroups: [],
    edgePositions: new Float32Array(edgePositions),
    edgeGroups: [],
  }
}

/** 邊折線的端點與（直線邊的）中點——給在面上繪圖時吸附模型頂點用。 */
export function edgeSnapPoints(mesh: MeshData): { endpoints: Vec3Tuple[]; midpoints: Vec3Tuple[] } {
  const ep = mesh.edgePositions
  const endpoints: Vec3Tuple[] = []
  const midpoints: Vec3Tuple[] = []
  for (const g of mesh.edgeGroups) {
    if (g.count < 2) continue
    const first = g.start * 3
    const last = (g.start + g.count - 1) * 3
    const a: Vec3Tuple = [ep[first], ep[first + 1], ep[first + 2]]
    const b: Vec3Tuple = [ep[last], ep[last + 1], ep[last + 2]]
    endpoints.push(a, b)
    // 只有一段（兩個頂點）= 直線邊，中點有意義
    if (g.count === 2) midpoints.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
  }
  return { endpoints, midpoints }
}

/** 邊的中點（沿折線長度一半處），給圓角把手定位。 */
export function edgeMidpoint(mesh: MeshData, group: TopoGroup): Vec3Tuple {
  const ep = mesh.edgePositions
  let total = 0
  const segs: { a: number; b: number; len: number }[] = []
  for (let v = group.start; v + 1 < group.start + group.count; v += 2) {
    const a = v * 3
    const b = (v + 1) * 3
    const len = Math.hypot(ep[b] - ep[a], ep[b + 1] - ep[a + 1], ep[b + 2] - ep[a + 2])
    segs.push({ a, b, len })
    total += len
  }
  let remaining = total / 2
  for (const s of segs) {
    if (remaining <= s.len && s.len > 0) {
      const t = remaining / s.len
      return [
        ep[s.a] + (ep[s.b] - ep[s.a]) * t,
        ep[s.a + 1] + (ep[s.b + 1] - ep[s.a + 1]) * t,
        ep[s.a + 2] + (ep[s.b + 2] - ep[s.a + 2]) * t,
      ]
    }
    remaining -= s.len
  }
  const g = group.start * 3
  return [ep[g], ep[g + 1], ep[g + 2]]
}
