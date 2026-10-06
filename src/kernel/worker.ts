// Kernel worker：OCCT wasm 只活在這裡，主執行緒永遠不碰。
// 幾何變更一律經 applyJournalOp 執行——現場操作與 undo/redo 重放共用同一條路。
// bodyId 由 op 記錄並在重放時強制沿用（ADR 0003）。

import ocFactory from 'opencascade.js/dist/opencascade.full.js'
import ocWasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url'
import type {
  OpenCascadeInstance,
  TopoDS_Face,
  TopoDS_Shape,
  TopAbs_ShapeEnum,
  TopoDS_Edge,
  TopTools_IndexedDataMapOfShapeListOfShape,
  STEPControl_StepModelType,
} from 'opencascade.js/dist/opencascade.full.js'
import type { BoolMode, JournalOp, Rotation, Translation } from '../doc/journal.ts'
import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import {
  isFatalKernelError,
  meshTransferables,
  type ApplyOpResult,
  type BodyMeshResult,
  type KernelRequest,
  type KernelResponse,
  type MeasureResult,
  type ReplayFailure,
  type ReplayResult,
  type SketchRegionsResult,
} from './protocol.ts'
import { buildSketchRegions } from './sketchRegions.ts'
import { tessellate } from './tessellate.ts'

type OcFactory = (opts: {
  locateFile: (path: string) => string
}) => Promise<OpenCascadeInstance>

const ocPromise: Promise<OpenCascadeInstance> = (
  ocFactory as unknown as OcFactory
)({
  locateFile: (path) => (path.endsWith('.wasm') ? ocWasmUrl : path),
})

// ---- body registry ----

const bodies = new Map<number, TopoDS_Shape>()
let nextBodyId = 1

/** op 已帶 id（重放）就沿用並推進計數器；0 表示現場執行、由這裡指派。 */
function claimBodyId(requested: number): number {
  if (requested > 0) {
    nextBodyId = Math.max(nextBodyId, requested + 1)
    return requested
  }
  return nextBodyId++
}

function setBody(bodyId: number, shape: TopoDS_Shape): void {
  bodies.get(bodyId)?.delete()
  bodies.set(bodyId, shape)
}

function resetAllBodies(): void {
  for (const shape of bodies.values()) shape.delete()
  bodies.clear()
  nextBodyId = 1
}

// ---- 幾何工具 ----

/** 就地平移 shape（B-rep 座標真的移動，不是顯示層假位移）。 */
function translated(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  at: Translation | undefined,
): TopoDS_Shape {
  if (!at || (at[0] === 0 && at[1] === 0 && at[2] === 0)) return shape
  const vec = new oc.gp_Vec_4(at[0], at[1], at[2])
  const trsf = new oc.gp_Trsf_1()
  trsf.SetTranslation_1(vec)
  const transform = new oc.BRepBuilderAPI_Transform_2(shape, trsf, false)
  const moved = transform.Shape()
  transform.delete()
  trsf.delete()
  vec.delete()
  shape.delete()
  return moved
}

/** 從曲線重建區域、取第 regionIndex 個 face 沿法線掃出稜柱。 */
function prismFromCurves(
  oc: OpenCascadeInstance,
  plane: SketchPlane,
  curves: SketchCurve[],
  regionIndex: number,
  height: number,
): TopoDS_Shape {
  const { faces } = buildSketchRegions(oc, plane, curves)
  const face = faces[regionIndex]
  if (!face) {
    for (const f of faces) f.delete()
    throw new Error(`區域重建失敗（index ${regionIndex}，共 ${faces.length} 個）`)
  }
  const vec = new oc.gp_Vec_4(
    plane.normal[0] * height,
    plane.normal[1] * height,
    plane.normal[2] * height,
  )
  const prismMaker = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true)
  const prism = prismMaker.Shape()
  prismMaker.delete()
  vec.delete()
  for (const f of faces) f.delete()
  return prism
}

