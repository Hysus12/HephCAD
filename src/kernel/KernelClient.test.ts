import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KernelClient, type KernelStatus, type WorkerLike } from './KernelClient.ts'
import { isFatalKernelError } from './protocol.ts'

/** 假 worker：記錄收到的請求，由測試決定回應。 */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly sent: { id: number; op: string }[] = []
  terminated = false

  postMessage(message: unknown): void {
    this.sent.push(message as { id: number; op: string })
  }

  terminate(): void {
    this.terminated = true
  }

  reply(id: number, payload: Record<string, unknown>): void {
    this.onmessage?.({ data: { id, ...payload } } as MessageEvent)
  }

  /** 回應最後一個指定 op 的請求。 */
  replyTo(op: string, payload: Record<string, unknown>): void {
    const req = [...this.sent].reverse().find((r) => r.op === op)
    if (!req) throw new Error(`no ${op} request`)
    this.reply(req.id, payload)
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('KernelClient', () => {
  let workers: FakeWorker[]
  let statuses: KernelStatus[]
  let onRestarted: ReturnType<typeof vi.fn<() => void>>

  function makeClient() {
    return new KernelClient({
      onStatus: (s) => statuses.push(s),
      onRestarted,
      createWorker: () => {
        const w = new FakeWorker()
        workers.push(w)
        return w
      },
    })
  }

  beforeEach(() => {
    workers = []
    statuses = []
    onRestarted = vi.fn<() => void>()
  })

  it('ping 成功後回報 ready；請求與回應依 id 配對', async () => {
    const client = makeClient()
    expect(statuses).toEqual(['loading'])
    workers[0].replyTo('ping', { ok: true, result: 'pong' })
    await flush()
    expect(statuses).toEqual(['loading', 'ready'])

    const a = client.exportStep([1])
    const b = client.exportStep([2])
    const [reqA, reqB] = workers[0].sent.slice(-2)
    workers[0].reply(reqB.id, { ok: true, result: 'B' })
    workers[0].reply(reqA.id, { ok: true, result: 'A' })
    await expect(a).resolves.toBe('A')
    await expect(b).resolves.toBe('B')
  })

  it('一般錯誤只拒絕該請求，不重啟', async () => {
    const client = makeClient()
    workers[0].replyTo('ping', { ok: true, result: 'pong' })
    await flush()
    const p = client.exportStep([1])
    workers[0].replyTo('exportStep', { ok: false, error: '布林運算失敗' })
    await expect(p).rejects.toThrow('布林運算失敗')
    expect(workers).toHaveLength(1)
  })

  it('fatal 錯誤：拒絕所有 pending、重建 worker、就緒後通知 onRestarted', async () => {
    const client = makeClient()
    workers[0].replyTo('ping', { ok: true, result: 'pong' })
    await flush()

    const hanging = client.exportStep([1]) // 崩潰時仍在等待的請求
    const failing = client.measure([])
    workers[0].replyTo('measure', { ok: false, error: 'Aborted(OOM)', fatal: true })

    await expect(failing).rejects.toThrow('Aborted(OOM)')
    await expect(hanging).rejects.toThrow('幾何核心已重新啟動')
    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(statuses.at(-1)).toBe('recovering')

    workers[1].replyTo('ping', { ok: true, result: 'pong' })
    await flush()
    expect(statuses.at(-1)).toBe('ready')
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('舊 worker 的遲到回應被忽略', async () => {
    const client = makeClient()
    workers[0].replyTo('ping', { ok: true, result: 'pong' })
    await flush()
    workers[0].onerror?.({ message: 'crash' } as ErrorEvent)
    const p = client.exportStep([1])
    const req = workers[1].sent.at(-1)!
    workers[0].reply(req.id, { ok: true, result: 'stale' }) // 不該被採用
    workers[1].reply(req.id, { ok: true, result: 'fresh' })
    await expect(p).resolves.toBe('fresh')
  })

  it('從未就緒過（wasm 載入失敗）不重啟，直接 error', async () => {
    makeClient()
    workers[0].onerror?.({ message: 'failed to fetch wasm' } as ErrorEvent)
    await flush()
    expect(workers).toHaveLength(1)
    expect(statuses.at(-1)).toBe('error')
  })

  it('一分鐘內崩潰超過上限就停止重試', async () => {
    makeClient()
    workers[0].replyTo('ping', { ok: true, result: 'pong' })
    await flush()
    for (let i = 0; i < 4; i++) {
      const w = workers.at(-1)!
      w.onerror?.({ message: `crash ${i}` } as ErrorEvent)
      const next = workers.at(-1)!
      if (next !== w) {
        next.replyTo('ping', { ok: true, result: 'pong' })
        await flush()
      }
    }
    expect(workers).toHaveLength(4) // 初始 + 3 次重啟
    expect(statuses.at(-1)).toBe('error')
  })
})

describe('isFatalKernelError', () => {
  it('辨識 emscripten abort / wasm trap', () => {
    expect(isFatalKernelError(new Error('Aborted(Cannot enlarge memory arrays)'))).toBe(true)
    expect(isFatalKernelError(new Error('memory access out of bounds'))).toBe(true)
    expect(isFatalKernelError(new WebAssembly.RuntimeError('unreachable'))).toBe(true)
  })

  it('一般幾何失敗不算致命', () => {
    expect(isFatalKernelError(new Error('布林運算失敗'))).toBe(false)
    expect(isFatalKernelError(new Error('圓角失敗（半徑可能過大）'))).toBe(false)
  })
})
