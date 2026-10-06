// 文件控制器：所有幾何變更的唯一入口。
// apply → kernel 執行 → 場景/store 同步 → journal 記錄 → 自動存檔。
// undo = 截斷重放、redo = 重執行下一筆、recover = kernel 崩潰重啟後全量重放。
// 重放中失敗的 op 會被略過並標記（journalFailures），文件其餘部分照常還原。

import type { KernelClient } from '../kernel/KernelClient.ts'
import type { ApplyOpResult, BodyMeshResult } from '../kernel/protocol.ts'
import { useAppStore } from '../state/appStore.ts'
import type { Viewport } from '../viewport/Viewport.ts'
import {
  aliveBodyNames,
  opLabel,
  type DocumentFile,
  type JournalEntry,
  type JournalOp,
} from './journal.ts'
import { loadDocument, saveDocument } from './persistence.ts'

const AUTOSAVE_DELAY_MS = 800

export interface DocDeps {
  kernel: () => KernelClient | null
  viewport: () => Viewport | null
}

export class DocumentController {
  private entries: JournalEntry[] = []
  private cursor = 0
  /** 最近一次重放時失敗的項目（索引 → 錯誤）。 */
  private failures: Record<number, string> = {}
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  /** 序列化操作，避免 undo 與 apply 交錯。 */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: DocDeps) {}

  /** 執行新操作並記入 journal（會截斷 redo 尾巴）。 */
  apply(draft: JournalOp): Promise<ApplyOpResult | null> {
    return this.enqueue(async () => {
      const kernel = this.deps.kernel()
      if (!kernel) return null
      const applied = await kernel.applyOp(draft)
      this.entries = [
        ...this.entries.slice(0, this.cursor),
        { label: opLabel(applied.op, (id) => this.nameOf(id)), op: applied.op },
      ]
      this.failures = Object.fromEntries(
        Object.entries(this.failures).filter(([i]) => Number(i) < this.cursor),
      )
      this.cursor = this.entries.length
      this.applyEffects(applied)
      this.syncJournalUi()
      this.scheduleSave()
      return applied
    })
  }

  undo(): Promise<void> {
    return this.enqueue(async () => {
      if (this.cursor === 0) return
      this.cursor--
      try {
        await this.rebuild()
      } catch (e) {
        // kernel 層級失敗（如崩潰）：游標還原，避免 journal 與場景脫鉤
        this.cursor++
        throw e
      }
      this.syncJournalUi()
      this.scheduleSave()
    })
  }

  redo(): Promise<void> {
    return this.enqueue(async () => {
      const kernel = this.deps.kernel()
      if (!kernel || this.cursor >= this.entries.length) return
      // 失敗時 applyOp 拋錯、游標不前進——kernel 狀態未變，保持一致
      const applied = await kernel.applyOp(this.entries[this.cursor].op)
      this.cursor++
      this.applyEffects(applied)
      this.syncJournalUi()
      this.scheduleSave()
    })
  }

  /** kernel 崩潰重啟後呼叫：以記憶體中的 journal 全量重放還原場景。 */
  recover(): Promise<void> {
    return this.enqueue(async () => {
      await this.rebuild()
      this.syncJournalUi()
    })
  }

  /** 開檔：讀存檔並重放到 cursor。 */
  load(): Promise<void> {
    return this.enqueue(async () => {
      const doc = await loadDocument()
      if (!doc || doc.entries.length === 0) return
      this.entries = doc.entries
      this.cursor = doc.cursor
      await this.rebuild()
      this.syncJournalUi()
    })
  }

  canUndo(): boolean {
    return this.cursor > 0
  }

  canRedo(): boolean {
    return this.cursor < this.entries.length
  }

  private async rebuild(): Promise<void> {
    const kernel = this.deps.kernel()
    if (!kernel) return
    const ops = this.entries.slice(0, this.cursor).map((e) => e.op)
    const replayed = await kernel.replayJournal(ops)
    this.failures = Object.fromEntries(replayed.failed.map((f) => [f.index, f.error]))
    if (replayed.failed.length > 0) {
      console.warn('[doc] 重放時略過失敗的操作：', replayed.failed)
    }
    // 名稱只算成功套用的 op，避免失敗的建立 op 留下幽靈名稱
    const names = aliveBodyNames(ops.filter((_, i) => !(i in this.failures)))
    const store = useAppStore.getState()
    this.deps.viewport()?.setAllBodies(replayed.bodies)
    store.clearSelection()
    useAppStore.setState({
      bodies: replayed.bodies.map((b) => ({
        bodyId: b.bodyId,
        name: names.get(b.bodyId) ?? `主體 ${b.bodyId}`,
        visible: true,
      })),
      extrudableRegionCount: 0,
    })
  }

  /** 把單一 op 的結果同步到場景與 store。 */
  private applyEffects(applied: ApplyOpResult): void {
    const viewport = this.deps.viewport()
    const store = useAppStore.getState()
    if (applied.op.kind === 'transform') {
      viewport?.discardSketchesOnBody(applied.op.bodyId)
    }
    for (const removedId of applied.removed) {
      viewport?.discardSketchesOnBody(removedId)
      viewport?.removeBody(removedId)
      store.removeBody(removedId)
    }
    for (const body of applied.updated) {
      this.upsertBody(body)
    }
  }

  private upsertBody(body: BodyMeshResult): void {
    const viewport = this.deps.viewport()
    const store = useAppStore.getState()
    const exists = store.bodies.some((b) => b.bodyId === body.bodyId)
    if (exists) {
      viewport?.replaceBodyMesh(body.bodyId, body.mesh)
      // 內容改變 → 舊拓撲選取失效
      store.replaceSelection(
        store.selection.filter((s) => s.bodyId !== body.bodyId),
      )
    } else {
      viewport?.addBody(body.bodyId, body.mesh)
      const names = aliveBodyNames(this.entries.slice(0, this.cursor).map((e) => e.op))
      store.addBody({
        bodyId: body.bodyId,
        name: names.get(body.bodyId) ?? `主體 ${body.bodyId}`,
        visible: true,
      })
    }
  }

  private nameOf(bodyId: number): string {
    return (
      useAppStore.getState().bodies.find((b) => b.bodyId === bodyId)?.name ??
      `主體 ${bodyId}`
    )
  }

  private syncJournalUi(): void {
    useAppStore.getState().setJournal(
      this.entries.map((e) => e.label),
      this.cursor,
      this.failures,
    )
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const doc: DocumentFile = {
        version: 1,
        entries: this.entries,
        cursor: this.cursor,
      }
      void saveDocument(doc)
    }, AUTOSAVE_DELAY_MS)
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => undefined)
    return next
  }
}
