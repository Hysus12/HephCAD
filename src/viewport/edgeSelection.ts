// 從網格推導邊的連結關係——選「相連的邊」與「面的邊界」、以及圓角箭頭的放置。
// kernel 沒有回傳拓撲鄰接，但 OCCT 的邊與面共用同一份離散化，頂點座標會重合，
// 所以用座標比對就能還原：相接＝端點重合、相切＝接點兩側方向夾角小。純函式、可測。

import type { MeshData, TopoGroup } from '../kernel/protocol.ts'
import type { Vec3Tuple } from '../sketch/model.ts'

const SNAP = 1e-3
/** 接點兩側視為「相切」的最大夾角（度）。離散化的弦方向會偏離真實切線，所以放寬。 */
const TANGENT_DEG = 20

type Vec3 = Vec3Tuple

const key = (p: Vec3) =>
  `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)},${Math.round(p[2] / SNAP)}`

/** 邊的折線點（edgePositions 中成對線段接起來）。 */
export function edgePoints(mesh: MeshData, group: TopoGroup): Vec3[] {
  const ep = mesh.edgePositions
  const pts: Vec3[] = []
  for (let v = group.start; v + 1 < group.start + group.count; v += 2) {
    if (pts.length === 0) pts.push([ep[v * 3], ep[v * 3 + 1], ep[v * 3 + 2]])
    pts.push([ep[(v + 1) * 3], ep[(v + 1) * 3 + 1], ep[(v + 1) * 3 + 2]])
  }
  return pts
}

function unit(a: Vec3, b: Vec3): Vec3 {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  return [d[0] / len, d[1] / len, d[2] / len]
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

interface EdgeEnds {
  topoId: number
  start: Vec3
  end: Vec3
  /** 從端點「進入」邊內部的方向。 */
  startDir: Vec3
  endDir: Vec3
  closed: boolean
}

function describe(mesh: MeshData, group: TopoGroup): EdgeEnds | null {
  const pts = edgePoints(mesh, group)
  if (pts.length < 2) return null
  const start = pts[0]
  const end = pts[pts.length - 1]
  return {
    topoId: group.topoId,
    start,
    end,
    startDir: unit(start, pts[1]),
    endDir: unit(end, pts[pts.length - 2]),
    closed: key(start) === key(end),
  }
}

/**
 * 從 startIds 出發，沿「接點相切」的邊一路擴張（Shapr3D 的雙擊選邊）。
 * 例如圓角環、圓弧接直線的外框。直角相交的邊不會被帶入。
 */
export function tangentChain(mesh: MeshData, startIds: number[]): number[] {
  const edges = mesh.edgeGroups.map((g) => describe(mesh, g)).filter((e): e is EdgeEnds => e !== null)
  const byId = new Map(edges.map((e) => [e.topoId, e]))
  // 端點 → 在該點的 (邊, 進入方向)
  const atPoint = new Map<string, { id: number; dir: Vec3 }[]>()
  const add = (p: Vec3, id: number, dir: Vec3) => {
    const k = key(p)
    const list = atPoint.get(k) ?? []
    list.push({ id, dir })
    atPoint.set(k, list)
  }
  for (const e of edges) {
    if (e.closed) continue
    add(e.start, e.topoId, e.startDir)
    add(e.end, e.topoId, e.endDir)
  }
  const cosLimit = Math.cos(((180 - TANGENT_DEG) * Math.PI) / 180)
  const result = new Set<number>(startIds.filter((id) => byId.has(id)))
  const queue = [...result]
  while (queue.length > 0) {
    const id = queue.shift()!
    const e = byId.get(id)!
    if (e.closed) continue
    for (const [point, dir] of [
      [e.start, e.startDir],
      [e.end, e.endDir],
    ] as const) {
      for (const other of atPoint.get(key(point)) ?? []) {
        if (result.has(other.id)) continue
        // 相切＝兩條邊的「進入方向」幾乎相反（一進一出，沒有折角）
        if (dot(dir, other.dir) <= cosLimit) {
          result.add(other.id)
          queue.push(other.id)
        }
      }
    }
  }
  return [...result]
}

/** 面的邊界邊：邊上每個點都是這個面的網格頂點。 */
export function faceBoundaryEdges(mesh: MeshData, face: TopoGroup): number[] {
  const verts = new Set<string>()
  const p = mesh.positions
  for (let t = face.start; t < face.start + face.count; t++) {
    const v = mesh.indices[t] * 3
    verts.add(key([p[v], p[v + 1], p[v + 2]]))
  }
  const ids: number[] = []
  for (const g of mesh.edgeGroups) {
    const pts = edgePoints(mesh, g)
    if (pts.length >= 2 && pts.every((pt) => verts.has(key(pt)))) ids.push(g.topoId)
  }
  return ids
}

/**
 * 邊上一小段（a→b，折線相鄰兩點）相鄰各面的法線和＝圓角箭頭的方向
 * （凸邊朝外、凹邊朝空腔）。「相鄰」＝a、b 兩點都是該面的網格頂點。
 * 找不到（或兩側完全相切、法線和≈0）時回傳 null，由呼叫端退回「從中心向外」。
 */
export function edgeBisector(mesh: MeshData, a: Vec3, b: Vec3): Vec3 | null {
  const ka = key(a)
  const kb = key(b)
  const p = mesh.positions
  const n = mesh.normals
  const sum: Vec3 = [0, 0, 0]
  for (const face of mesh.faceGroups) {
    let va = -1
    let hasB = false
    for (let t = face.start; t < face.start + face.count; t++) {
      const v = mesh.indices[t]
      const k = key([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]])
      if (k === ka && va < 0) va = v
      else if (k === kb) hasB = true
    }
    if (va >= 0 && hasB) {
      sum[0] += n[va * 3]
      sum[1] += n[va * 3 + 1]
      sum[2] += n[va * 3 + 2]
    }
  }
  const len = Math.hypot(sum[0], sum[1], sum[2])
  return len < 1e-6 ? null : [sum[0] / len, sum[1] / len, sum[2] / len]
}
