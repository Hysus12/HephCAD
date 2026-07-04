import type {
  BodyMeshResult,
  KernelRequest,
  KernelResponse,
  Translation,
} from './protocol.ts'

export type KernelStatus = 'loading' | 'ready' | 'error'

interface Pending {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

/** Omit 不會對 union 逐項分配，手動 distribute。 */
type WithoutId<T> = T extends { id: number } ? Omit<T, 'id'> : never

/**
 * 主執行緒的 kernel 代理：request/response 配對成 Promise。
 * wasm 載入約需數秒，建構後立刻 ping，成功即回報 ready。
 */
export class KernelClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextRequestId = 1

  constructor(onStatus: (status: KernelStatus, detail?: string) => void) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (event: MessageEvent<KernelResponse>) => {
      const res = event.data
      const entry = this.pending.get(res.id)
      if (!entry) return
      this.pending.delete(res.id)
      if (res.ok) entry.resolve(res.result)
      else entry.reject(new Error(res.error))
    }
    this.worker.onerror = (event) => {
      onStatus('error', event.message)
    }

    onStatus('loading')
    this.request({ op: 'ping' })
      .then(() => onStatus('ready'))
      .catch((e: Error) => onStatus('error', e.message))
  }

  makeBox(dx: number, dy: number, dz: number, at?: Translation): Promise<BodyMeshResult> {
    return this.request({ op: 'makeBox', dx, dy, dz, at }) as Promise<BodyMeshResult>
  }

  makeCylinder(radius: number, height: number, at?: Translation): Promise<BodyMeshResult> {
    return this.request({ op: 'makeCylinder', radius, height, at }) as Promise<BodyMeshResult>
  }

  deleteBody(bodyId: number): Promise<void> {
    return this.request({ op: 'deleteBody', bodyId }) as Promise<void>
  }

  dispose(): void {
    this.worker.terminate()
    for (const entry of this.pending.values()) {
      entry.reject(new Error('kernel worker 已終止'))
    }
    this.pending.clear()
  }

  private request(req: WithoutId<KernelRequest>): Promise<unknown> {
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...req, id })
    })
  }
}