/**
 * 剛體變換：先繞軸旋轉、再平移，回傳新 shape（**不刪除輸入**）。
 * 恆等變換也會產生新 shape，所以呼叫端可一律把輸入視為「用完即棄」。
 */
function rigidTransform(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  translation: Translation,
  rotation?: Rotation,
): TopoDS_Shape {
  let current = shape
  let owned = false
  const apply = (trsf: { delete(): void }) => {
    const transform = new oc.BRepBuilderAPI_Transform_2(current, trsf as never, false)
    const next = transform.Shape()
    transform.delete()
    trsf.delete()
    if (owned) current.delete()
    current = next
    owned = true
  }
  if (rotation && Math.abs(rotation.angleDeg) > 1e-9) {
    const point = new oc.gp_Pnt_3(...rotation.center)
    const dir = new oc.gp_Dir_4(...rotation.axis)
    const axis = new oc.gp_Ax1_2(point, dir)
    const trsf = new oc.gp_Trsf_1()
    trsf.SetRotation_1(axis, (rotation.angleDeg * Math.PI) / 180)
    axis.delete()
    dir.delete()
    point.delete()
    apply(trsf)
  }
  const vec = new oc.gp_Vec_4(...translation)
  const move = new oc.gp_Trsf_1()
  move.SetTranslation_1(vec)
  vec.delete()
  apply(move)
  return current
}

type ChamferAdd3 = {
  Add_3(d1: number, d2: number, edge: TopoDS_Edge, face: TopoDS_Face): void
}

/** 邊相鄰的面中面積較大者（倒角角度的參考面，讓「角度」落在直覺的那一側）。 */
function largestAdjacentFace(
  oc: OpenCascadeInstance,
  ancestors: TopTools_IndexedDataMapOfShapeListOfShape,
  edge: TopoDS_Edge,
): TopoDS_Face | null {
  const index = ancestors.FindIndex(edge)
  if (index === 0) return null
  const faces = ancestors.FindFromIndex(index)
  if (faces.Size() === 0) return null
  // 一條邊最多兩個鄰面（縫線邊同一面出現兩次），首尾即全部
  const candidates = [faces.First_1(), faces.Last_1()]
  let best: TopoDS_Face | null = null
  let bestArea = -1
  for (const shape of candidates) {
    const face = oc.TopoDS.Face_1(shape)
    const props = new oc.GProp_GProps_1()
    oc.BRepGProp.SurfaceProperties_1(face, props, false, false)
    const area = props.Mass()
    props.delete()
    if (area > bestArea) {
      best?.delete()
      best = face
      bestArea = area
    } else {
      face.delete()
    }
  }
  return best
}

