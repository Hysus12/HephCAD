import type { JournalOp } from '../doc/journal.ts'
import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import type {
  ApplyOpResult,
  BodyMeshResult,
  KernelRequest,
  KernelResponse,
  MeasureResult,
  ReplayResult,
  SketchRegionsResult,
} from './protocol.ts'

/** recovering：worker 崩潰後正在重啟（之後由呼叫端重放文件）。 */
export type KernelStatus = 'loading' | 'ready' | 'recovering' | 'error'

interface Pending {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

/** Omit 不會對 union 逐項分配，手動 distribute。 */
type WithoutId<T> = T extends { id: number } ? Omit<T, 'id'> : never

/** Worker 的最小介面（測試可注入假 worker）。 */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export interface KernelClientOptions {
  onStatus: (status: KernelStatus, detail?: string) => void
  /** 崩潰重啟完成、新 worker 已就緒時呼叫——呼叫端負責重放文件。 */
  onRestarted?: () => void
  createWorker?: () => WorkerLike
}

/** 時間窗內允許的自動重啟次數；超過代表問題不是偶發，停止重試避免無限迴圈。 */
const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 60_000

function defaultCreateWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

/**
 * 主執行緒的 kernel 代理：request/response 配對成 Promise。
 *
 * 崩潰隔離（ADR 0001）：worker 回報 fatal（wasm abort / OOM）或觸發 onerror 時，
 * 立即拒絕所有 pending 請求（避免呼叫端永遠等待），終止並重建 worker，
 * 就緒後通知 onRestarted 讓文件層重放 journal。
 */
export class KernelClient {
  private worker!: WorkerLike
  private readonly pending = new Map<number, Pending>()
  private nextRequestId = 1
  private everReady = false
  private recovering = false
  private disposed = false
  private readonly restartTimes: number[] = []
  private readonly createWorker: () => WorkerLike

  constructor(private readonly options: KernelClientOptions) {
    this.createWorker = options.createWorker ?? defaultCreateWorker
    this.spawn()
  }

  /** 套用單一 journal op（現場操作與 redo 共用）。 */
  applyOp(jop: JournalOp): Promise<ApplyOpResult> {
    return this.request({ op: 'applyOp', jop }) as Promise<ApplyOpResult>
  }

  /** 只算結果 mesh、不改狀態（拖曳中的圓角/抽殼預覽）。 */
  previewOp(jop: JournalOp): Promise<BodyMeshResult> {
    return this.request({ op: 'previewOp', jop }) as Promise<BodyMeshResult>
  }

  /** 重置 kernel 狀態並重放整份 journal（undo / 開檔 / 崩潰還原）。 */
  replayJournal(ops: JournalOp[]): Promise<ReplayResult> {
    return this.request({ op: 'replayJournal', ops }) as Promise<ReplayResult>
  }

  exportStep(bodyIds: number[]): Promise<string> {
    return this.request({ op: 'exportStep', bodyIds }) as Promise<string>
  }

  /** 平面 face 的草圖座標系；非平面 face 回傳 null。 */
  facePlane(bodyId: number, faceId: number): Promise<SketchPlane | null> {
    return this.request({ op: 'facePlane', bodyId, faceId }) as Promise<SketchPlane | null>
  }

  sketchRegions(plane: SketchPlane, curves: SketchCurve[]): Promise<SketchRegionsResult> {
    return this.request({ op: 'sketchRegions', plane, curves }) as Promise<SketchRegionsResult>
  }

  measure(
    items: { bodyId: number; kind: 'body' | 'face' | 'edge'; topoId: number }[],
  ): Promise<MeasureResult> {
    return this.request({ op: 'measure', items }) as Promise<MeasureResult>
  }

  dispose(): void {
    this.disposed = true
    this.worker.terminate()
    this.rejectAll(new Error('kernel worker 已終止'))
  }

  private spawn(): void {
    const worker = this.createWorker()
    this.worker = worker
    worker.onmessage = (event: MessageEvent<KernelResponse>) => {
      if (this.worker !== worker) return // 舊 worker 的遲到訊息
      this.handleResponse(event.data)
    }
    worker.onerror = (event: ErrorEvent) => {
      if (this.worker !== worker) return
      this.crash(event.message || 'worker error')
    }

    this.options.onStatus(this.recovering ? 'recovering' : 'loading')
    this.request({ op: 'ping' })
      .then(() => {
        const wasRecovering = this.recovering
        this.everReady = true
        this.recovering = false
        this.options.onStatus('ready')
        if (wasRecovering) this.options.onRestarted?.()
      })
      .catch(() => {
        // ping 失敗已由 crash() 處理狀態
      })
  }

  private handleResponse(res: KernelResponse): void {
    const entry = this.pending.get(res.id)
    if (entry) this.pending.delete(res.id)
    if (res.ok) {
      entry?.resolve(res.result)
      return
    }
    entry?.reject(new Error(res.error))
    if (res.fatal) this.crash(res.error)
  }

  private crash(reason: string): void {
    if (this.disposed) return
    this.worker.terminate()
    this.rejectAll(new Error(`幾何核心已重新啟動：${reason}`))

    // 從未就緒過（wasm 下載/編譯失敗）重啟也沒用
    if (!this.everReady) {
      this.options.onStatus('error', reason)
      return
    }
    const now = Date.now()
    while (this.restartTimes.length > 0 && now - this.restartTimes[0] > RESTART_WINDOW_MS) {
      this.restartTimes.shift()
    }
    if (this.restartTimes.length >= MAX_RESTARTS) {
      this.options.onStatus('error', `幾何核心反覆崩潰：${reason}`)
      return
    }
    this.restartTimes.push(now)
    this.recovering = true
    this.spawn()
  }

  private rejectAll(error: Error): void {
    const entries = [...this.pending.values()]
    this.pending.clear()
    for (const entry of entries) entry.reject(error)
  }

  private request(req: WithoutId<KernelRequest>): Promise<unknown> {
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...req, id })
    })
  }
}
