// Kernel worker 與主執行緒之間的訊息協議。
// 幾何陣列一律用 TypedArray，postMessage 時以 Transferable 零拷貝搬移。
// 幾何變更一律走 JournalOp（applyOp / replayJournal），現場與重放同一條路。

import type { JournalOp } from '../doc/journal.ts'
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

/**
 * 草圖閉合區域（僅供顯示與擠出命中測試）。kernel 不保留 face：
 * 擠出 op 會從曲線重建區域，所以這裡是無狀態的。
 */
export interface RegionResult {
  regionId: number
  mesh: MeshData
}

export interface SketchRegionsResult {
  regions: RegionResult[]
  /** 管線診斷（dev 用）。 */
  debug?: string
}


/** 套用單一 journal op 的效果。 */
export interface ApplyOpResult {
  /** id 已填妥的 op（首次執行時 kernel 指派 bodyId）。 */
  op: JournalOp
  /** 新增或內容更新的 body。 */
  updated: BodyMeshResult[]
  /** 被移除的 bodyId。 */
  removed: number[]
}

export interface ReplayFailure {
  /** 在重放 ops 陣列中的索引。 */
  index: number
  error: string
}

export interface ReplayResult {
  /** 重放後所有存活的 body。 */
  bodies: BodyMeshResult[]
  /** 重放時失敗而被略過的 op（之後依賴它的 op 通常也會連帶失敗）。 */
  failed: ReplayFailure[]
}

export type KernelRequest =
  | { id: number; op: 'ping' }
  | { id: number; op: 'applyOp'; jop: JournalOp }
  | {
      id: number
      /** 只計算結果 mesh、不改 kernel 狀態（拖曳中的圓角/抽殼預覽）。 */
      op: 'previewOp'
      jop: JournalOp
    }
  | { id: number; op: 'replayJournal'; ops: JournalOp[] }
  | { id: number; op: 'exportStep'; bodyIds: number[] }
  | { id: number; op: 'facePlane'; bodyId: number; faceId: number }
  | {
      id: number
      op: 'sketchRegions'
      plane: SketchPlane
      curves: SketchCurve[]
    }
  | {
      id: number
      op: 'measure'
      items: { bodyId: number; kind: 'body' | 'face' | 'edge'; topoId: number }[]
    }

/** 量測結果（依選取內容，只填相關欄位）。 */
export interface MeasureResult {
  /** 選取 edge 的總長（mm）。 */
  length?: number
  /** 選取 face 的總面積（mm²）。 */
  area?: number
  /** 選取 body 的總體積（mm³）。 */
  volume?: number
}

export type KernelOp = KernelRequest['op']

export type KernelResponse =
  | { id: number; ok: true; result: unknown }
  | {
      id: number
      ok: false
      error: string
      /**
       * wasm 已 abort（OOM、記憶體越界等），之後所有呼叫都會失敗：
       * 主執行緒應終止並重啟 worker、重放文件。
       */
      fatal?: boolean
    }

/** emscripten abort / wasm trap 的特徵——發生後模組狀態不可再信任。 */
export function isFatalKernelError(error: unknown): boolean {
  if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.RuntimeError) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /aborted|abort\(|unreachable|out of bounds|out of memory|cannot enlarge memory/i.test(
    message,
  )
}

/** 收集 MeshData 內所有可轉移的 buffer。 */
export function meshTransferables(mesh: MeshData): ArrayBuffer[] {
  return [
    mesh.positions.buffer,
    mesh.normals.buffer,
    mesh.indices.buffer,
    mesh.edgePositions.buffer,
  ] as ArrayBuffer[]
}
