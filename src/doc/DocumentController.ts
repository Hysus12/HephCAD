// 文件控制器：所有幾何與草圖變更的唯一入口。
// apply → kernel 執行 → 場景/store 同步 → journal 記錄 → 自動存檔。
// undo = 截斷重放、redo = 重執行下一筆、recover = kernel 崩潰重啟後全量重放、
// amendLast = 以新參數取代最後一筆（拖曳後點尺寸輸入精確值）。
// 重放中失敗的 op 會被略過並標記（journalFailures），文件其餘部分照常還原。
// 草圖不在 kernel：每次文件變動後由 journal 推導（deriveSketches）再同步到 viewport。

import type { KernelClient } from '../kernel/KernelClient.ts'
import type { ApplyOpResult, BodyMeshResult } from '../kernel/protocol.ts'
import type { SketchPlane } from '../sketch/model.ts'
import { isBodySelection, useAppStore } from '../state/appStore.ts'
import type { Viewport } from '../viewport/Viewport.ts'
import {
  aliveBodyNames,
  opLabel,
  type DocumentFile,
  type JournalEntry,
  type JournalOp,
} from './journal.ts'
import { loadDocument, saveDocument } from './persistence.ts'
import {
  deriveSketches,
  findSketchOnPlane,
  nextSketchId,
  type SketchEntity,
} from './sketches.ts'

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
  private sketchCache: Map<number, SketchEntity> = new Map()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  /** 序列化操作，避免 undo 與 apply 交錯。 */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: DocDeps) {}

  /** 執行新操作並記入 journal（會截斷 redo 尾巴）。 */
  apply(draft: JournalOp): Promise<ApplyOpResult | null> {
    return this.enqueue(() => this.applyNow(draft))
  }

  /**
   * 以新參數取代最後一筆操作（例如擠出 20mm 後輸入 25）。
   * 新參數失敗時恢復原本那筆，文件不會少一步。
   */
  amendLast(draft: JournalOp): Promise<ApplyOpResult | null> {
    return this.enqueue(async () => {
      if (this.cursor === 0) return null
      const original = this.entries[this.cursor - 1]
      this.entries = this.entries.slice(0, this.cursor - 1)
      this.cursor = this.entries.length
      await this.rebuild()
      try {
        return await this.applyNow(draft)
      } catch (e) {
        await this.applyNow(original.op)
        throw e
      }
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

  /** 目前（游標位置）的草圖實體。 */
  sketches(): Map<number, SketchEntity> {
    return this.sketchCache
  }

  /** 新畫的線該放進哪張草圖：同平面同宿主的既有草圖，否則新建。 */
  sketchFor(plane: SketchPlane, hostBodyId: number | null): { sketchId: number; nextCurveId: number } {
    const existing = findSketchOnPlane(this.sketchCache, plane, hostBodyId)
    if (existing) return { sketchId: existing.sketchId, nextCurveId: existing.maxCurveId + 1 }
    return { sketchId: nextSketchId(this.activeOps()), nextCurveId: 1 }
  }

  /** 最後一筆（游標前）的 op——數字修正用。 */
  lastOp(): JournalOp | null {
    return this.cursor > 0 ? this.entries[this.cursor - 1].op : null
  }

  // ---- 內部 ----

  private async applyNow(draft: JournalOp): Promise<ApplyOpResult | null> {
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
  }

  private activeOps(): JournalOp[] {
    return this.entries.slice(0, this.cursor).map((e) => e.op)
  }

  private async rebuild(): Promise<void> {
    const kernel = this.deps.kernel()
    if (!kernel) return
    const ops = this.activeOps()
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
    })
    this.syncSketches()
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
    if (applied.op.kind === 'sketch' || applied.op.kind === 'extrude') this.syncSketches()
  }

  private upsertBody(body: BodyMeshResult): void {
    const viewport = this.deps.viewport()
    const store = useAppStore.getState()
    const exists = store.bodies.some((b) => b.bodyId === body.bodyId)
    if (exists) {
      viewport?.replaceBodyMesh(body.bodyId, body.mesh)
      // 內容改變 → 舊拓撲選取失效
      store.replaceSelection(
        store.selection.filter((s) => !isBodySelection(s) || s.bodyId !== body.bodyId),
      )
    } else {
      viewport?.addBody(body.bodyId, body.mesh)
      const names = aliveBodyNames(this.activeOps())
      store.addBody({
        bodyId: body.bodyId,
        name: names.get(body.bodyId) ?? `主體 ${body.bodyId}`,
        visible: true,
      })
    }
  }

  private syncSketches(): void {
    this.sketchCache = deriveSketches(
      this.activeOps().filter((_, i) => !(i in this.failures)),
    )
    useAppStore.getState().setSketches(
      [...this.sketchCache.values()].map((s) => ({
        sketchId: s.sketchId,
        name: `草圖 ${s.sketchId}`,
        curveCount: s.curves.length,
      })),
    )
    this.deps.viewport()?.syncSketches(this.sketchCache)
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
