// 在 kernel worker 內執行：把 OCCT shape 網格化成 MeshData。
// 頂點按 face 分島（不跨 face 共用），法線在 JS 端以角度加權累加計算，
// 所以 face 內平滑、face 邊界自然銳利，也免去 gp_Dir 的方向/轉換問題。

import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Face,
  TopoDS_Edge,
  TopLoc_Location,
  Handle_Poly_Triangulation,
  TopAbs_ShapeEnum,
  TopTools_IndexedDataMapOfShapeListOfShape,
} from 'opencascade.js/dist/opencascade.full.js'
import type { MeshData, TopoGroup } from './protocol.ts'

/** 線性撓度（mm）與角度撓度（rad）。之後依模型尺寸自適應。 */
const LINEAR_DEFLECTION = 0.2
const ANGULAR_DEFLECTION = 0.35

interface Deletable {
  delete(): void
}

function del(...objs: Deletable[]): void {
  for (const o of objs) o.delete()
}

export function tessellate(oc: OpenCascadeInstance, shape: TopoDS_Shape): MeshData {
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    LINEAR_DEFLECTION,
    false,
    ANGULAR_DEFLECTION,
    false,
  )
  mesher.delete()

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const faceGroups: TopoGroup[] = []

  const faceMap = new oc.TopTools_IndexedMapOfShape_1()
  // d.ts 把 enum 成員標成 {}，需要斷言回 enum 型別
  oc.TopExp.MapShapes_1(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
    faceMap,
  )

  for (let f = 1; f <= faceMap.Extent(); f++) {
    const face = oc.TopoDS.Face_1(faceMap.FindKey(f))
    const loc = new oc.TopLoc_Location_1()
    const triHandle = getTriangulation(oc, face, loc)
    if (triHandle.IsNull()) {
      del(triHandle, loc, face)
      continue
    }
    const tri = triHandle.get()
    const trsf = loc.Transformation()
    const reversed =
      face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED

    const vertexBase = positions.length / 3
    const nbNodes = tri.NbNodes()
    for (let i = 1; i <= nbNodes; i++) {
      const raw = tri.Node(i)
      const p = raw.Transformed(trsf)
      positions.push(p.X(), p.Y(), p.Z())
      normals.push(0, 0, 0)
      del(raw, p)
    }

    const indexStart = indices.length
    const nbTriangles = tri.NbTriangles()
    for (let t = 1; t <= nbTriangles; t++) {
      const triangle = tri.Triangle(t)
      let a = triangle.Value(1)
      let b = triangle.Value(2)
      const c = triangle.Value(3)
      triangle.delete()
      if (reversed) [a, b] = [b, a]
      const ia = vertexBase + a - 1
      const ib = vertexBase + b - 1
      const ic = vertexBase + c - 1
      if (ia === ib || ib === ic || ic === ia) continue // 退化三角形
      indices.push(ia, ib, ic)
      accumulateNormal(positions, normals, ia, ib, ic)
    }
    faceGroups.push({ topoId: f, start: indexStart, count: indices.length - indexStart })

    del(trsf, triHandle, loc, face)
  }
  faceMap.delete()

  normalizeNormals(normals)

  const { edgePositions, edgeGroups } = discretizeEdges(oc, shape)

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    faceGroups,
    edgePositions,
    edgeGroups,
  }
}

/**
 * BRep_Tool.Triangulation 的第三個參數（Poly_MeshPurpose）在不同 build
 * 的 binding 形式不一致，runtime 探測一次。
 */
let triangulationCall:
  | ((oc: OpenCascadeInstance, f: TopoDS_Face, l: TopLoc_Location) => Handle_Poly_Triangulation)
  | null = null

