// Kernel worker：OCCT wasm 只活在這裡，主執行緒永遠不碰。
// Shape 存在 worker 內的 registry，主執行緒只拿 bodyId + tessellation。

import ocFactory from 'opencascade.js/dist/opencascade.full.js'
import ocWasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url'
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
} from 'opencascade.js/dist/opencascade.full.js'
import {
  meshTransferables,
  type BodyMeshResult,
  type KernelRequest,
  type KernelResponse,
} from './protocol.ts'
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
  }
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
