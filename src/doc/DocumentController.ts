// 文件控制器：所有幾何變更的唯一入口。
// apply → kernel 執行 → 場景/store 同步 → journal 記錄 → 自動存檔。
// undo = 截斷重放、redo = 重執行下一筆。

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
      await this.rebuild()
      this.syncJournalUi()
      this.scheduleSave()
    })
  }

  redo(): Promise<void> {
    return this.enqueue(async () => {
      const kernel = this.deps.kernel()
      if (!kernel || this.cursor >= this.entries.length) return
      const applied = await kernel.applyOp(this.entries[this.cursor].op)
      this.cursor++
      this.applyEffects(applied)
      this.syncJournalUi()
      this.scheduleSave()
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
    const names = aliveBodyNames(ops)
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
    for (const removedId of applied.removed) {
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
