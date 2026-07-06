// Kernel worker：OCCT wasm 只活在這裡，主執行緒永遠不碰。
// Shape 存在 worker 內的 registry，主執行緒只拿 bodyId + tessellation。

import ocFactory from 'opencascade.js/dist/opencascade.full.js'
import ocWasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url'
import type {
  OpenCascadeInstance,
  TopoDS_Face,
  TopoDS_Shape,
  TopAbs_ShapeEnum,
} from 'opencascade.js/dist/opencascade.full.js'
import type { SketchPlane } from '../sketch/model.ts'
import {
  meshTransferables,
  type BodyMeshResult,
  type ExtrudeResult,
  type KernelRequest,
  type KernelResponse,
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

const bodies = new Map<number, TopoDS_Shape>()
let nextBodyId = 1

/** 每張草圖目前偵測到的閉合區域 faces（擠出直接取用）。 */
const sketchRegions = new Map<number, (TopoDS_Face | null)[]>()
/** 草圖平面（擠出方向 = 法線）。 */
const sketchPlanes = new Map<number, SketchPlane>()

function disposeSketch(sketchId: number): void {
  const faces = sketchRegions.get(sketchId)
  if (faces) {
    for (const f of faces) f?.delete()
    sketchRegions.delete(sketchId)
  }
  sketchPlanes.delete(sketchId)
}

/** 就地平移 shape（B-rep 座標真的移動，不是顯示層假位移）。 */
function translated(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  at: [number, number, number] | undefined,
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

function registerBody(oc: OpenCascadeInstance, shape: TopoDS_Shape): BodyMeshResult {
  const bodyId = nextBodyId++
  bodies.set(bodyId, shape)
  return { bodyId, mesh: tessellate(oc, shape) }
}

async function handle(req: KernelRequest): Promise<{ result: unknown; transfer: ArrayBuffer[] }> {
  const oc = await ocPromise
  switch (req.op) {
    case 'ping':
      return { result: 'pong', transfer: [] }
    case 'makeBox': {
      const maker = new oc.BRepPrimAPI_MakeBox_2(req.dx, req.dy, req.dz)
      const shape = translated(oc, maker.Shape(), req.at)
      maker.delete()
      const body = registerBody(oc, shape)
      return { result: body, transfer: meshTransferables(body.mesh) }
    }
    case 'makeCylinder': {
      const maker = new oc.BRepPrimAPI_MakeCylinder_1(req.radius, req.height)
      const shape = translated(oc, maker.Shape(), req.at)
      maker.delete()
      const body = registerBody(oc, shape)
      return { result: body, transfer: meshTransferables(body.mesh) }
    }
    case 'deleteBody': {
      const shape = bodies.get(req.bodyId)
      if (shape) {
        shape.delete()
        bodies.delete(req.bodyId)
      }
      return { result: null, transfer: [] }
    }
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
      const result: SketchRegionsResult = {
        regions: faces.map((face, i) => ({
          regionId: i + 1,
          mesh: tessellate(oc, face),
        })),
        debug,
      }
      const transfer = result.regions.flatMap((r) => meshTransferables(r.mesh))
      return { result, transfer }
    }
    case 'clearSketch': {
      disposeSketch(req.sketchId)
      return { result: null, transfer: [] }
    }
    case 'extrude': {
      const result = extrude(oc, req.sketchId, req.regionId, req.height, req.hostBodyId)
      return { result, transfer: meshTransferables(result.body.mesh) }
    }
  }
}

/** 區域 face 沿法線掃出稜柱；有宿主 body 時依方向 fuse/cut，否則建新 body。 */
function extrude(
  oc: OpenCascadeInstance,
  sketchId: number,
  regionId: number,
  height: number,
  hostBodyId: number | null,
): ExtrudeResult {
  const faces = sketchRegions.get(sketchId)
  const plane = sketchPlanes.get(sketchId)
  const face = faces?.[regionId - 1]
  if (!face || !plane) throw new Error(`區域不存在（sketch ${sketchId} region ${regionId}）`)
  if (Math.abs(height) < 1e-3) throw new Error('擠出高度過小')

  const vec = new oc.gp_Vec_4(
    plane.normal[0] * height,
    plane.normal[1] * height,
    plane.normal[2] * height,
  )
  const prismMaker = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true)
  const prism = prismMaker.Shape()
  prismMaker.delete()
  vec.delete()

  // 區域已被消耗：之後不能再對同一區域擠出
  faces[regionId - 1] = null
  face.delete()

  const host = hostBodyId !== null ? bodies.get(hostBodyId) : undefined
  if (host && hostBodyId !== null) {
    const progress = new oc.Message_ProgressRange_1()
    const op =
      height >= 0
        ? new oc.BRepAlgoAPI_Fuse_3(host, prism, progress)
        : new oc.BRepAlgoAPI_Cut_3(host, prism, progress)
    if (!op.IsDone()) {
      op.delete()
      progress.delete()
      prism.delete()
      throw new Error('布林運算失敗')
    }
    const merged = op.Shape()
    op.delete()
    progress.delete()
    prism.delete()
    host.delete()
    bodies.set(hostBodyId, merged)
    return {
      kind: 'updatedBody',
      body: { bodyId: hostBodyId, mesh: tessellate(oc, merged) },
    }
  }

  const bodyId = nextBodyId++
  bodies.set(bodyId, prism)
  return { kind: 'newBody', body: { bodyId, mesh: tessellate(oc, prism) } }
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
  const isPlane =
    surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane
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
