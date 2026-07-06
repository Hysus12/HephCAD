// 在 kernel worker 內執行：把草圖曲線變成 OCCT edges，
// 用 BOPAlgo_Tools 的平面圖分析（EdgesToWires → WiresToFaces）找出閉合區域。

import type {
  OpenCascadeInstance,
  TopoDS_Edge,
  TopoDS_Face,
  TopAbs_ShapeEnum,
  gp_Pnt,
} from 'opencascade.js/dist/opencascade.full.js'
import {
  uvToWorld,
  type SketchCurve,
  type SketchPlane,
  type Vec2,
} from '../sketch/model.ts'

/** 平面圖分析的角度容差（rad）。 */
const ANGULAR_TOLERANCE = 1e-4

interface Deletable {
  delete(): void
}

function del(...objs: Deletable[]): void {
  for (const o of objs) o.delete()
}

export interface SketchRegionsBuild {
  faces: TopoDS_Face[]
  debug: string
}

/**
 * 回傳偵測到的閉合區域 faces（呼叫端負責 delete 或保存）。
 * 無法成 edge 的曲線（退化）直接跳過。
 */
export function buildSketchRegions(
  oc: OpenCascadeInstance,
  plane: SketchPlane,
  curves: SketchCurve[],
): SketchRegionsBuild {
  const edges: TopoDS_Edge[] = []
  const errors: string[] = []
  for (const curve of curves) {
    try {
      const edge = curveToEdge(oc, plane, curve)
      if (edge) edges.push(edge)
    } catch (e) {
      // 單一退化曲線不應毀掉整張草圖
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (edges.length === 0) {
    return { faces: [], debug: `no edges; errors: ${errors.slice(0, 3).join(' | ')}` }
  }

  const builder = new oc.BRep_Builder()
  const edgesCompound = new oc.TopoDS_Compound()
  builder.MakeCompound(edgesCompound)
  for (const e of edges) builder.Add(edgesCompound, e)

  const wires = new oc.TopoDS_Compound()
  builder.MakeCompound(wires)
  const wireStatus = oc.BOPAlgo_Tools.EdgesToWires(
    edgesCompound,
    wires,
    false,
    ANGULAR_TOLERANCE,
  )

  const facesCompound = new oc.TopoDS_Compound()
  builder.MakeCompound(facesCompound)
  const ok = oc.BOPAlgo_Tools.WiresToFaces(wires, facesCompound, ANGULAR_TOLERANCE)
  const debug =
    `edges=${edges.length} wireStatus=${wireStatus} ` +
    `wiresNull=${wires.IsNull()} wires=${countShapes(oc, wires, 'TopAbs_WIRE')} ` +
    `wireEdges=${countShapes(oc, wires, 'TopAbs_EDGE')} facesOk=${ok} ` +
    `faces=${countShapes(oc, facesCompound, 'TopAbs_FACE')}`

  const faces: TopoDS_Face[] = []
  if (ok) {
    const explorer = new oc.TopExp_Explorer_2(
      facesCompound,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE as TopAbs_ShapeEnum,
    )
    while (explorer.More()) {
      faces.push(oc.TopoDS.Face_1(explorer.Current()))
      explorer.Next()
    }
    explorer.delete()
  }

  del(edgesCompound, wires, facesCompound, builder, ...edges)
  return { faces, debug }
}

function countShapes(
  oc: OpenCascadeInstance,
  shape: { IsNull(): boolean },
  kind: 'TopAbs_WIRE' | 'TopAbs_FACE' | 'TopAbs_EDGE',
): number {
  if (shape.IsNull()) return -1
  const explorer = new oc.TopExp_Explorer_2(
    shape as never,
    oc.TopAbs_ShapeEnum[kind] as TopAbs_ShapeEnum,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE as TopAbs_ShapeEnum,
  )
  let n = 0
  while (explorer.More()) {
    n++
    explorer.Next()
  }
  explorer.delete()
  return n
}

function curveToEdge(
  oc: OpenCascadeInstance,
  plane: SketchPlane,
  curve: SketchCurve,
): TopoDS_Edge | null {
  switch (curve.kind) {
    case 'line': {
      const p1 = pnt(oc, plane, curve.a)
      const p2 = pnt(oc, plane, curve.b)
      const maker = new oc.GC_MakeSegment_1(p1, p2)
      const edge = trimmedCurveToEdge(oc, maker.Value())
      del(maker, p2, p1)
      return edge
    }
    case 'arc': {
      const p1 = pnt(oc, plane, curve.start)
      const p2 = pnt(oc, plane, curve.through)
      const p3 = pnt(oc, plane, curve.end)
      const maker = new oc.GC_MakeArcOfCircle_4(p1, p2, p3)
      if (!maker.IsDone()) {
        del(maker, p3, p2, p1)
        return null
      }
      const edge = trimmedCurveToEdge(oc, maker.Value())
      del(maker, p3, p2, p1)
      return edge
    }
    case 'circle': {
      if (curve.radius <= 0) return null
      const center = pnt(oc, plane, curve.center)
      const normal = new oc.gp_Dir_4(plane.normal[0], plane.normal[1], plane.normal[2])
      const xDir = new oc.gp_Dir_4(plane.xDir[0], plane.xDir[1], plane.xDir[2])
      const ax2 = new oc.gp_Ax2_2(center, normal, xDir)
      const circ = new oc.gp_Circ_2(ax2, curve.radius)
      const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_8(circ)
      const edge = edgeMaker.Edge()
      del(edgeMaker, circ, ax2, xDir, normal, center)
      return edge
    }
  }
}

function pnt(oc: OpenCascadeInstance, plane: SketchPlane, p: Vec2): gp_Pnt {
  const [x, y, z] = uvToWorld(plane, p)
  return new oc.gp_Pnt_3(x, y, z)
}

/**
 * embind 不會把 Handle_Geom_TrimmedCurve 上轉成 Handle_Geom_Curve，
 * 需以裸指標重新包一層 base handle。
 */
function trimmedCurveToEdge(
  oc: OpenCascadeInstance,
  trimmed: { get(): unknown; delete(): void },
): TopoDS_Edge {
  const base = new oc.Handle_Geom_Curve_2(trimmed.get() as never)
  const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_24(base)
  const edge = edgeMaker.Edge()
  edgeMaker.delete()
  base.delete()
  trimmed.delete()
  return edge
}