/** 用 old 產生修改後的新 shape（不刪除 old、不動 registry）。 */
function buildModifiedShape(
  oc: OpenCascadeInstance,
  jop: Extract<JournalOp, { kind: 'transform' | 'fillet' | 'shell' }>,
  old: TopoDS_Shape,
): TopoDS_Shape {
  switch (jop.kind) {
    case 'transform':
      return rigidTransform(oc, old, jop.translation, jop.rotation)
    case 'fillet': {
      if (jop.radius < 0.05) throw new Error('半徑過小')
      const maker = jop.chamfer
        ? new oc.BRepFilletAPI_MakeChamfer(old)
        : new oc.BRepFilletAPI_MakeFillet(
            old,
            oc.ChFi3d_FilletShape.ChFi3d_Rational as never,
          )
      const edgeMap = new oc.TopTools_IndexedMapOfShape_1()
      oc.TopExp.MapShapes_1(
        old,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE as TopAbs_ShapeEnum,
        edgeMap,
      )
      // 非 45° 的倒角需要「參考面」：距離沿它量，另一側距離 = 距離 · tan(角度)
      const angled =
        jop.chamfer && jop.angleDeg !== undefined && Math.abs(jop.angleDeg - 45) > 1e-6
      if (angled && !(jop.angleDeg! > 0 && jop.angleDeg! < 90)) {
        maker.delete()
        throw new Error('倒角角度需介於 0° 與 90° 之間')
      }
      const ancestors = angled ? new oc.TopTools_IndexedDataMapOfShapeListOfShape_1() : null
      if (ancestors) {
        oc.TopExp.MapShapesAndAncestors(
          old,
          oc.TopAbs_ShapeEnum.TopAbs_EDGE as TopAbs_ShapeEnum,
          oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
          ancestors,
        )
      }
      let added = 0
      for (const edgeId of jop.edgeIds) {
        if (edgeId < 1 || edgeId > edgeMap.Extent()) continue
        const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(edgeId))
        if (angled && ancestors) {
          const refFace = largestAdjacentFace(oc, ancestors, edge)
          if (!refFace) {
            edge.delete()
            continue
          }
          const d2 = jop.radius * Math.tan((jop.angleDeg! * Math.PI) / 180)
          ;(maker as unknown as ChamferAdd3).Add_3(jop.radius, d2, edge, refFace)
          refFace.delete()
        } else {
          maker.Add_2(jop.radius, edge)
        }
        edge.delete()
        added++
      }
      ancestors?.delete()
      edgeMap.delete()
      if (added === 0) {
        maker.delete()
        throw new Error('沒有可用的邊')
      }
      const progress = new oc.Message_ProgressRange_1()
      maker.Build(progress)
      const done = maker.IsDone()
      const shape = done ? maker.Shape() : null
      progress.delete()
      maker.delete()
      if (!shape) throw new Error(jop.chamfer ? '倒角失敗' : '圓角失敗（半徑可能過大）')
      return shape
    }
    case 'shell': {
      if (jop.thickness < 0.05) throw new Error('壁厚過小')
      const faceMap = new oc.TopTools_IndexedMapOfShape_1()
      oc.TopExp.MapShapes_1(
        old,
        oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
        faceMap,
      )
      const closing = new oc.TopTools_ListOfShape_1()
      for (const faceId of jop.faceIds) {
        if (faceId < 1 || faceId > faceMap.Extent()) continue
        const face = oc.TopoDS.Face_1(faceMap.FindKey(faceId))
        closing.Append_1(face)
        face.delete()
      }
      faceMap.delete()
      const maker = new oc.BRepOffsetAPI_MakeThickSolid()
      const progress = new oc.Message_ProgressRange_1()
      maker.MakeThickSolidByJoin(
        old,
        closing,
        -jop.thickness,
        1e-3,
        oc.BRepOffset_Mode.BRepOffset_Skin as never,
        false,
        false,
        oc.GeomAbs_JoinType.GeomAbs_Arc as never,
        false,
        progress,
      )
      const done = maker.IsDone()
      const shape = done ? maker.Shape() : null
      progress.delete()
      maker.delete()
      closing.delete()
      if (!shape) throw new Error('抽殼失敗（壁厚可能過大）')
      return shape
    }
  }
}

/** 以 make() 的結果取代 body 的 shape（處理好舊 shape 的釋放順序）。 */
function replaceBodyShape(
  bodyId: number,
  make: (old: TopoDS_Shape) => TopoDS_Shape,
): void {
  const old = bodies.get(bodyId)
  if (!old) throw new Error(`body ${bodyId} 不存在`)
  const next = make(old)
  bodies.delete(bodyId)
  old.delete()
  bodies.set(bodyId, next)
}

type BoolKind = 'union' | 'subtract' | 'intersect'

/**
 * a ⊕ b 的結果（新 shape，已合併共面）。**不會刪除 a 或 b**——呼叫端決定誰要釋放，
 * 這樣同一個工具體可以對多個目標重複使用。
 */
function booleanShape(
  oc: OpenCascadeInstance,
  a: TopoDS_Shape,
  b: TopoDS_Shape,
  kind: BoolKind,
): TopoDS_Shape {
  const progress = new oc.Message_ProgressRange_1()
  const op =
    kind === 'union'
      ? new oc.BRepAlgoAPI_Fuse_3(a, b, progress)
      : kind === 'subtract'
        ? new oc.BRepAlgoAPI_Cut_3(a, b, progress)
        : new oc.BRepAlgoAPI_Common_3(a, b, progress)
  const done = op.IsDone()
  const merged = done ? op.Shape() : null
  op.delete()
  progress.delete()
  if (!merged) throw new Error('布林運算失敗')
  return unifySameDomain(oc, merged)
}