function getTriangulation(
  oc: OpenCascadeInstance,
  face: TopoDS_Face,
  loc: TopLoc_Location,
): Handle_Poly_Triangulation {
  if (triangulationCall) return triangulationCall(oc, face, loc)

  type AnyOc = { Poly_MeshPurpose?: Record<string, unknown> } & {
    BRep_Tool: { Triangulation: (...args: unknown[]) => Handle_Poly_Triangulation }
  }
  const anyOc = oc as unknown as AnyOc
  const candidates: Array<
    (o: OpenCascadeInstance, f: TopoDS_Face, l: TopLoc_Location) => Handle_Poly_Triangulation
  > = [
    (o, f, l) =>
      (o as unknown as AnyOc).BRep_Tool.Triangulation(
        f,
        l,
        (o as unknown as AnyOc).Poly_MeshPurpose?.Poly_MeshPurpose_NONE,
      ),
    (o, f, l) => (o as unknown as AnyOc).BRep_Tool.Triangulation(f, l, 0),
    (o, f, l) => (o as unknown as AnyOc).BRep_Tool.Triangulation(f, l),
  ]
  if (!anyOc.Poly_MeshPurpose) candidates.shift()

  let lastError: unknown
  for (const call of candidates) {
    try {
      const handle = call(oc, face, loc)
      triangulationCall = call
      return handle
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('BRep_Tool.Triangulation binding 探測失敗')
}

function accumulateNormal(
  positions: number[],
  normals: number[],
  ia: number,
  ib: number,
  ic: number,
): void {
  const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2]
  const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2]
  const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2]
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  // 未正規化的外積長度 ∝ 三角形面積，天然做面積加權。
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  for (const i of [ia, ib, ic]) {
    normals[i * 3] += nx
    normals[i * 3 + 1] += ny
    normals[i * 3 + 2] += nz
  }
}

function normalizeNormals(normals: number[]): void {
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 1], z = normals[i + 2]
    const len = Math.hypot(x, y, z)
    if (len > 1e-12) {
      normals[i] = x / len
      normals[i + 1] = y / len
      normals[i + 2] = z / len
    } else {
      normals[i + 2] = 1
    }
  }
}

function discretizeEdges(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): { edgePositions: Float32Array; edgeGroups: TopoGroup[] } {
  const edgePositions: number[] = []
  const edgeGroups: TopoGroup[] = []

  const edgeMap = new oc.TopTools_IndexedMapOfShape_1()
  oc.TopExp.MapShapes_1(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE as TopAbs_ShapeEnum,
    edgeMap,
  )

  // edge → 所屬 face 的映射，用來偵測參數化縫線邊（如圓柱側面的接縫）。
  const ancestors = new oc.TopTools_IndexedDataMapOfShapeListOfShape_1()
  oc.TopExp.MapShapesAndAncestors(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE as TopAbs_ShapeEnum,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
    ancestors,
  )

  for (let e = 1; e <= edgeMap.Extent(); e++) {
    const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(e))
    if (isHiddenEdge(oc, edge, ancestors)) {
      edge.delete()
      continue
    }
    const start = edgePositions.length / 3
    try {
      const curve = new oc.BRepAdaptor_Curve_2(edge)
      const sampler = new oc.GCPnts_TangentialDeflection_2(
        curve,
        ANGULAR_DEFLECTION,
        LINEAR_DEFLECTION,
        2, // 最少點數
        1e-9,
        1e-7,
      )
      const nb = sampler.NbPoints()
      let prev: { x: number; y: number; z: number } | null = null
      for (let i = 1; i <= nb; i++) {
        const p = sampler.Value(i)
        const cur = { x: p.X(), y: p.Y(), z: p.Z() }
        p.delete()
        if (prev) {
          edgePositions.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z)
        }
        prev = cur
      }
      del(sampler, curve)
    } catch {
      // 退化邊（如圓柱縫線邊界的極短邊）取樣失敗就跳過。
    }
    const count = edgePositions.length / 3 - start
    if (count > 0) edgeGroups.push({ topoId: e, start, count })
    edge.delete()
  }
  ancestors.delete()
  edgeMap.delete()

  return { edgePositions: new Float32Array(edgePositions), edgeGroups }
}

/** 退化邊（圓柱頂點縮邊等）與縫線邊不顯示也不可選。 */
function isHiddenEdge(
  oc: OpenCascadeInstance,
  edge: TopoDS_Edge,
  ancestors: TopTools_IndexedDataMapOfShapeListOfShape,
): boolean {
  if (oc.BRep_Tool.Degenerated(edge)) return true
  const idx = ancestors.FindIndex(edge)
  if (idx === 0) return false
  const faces = ancestors.FindFromIndex(idx)
  if (faces.Size() === 0) return false
  const face = oc.TopoDS.Face_1(faces.First_1())
  // 縫線邊：同一個 face 在參數空間閉合處的自我接縫。
  const seam = oc.BRep_Tool.IsClosed_2(edge, face)
  face.delete()
  return seam
}
