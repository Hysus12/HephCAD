// Kernel worker 與主執行緒之間的訊息協議。
// 幾何陣列一律用 TypedArray，postMessage 時以 Transferable 零拷貝搬移。

import type { SketchCurve, SketchPlane } from '../sketch/model.ts'

/** 一個 face / edge 在扁平陣列中的區段（給 M2 picking 反查用）。 */
export interface TopoGroup {
  /** 該 body 內的拓撲索引（TopTools_IndexedMapOfShape 的 1-based 編號）。 */
  topoId: number
  /** 起始位置：face 是 index buffer 的 index、edge 是頂點序號。 */
  start: number
  count: number
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  faceGroups: TopoGroup[]
  /** 邊折線的頂點（每兩點一段，餵 LineSegments）。 */
  edgePositions: Float32Array
  edgeGroups: TopoGroup[]
}

export interface BodyMeshResult {
  bodyId: number
  mesh: MeshData
}

/** 建立時的平移（mm），讓連續新增的物體不會疊在原點。 */
export type Translation = [number, number, number]

/** 草圖閉合區域：kernel 內留有對應的 face，供 M4 擠出。 */
export interface RegionResult {
  regionId: number
  mesh: MeshData
}

export interface SketchRegionsResult {
  regions: RegionResult[]
  /** 管線診斷（dev 用）。 */
  debug?: string
}

export type KernelRequest =
  | { id: number; op: 'ping' }
  | { id: number; op: 'makeBox'; dx: number; dy: number; dz: number; at?: Translation }
  | { id: number; op: 'makeCylinder'; radius: number; height: number; at?: Translation }
  | { id: number; op: 'deleteBody'; bodyId: number }
  | { id: number; op: 'facePlane'; bodyId: number; faceId: number }
  | {
      id: number
      op: 'sketchRegions'
      sketchId: number
      plane: SketchPlane
      curves: SketchCurve[]
    }
  | { id: number; op: 'clearSketch'; sketchId: number }

export type KernelOp = KernelRequest['op']

export type KernelResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

/** 收集 MeshData 內所有可轉移的 buffer。 */
export function meshTransferables(mesh: MeshData): ArrayBuffer[] {
  return [
    mesh.positions.buffer,
    mesh.normals.buffer,
    mesh.indices.buffer,
    mesh.edgePositions.buffer,
  ] as ArrayBuffer[]
}