function countSolids(oc: OpenCascadeInstance, shape: TopoDS_Shape): number {
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_SOLID as TopAbs_ShapeEnum,
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

function volumeOf(oc: OpenCascadeInstance, shape: TopoDS_Shape): number {
  const props = new oc.GProp_GProps_1()
  oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false)
  const v = props.Mass()
  props.delete()
  return v
}

/** 與 shape 的包圍盒有交集的本體 id（擠出沒有宿主時，自動找出被布林運算的目標）。 */
function overlappingBodyIds(oc: OpenCascadeInstance, shape: TopoDS_Shape): number[] {
  const box = new oc.Bnd_Box_1()
  oc.BRepBndLib.Add(shape, box, false)
  const ids: number[] = []
  for (const [id, body] of bodies) {
    const other = new oc.Bnd_Box_1()
    oc.BRepBndLib.Add(body, other, false)
    if (!box.IsOut_4(other)) ids.push(id)
    other.delete()
  }
  box.delete()
  return ids
}

/** 對一串工具體依序做布林；中間結果自動釋放。檢查結果有效（聯集要連成單一實體等）。 */
function chainBoolean(
  oc: OpenCascadeInstance,
  base: TopoDS_Shape,
  tools: TopoDS_Shape[],
  kind: BoolKind,
): TopoDS_Shape {
  let acc: TopoDS_Shape = base
  let owned = false
  const baseVolume = kind === 'subtract' ? volumeOf(oc, base) : 0
  try {
    for (const tool of tools) {
      const next = booleanShape(oc, acc, tool, kind)
      if (owned) acc.delete()
      acc = next
      owned = true
    }
  } catch (e) {
    if (owned) acc.delete()
    throw e
  }
  if (!owned) throw new Error('布林運算需要至少兩個本體')
  const fail = (message: string): never => {
    acc.delete()
    throw new Error(message)
  }
  if (acc.IsNull()) return fail('布林運算沒有產生結果')
  const solids = countSolids(oc, acc)
  if (solids === 0) {
    return fail(kind === 'intersect' ? '兩個本體沒有重疊，交集為空' : '布林運算沒有產生實體')
  }
  if (kind === 'union' && solids > 1) return fail('本體需要互相重疊或接觸才能聯集')
  if (
    kind === 'subtract' &&
    Math.abs(volumeOf(oc, acc) - baseVolume) < 1e-6 * Math.max(1, baseVolume)
  ) {
    return fail('兩個本體沒有重疊，沒有東西可以減去')
  }
  return acc
}

/** 合併共面（同一曲面）的相鄰面與共線邊，產出乾淨的拓撲。失敗時原樣回傳。 */
function unifySameDomain(oc: OpenCascadeInstance, shape: TopoDS_Shape): TopoDS_Shape {
  try {
    const unify = new oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false)
    unify.Build()
    const unified = unify.Shape()
    unify.delete()
    shape.delete()
    return unified
  } catch {
    return shape
  }
}

/** 平面 face 的朝外單位法線；非平面回傳 null。 */
function planarFaceNormal(
  oc: OpenCascadeInstance,
  face: TopoDS_Face,
): [number, number, number] | null {
  const surface = new oc.BRepAdaptor_Surface_2(face, true)
  if (surface.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
    surface.delete()
    return null
  }
  const pln = surface.Plane()
  const pos = pln.Position()
  const dir = pos.Direction()
  const sign = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1
  const normal: [number, number, number] = [sign * dir.X(), sign * dir.Y(), sign * dir.Z()]
  dir.delete()
  pos.delete()
  pln.delete()
  surface.delete()
  return normal
}

