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
  STEPControl_StepModelType,
} from 'opencascade.js/dist/opencascade.full.js'
import type { JournalOp, Translation } from '../doc/journal.ts'
import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import {
  meshTransferables,
  type ApplyOpResult,
  type BodyMeshResult,
  type KernelRequest,
  type KernelResponse,
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
  for (const sketchId of [...sketchRegions.keys()]) disposeSketch(sketchId)
}

// ---- 草圖區域（僅供繪圖期間的顯示與命中測試） ----

const sketchRegions = new Map<number, (TopoDS_Face | null)[]>()
const sketchPlanes = new Map<number, SketchPlane>()

function disposeSketch(sketchId: number): void {
  const faces = sketchRegions.get(sketchId)
  if (faces) {
    for (const f of faces) f?.delete()
    sketchRegions.delete(sketchId)
  }
  sketchPlanes.delete(sketchId)
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

/** 用 old 產生修改後的新 shape（不刪除 old、不動 registry）。 */
function buildModifiedShape(
  oc: OpenCascadeInstance,
  jop: Extract<JournalOp, { kind: 'transform' | 'fillet' | 'shell' }>,
  old: TopoDS_Shape,
): TopoDS_Shape {
  switch (jop.kind) {
    case 'transform': {
      const vec = new oc.gp_Vec_4(...jop.translation)
      const trsf = new oc.gp_Trsf_1()
      trsf.SetTranslation_1(vec)
      const transform = new oc.BRepBuilderAPI_Transform_2(old, trsf, false)
      const moved = transform.Shape()
      transform.delete()
      trsf.delete()
      vec.delete()
      return moved
    }
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
      let added = 0
      for (const edgeId of jop.edgeIds) {
        if (edgeId < 1 || edgeId > edgeMap.Extent()) continue
        const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(edgeId))
        maker.Add_2(jop.radius, edge)
        edge.delete()
        added++
      }
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

function booleanWithHost(
  oc: OpenCascadeInstance,
  host: TopoDS_Shape,
  tool: TopoDS_Shape,
  fuse: boolean,
): TopoDS_Shape {
  const progress = new oc.Message_ProgressRange_1()
  const op = fuse
    ? new oc.BRepAlgoAPI_Fuse_3(host, tool, progress)
    : new oc.BRepAlgoAPI_Cut_3(host, tool, progress)
  const done = op.IsDone()
  const merged = done ? op.Shape() : null
  op.delete()
  progress.delete()
  tool.delete()
  if (!merged) throw new Error('布林運算失敗')
  return merged
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
      const host = jop.hostBodyId !== null ? bodies.get(jop.hostBodyId) : undefined
      if (host && jop.hostBodyId !== null) {
        const merged = booleanWithHost(oc, host, prism, jop.height >= 0)
        bodies.set(jop.hostBodyId, merged) // 舊 host 已被 booleanWithHost 讀取，這裡直接替換
        host.delete()
        return result(jop, [jop.hostBodyId])
      }
      const bodyId = claimBodyId(jop.newBodyId ?? 0)
      setBody(bodyId, prism)
      return result(
        { ...jop, newBodyId: bodyId, name: jop.name ?? `主體 ${bodyId}` },
        [bodyId],
      )
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
      const moved = translated(oc, copy, jop.translation)
      const bodyId = claimBodyId(jop.bodyId)
      setBody(bodyId, moved)
      return result({ ...jop, bodyId }, [bodyId])
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
      for (const jop of req.ops) applyJournalOp(oc, jop)
      const alive: ReplayResult = { bodies: [...bodies.keys()].map(tessellateBody) }
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
      disposeSketch(req.sketchId)
      const { faces, debug } = buildSketchRegions(oc, req.plane, req.curves)
      sketchRegions.set(req.sketchId, faces)
      sketchPlanes.set(req.sketchId, req.plane)
      const regionsResult: SketchRegionsResult = {
        regions: faces.map((face, i) => ({
          regionId: i + 1,
          mesh: tessellate(oc, face),
        })),
        debug,
      }
      const transfer = regionsResult.regions.flatMap((r) => meshTransferables(r.mesh))
      return { result: regionsResult, transfer }
    }
    case 'clearSketch': {
      disposeSketch(req.sketchId)
      return { result: null, transfer: [] }
    }
  }
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
      error: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(response)
  }
}