/**
 * 推拉面：把平面 face 沿朝外法線掃出稜柱，distance > 0 與 body 聯集（長出去）、
 * < 0 從 body 減去（壓進去）。
 */
function pushPullShape(
  oc: OpenCascadeInstance,
  body: TopoDS_Shape,
  faceId: number,
  distance: number,
): TopoDS_Shape {
  if (Math.abs(distance) < 1e-3) throw new Error('推拉距離過小')
  const faceMap = new oc.TopTools_IndexedMapOfShape_1()
  oc.TopExp.MapShapes_1(body, oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum, faceMap)
  if (faceId < 1 || faceId > faceMap.Extent()) {
    faceMap.delete()
    throw new Error('找不到要推拉的面')
  }
  const face = oc.TopoDS.Face_1(faceMap.FindKey(faceId))
  faceMap.delete()
  const normal = planarFaceNormal(oc, face)
  if (!normal) {
    face.delete()
    throw new Error('只能推拉平面')
  }
  const vec = new oc.gp_Vec_4(normal[0] * distance, normal[1] * distance, normal[2] * distance)
  const prismMaker = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true)
  const prism = prismMaker.Shape()
  prismMaker.delete()
  vec.delete()
  face.delete()
  try {
    return chainBoolean(oc, body, [prism], distance > 0 ? 'union' : 'subtract')
  } finally {
    prism.delete()
  }
}

// ---- journal 執行器 ----

function applyJournalOp(oc: OpenCascadeInstance, jop: JournalOp): ApplyOpResult {
  switch (jop.kind) {
    case 'createBox': {
      const bodyId = claimBodyId(jop.bodyId)
      const maker = new oc.BRepPrimAPI_MakeBox_2(jop.dx, jop.dy, jop.dz)
      const shape = translated(oc, maker.Shape(), jop.at)
      maker.delete()
      setBody(bodyId, shape)
      return result({ ...jop, bodyId }, [bodyId])
    }
    case 'createCylinder': {
      const bodyId = claimBodyId(jop.bodyId)
      const maker = new oc.BRepPrimAPI_MakeCylinder_1(jop.radius, jop.height)
      const shape = translated(oc, maker.Shape(), jop.at)
      maker.delete()
      setBody(bodyId, shape)
      return result({ ...jop, bodyId }, [bodyId])
    }
    case 'deleteBody': {
      const shape = bodies.get(jop.bodyId)
      if (shape) {
        shape.delete()
        bodies.delete(jop.bodyId)
      }
      return { op: jop, updated: [], removed: [jop.bodyId] }
    }
    case 'extrude': {
      if (Math.abs(jop.height) < 1e-3) throw new Error('擠出高度過小')
      const prism = prismFromCurves(oc, jop.plane, jop.curves, jop.regionIndex, jop.height)
      const hostId = jop.hostBodyId !== null && bodies.has(jop.hostBodyId) ? jop.hostBodyId : null
      // 自動：有宿主時依方向聯集/減去，否則新本體（與 Shapr3D 的預設相同）
      const mode: BoolMode =
        jop.boolMode ?? (hostId !== null ? (jop.height >= 0 ? 'union' : 'subtract') : 'new')

      if (mode === 'new') {
        const bodyId = claimBodyId(jop.newBodyId ?? 0)
        setBody(bodyId, prism)
        return result(
          { ...jop, newBodyId: bodyId, name: jop.name ?? `主體 ${bodyId}`, targetBodyIds: [] },
          [bodyId],
        )
      }

      // 目標：已記錄的（重放）→ 宿主 → 與擠出體重疊的所有本體
      const targets = (
        jop.targetBodyIds ?? (hostId !== null ? [hostId] : overlappingBodyIds(oc, prism))
      ).filter((id) => bodies.has(id))
      if (targets.length === 0) {
        prism.delete()
        throw new Error('沒有重疊的本體可以做布林運算')
      }
      const recorded = { ...jop, targetBodyIds: targets, newBodyId: null as number | null }

      try {
        if (mode === 'union') {
          // 全部併進第一個目標，其餘目標被移除
          const rest = targets.slice(1).map((id) => bodies.get(id)!)
          const merged = chainBoolean(oc, bodies.get(targets[0])!, [...rest, prism], 'union')
          setBody(targets[0], merged)
          const removed = targets.slice(1)
          for (const id of removed) {
            bodies.get(id)?.delete()
            bodies.delete(id)
          }
          return { ...result(recorded, [targets[0]]), removed }
        }
        // subtract / intersect：逐一對每個目標套用（先全部算完再替換，失敗時不留半套）
        const outputs: TopoDS_Shape[] = []
        try {
          for (const id of targets) {
            outputs.push(
              chainBoolean(oc, bodies.get(id)!, [prism], mode === 'subtract' ? 'subtract' : 'intersect'),
            )
          }
        } catch (e) {
          for (const out of outputs) out.delete()
          throw e
        }
        targets.forEach((id, i) => setBody(id, outputs[i]))
        return result(recorded, targets)
      } finally {
        prism.delete()
      }
    }
    case 'boolean': {
      const target = bodies.get(jop.targetId)
      const tools = jop.toolIds.map((id) => bodies.get(id))
      if (!target || tools.length === 0 || tools.some((t) => !t)) {
        throw new Error('找不到要做布林運算的本體')
      }
      const merged = chainBoolean(oc, target, tools as TopoDS_Shape[], jop.mode)
      if (jop.keepOriginals) {
        const resultId = claimBodyId(jop.resultBodyId)
        setBody(resultId, merged)
        return result({ ...jop, resultBodyId: resultId }, [resultId])
      }
      setBody(jop.targetId, merged)
      for (const id of jop.toolIds) {
        bodies.get(id)?.delete()
        bodies.delete(id)
      }
      return { ...result(jop, [jop.targetId]), removed: [...jop.toolIds] }
    }
    case 'transform': {
      replaceBodyShape(jop.bodyId, (old) => buildModifiedShape(oc, jop, old))
      return result(jop, [jop.bodyId])
    }
    case 'fillet':
    case 'shell': {
      replaceBodyShape(jop.bodyId, (old) => buildModifiedShape(oc, jop, old))
      return result(jop, [jop.bodyId])
    }
    case 'copyBody': {
      const source = bodies.get(jop.sourceBodyId)
      if (!source) throw new Error(`body ${jop.sourceBodyId} 不存在`)
      const copier = new oc.BRepBuilderAPI_Copy_2(source, true, false)
      const copy = copier.Shape()
      copier.delete()
      const moved = rigidTransform(oc, copy, jop.translation, jop.rotation)
      copy.delete()
      const bodyId = claimBodyId(jop.bodyId)
      setBody(bodyId, moved)
      return result({ ...jop, bodyId }, [bodyId])
    }
    case 'sketch':
      // 草圖只存在於文件層（主執行緒推導），kernel 不需要狀態
      return { op: jop, updated: [], removed: [] }
    case 'pushPull': {
      replaceBodyShape(jop.bodyId, (old) => pushPullShape(oc, old, jop.faceId, jop.distance))
      return result(jop, [jop.bodyId])
    }
    case 'importStep': {
      const oc2 = oc as unknown as {
        FS: {
          writeFile(path: string, data: string): void
          unlink(path: string): void
        }
      }
      oc2.FS.writeFile('/import.step', jop.data)
      const reader = new oc.STEPControl_Reader_1()
      const readStatus = reader.ReadFile('/import.step')
      if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        reader.delete()
        oc2.FS.unlink('/import.step')
        throw new Error('STEP 檔案解析失敗')
      }
      const progress = new oc.Message_ProgressRange_1()
      reader.TransferRoots(progress)
      const shape = reader.OneShape()
      progress.delete()
      reader.delete()
      oc2.FS.unlink('/import.step')
      if (shape.IsNull()) throw new Error('STEP 內沒有可轉換的形狀')
      const bodyId = claimBodyId(jop.bodyId)
      setBody(bodyId, shape)
      return result({ ...jop, bodyId }, [bodyId])
    }
  }
}

function result(op: JournalOp, updatedIds: number[]): ApplyOpResult {
  return { op, updated: updatedIds.map(tessellateBody), removed: [] }
}

function tessellateBody(bodyId: number): BodyMeshResult {
  const shape = bodies.get(bodyId)
  if (!shape) throw new Error(`body ${bodyId} 不存在`)
  return { bodyId, mesh: tessellateWith(shape) }
}

let ocInstance: OpenCascadeInstance | null = null
function tessellateWith(shape: TopoDS_Shape) {
  return tessellate(ocInstance!, shape)
}

function exportStep(oc: OpenCascadeInstance, bodyIds: number[]): string {
  const writer = new oc.STEPControl_Writer_1()
  const progress = new oc.Message_ProgressRange_1()
  const mode = oc.STEPControl_StepModelType
    .STEPControl_AsIs as unknown as STEPControl_StepModelType
  for (const id of bodyIds) {
    const shape = bodies.get(id)
    if (shape) writer.Transfer(shape, mode, true, progress)
  }
  writer.Write('/export.step')
  progress.delete()
  writer.delete()
  const oc2 = oc as unknown as {
    FS: {
      readFile(path: string, opts: { encoding: 'utf8' }): string
      unlink(path: string): void
    }
  }
  const text = oc2.FS.readFile('/export.step', { encoding: 'utf8' })
  oc2.FS.unlink('/export.step')
  return text
}

// ---- 訊息處理 ----

async function handle(
  req: KernelRequest,
): Promise<{ result: unknown; transfer: ArrayBuffer[] }> {
  const oc = await ocPromise
  ocInstance = oc
  switch (req.op) {
    case 'ping':
      return { result: 'pong', transfer: [] }
    case 'applyOp': {
      const applied = applyJournalOp(oc, req.jop)
      return {
        result: applied,
        transfer: applied.updated.flatMap((b) => meshTransferables(b.mesh)),
      }
    }
    case 'previewOp': {
      const jop = req.jop
      if (jop.kind !== 'transform' && jop.kind !== 'fillet' && jop.kind !== 'shell') {
        throw new Error(`${jop.kind} 不支援預覽`)
      }
      const old = bodies.get(jop.bodyId)
      if (!old) throw new Error(`body ${jop.bodyId} 不存在`)
      // OCCT 操作不會改動輸入 shape：直接建結果、取 mesh、丟棄
      const preview = buildModifiedShape(oc, jop, old)
      const body: BodyMeshResult = { bodyId: jop.bodyId, mesh: tessellate(oc, preview) }
      preview.delete()
      return { result: body, transfer: meshTransferables(body.mesh) }
    }
    case 'replayJournal': {
      resetAllBodies()
      const failed: ReplayFailure[] = []
      req.ops.forEach((jop, index) => {
        try {
          applyJournalOp(oc, jop)
        } catch (e) {
          // 致命錯誤代表模組已毀，繼續重放沒有意義——交給外層回報 fatal
          if (isFatalKernelError(e)) throw e
          failed.push({ index, error: errorMessage(e) })
        }
      })
      const alive: ReplayResult = {
        bodies: [...bodies.keys()].map(tessellateBody),
        failed,
      }
      return {
        result: alive,
        transfer: alive.bodies.flatMap((b) => meshTransferables(b.mesh)),
      }
    }
    case 'exportStep':
      return { result: exportStep(oc, req.bodyIds), transfer: [] }
    case 'facePlane': {
      const shape = bodies.get(req.bodyId)
      if (!shape) return { result: null, transfer: [] }
      return { result: facePlane(oc, shape, req.faceId), transfer: [] }
    }
    case 'sketchRegions': {
      const { faces, debug } = buildSketchRegions(oc, req.plane, req.curves)
      const regionsResult: SketchRegionsResult = {
        regions: faces.map((face, i) => ({
          regionId: i + 1,
          mesh: tessellate(oc, face),
        })),
        debug,
      }
      for (const face of faces) face.delete()
      const transfer = regionsResult.regions.flatMap((r) => meshTransferables(r.mesh))
      return { result: regionsResult, transfer }
    }
    case 'measure':
      return { result: measure(oc, req.items), transfer: [] }
  }
}

/**
 * 量測用解析積分（UseTriangulation = false），不用顯示用的三角網格——
 * 後者會把圓柱/圓角當多邊形算，體積偏差約 0.05%，違背「精確數值」。
 */
function measure(
  oc: OpenCascadeInstance,
  items: { bodyId: number; kind: 'body' | 'face' | 'edge'; topoId: number }[],
): MeasureResult {
  const result: MeasureResult = {}
  const add = (key: 'length' | 'area' | 'volume', v: number) => {
    result[key] = (result[key] ?? 0) + v
  }
  for (const item of items) {
    const shape = bodies.get(item.bodyId)
    if (!shape) continue
    const props = new oc.GProp_GProps_1()
    if (item.kind === 'body') {
      oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false)
      add('volume', props.Mass())
    } else {
      const kind =
        item.kind === 'face'
          ? oc.TopAbs_ShapeEnum.TopAbs_FACE
          : oc.TopAbs_ShapeEnum.TopAbs_EDGE
      const map = new oc.TopTools_IndexedMapOfShape_1()
      oc.TopExp.MapShapes_1(shape, kind as TopAbs_ShapeEnum, map)
      if (item.topoId >= 1 && item.topoId <= map.Extent()) {
        const sub = map.FindKey(item.topoId)
        if (item.kind === 'face') {
          oc.BRepGProp.SurfaceProperties_1(sub, props, false, false)
          add('area', props.Mass())
        } else {
          oc.BRepGProp.LinearProperties(sub, props, false, false)
          add('length', props.Mass())
        }
      }
      map.delete()
    }
    props.delete()
  }
  return result
}

/** 取平面 face 的草圖座標系；非平面回傳 null。faceId 與 tessellation 的拓撲索引一致。 */
function facePlane(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  faceId: number,
): SketchPlane | null {
  const faceMap = new oc.TopTools_IndexedMapOfShape_1()
  oc.TopExp.MapShapes_1(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as TopAbs_ShapeEnum,
    faceMap,
  )
  if (faceId < 1 || faceId > faceMap.Extent()) {
    faceMap.delete()
    return null
  }
  const face = oc.TopoDS.Face_1(faceMap.FindKey(faceId))
  faceMap.delete()

  const surface = new oc.BRepAdaptor_Surface_2(face, true)
  const isPlane = surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane
  if (!isPlane) {
    surface.delete()
    face.delete()
    return null
  }

  const pln = surface.Plane()
  const pos = pln.Position()
  const location = pos.Location()
  const xDir = pos.XDirection()
  const yDir = pos.YDirection()
  const dir = pos.Direction()
  const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED
  const sign = reversed ? -1 : 1

  const plane: SketchPlane = {
    origin: [location.X(), location.Y(), location.Z()],
    xDir: [xDir.X(), xDir.Y(), xDir.Z()],
    yDir: [yDir.X(), yDir.Y(), yDir.Z()],
    normal: [sign * dir.X(), sign * dir.Y(), sign * dir.Z()],
  }
  dir.delete()
  yDir.delete()
  xDir.delete()
  location.delete()
  pos.delete()
  pln.delete()
  surface.delete()
  face.delete()
  return plane
}

self.onmessage = async (event: MessageEvent<KernelRequest>) => {
  const req = event.data
  try {
    const { result, transfer } = await handle(req)
    const response: KernelResponse = { id: req.id, ok: true, result }
    self.postMessage(response, { transfer })
  } catch (e) {
    const response: KernelResponse = {
      id: req.id,
      ok: false,
      error: errorMessage(e),
      fatal: isFatalKernelError(e),
    }
    self.postMessage(response)
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
