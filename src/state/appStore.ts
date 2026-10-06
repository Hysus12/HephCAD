import { create } from 'zustand'
import type { KernelStatus } from '../kernel/KernelClient.ts'
import type { BoolMode } from '../doc/journal.ts'
import type { ToolKind } from '../sketch/tools.ts'

export interface BodyEntry {
  bodyId: number
  name: string
  visible: boolean
}

export interface SketchEntry {
  sketchId: number
  name: string
  visible: boolean
  curveCount: number
}

/** 'select' = 選取/轉視角；其餘是草圖工具（筆一落下就畫，不需要進入任何模式）。 */
export type ActiveTool = 'select' | ToolKind

export type BodySelection = {
  kind: 'body' | 'face' | 'edge'
  bodyId: number
  /** face/edge 的拓撲索引；body 選取固定為 0。 */
  topoId: number
}

export type SketchSelection =
  | { kind: 'curve'; sketchId: number; curveId: number }
  | { kind: 'region'; sketchId: number; regionIndex: number }

export type SelectionItem = BodySelection | SketchSelection

export function isBodySelection(item: SelectionItem): item is BodySelection {
  return item.kind === 'body' || item.kind === 'face' || item.kind === 'edge'
}

export function selectionKey(item: SelectionItem): string {
  switch (item.kind) {
    case 'curve':
      return `s${item.sketchId}:curve:${item.curveId}`
    case 'region':
      return `s${item.sketchId}:region:${item.regionIndex}`
    default:
      return `${item.bodyId}:${item.kind}:${item.topoId}`
  }
}

/** 拖曳中/剛完成的尺寸標籤（螢幕座標）。editable 時點擊可輸入精確數值。 */
export interface DimensionLabel {
  text: string
  x: number
  y: number
  editable: boolean
  value: number
  /** 主數值的單位（鍵盤顯示用），預設 mm；旋轉是 °。 */
  unit?: string
  /** 第二個可點的參數（倒角角度）。 */
  secondary?: { text: string; value: number; unit: string; editable: boolean }
}

/**
 * App 層 UI 狀態。文件/幾何狀態在 DocumentController（journal），
 * 這裡只放畫面需要的投影。
 */
export interface AppState {
  /** 網格間距（mm），右上角 chip 顯示用。 */
  gridSpacingMm: number
  snapEnabled: boolean
  toggleSnap: () => void

  /** 剖面視圖（移除朝向相機的一半）。 */
  sectionActive: boolean
  toggleSection: () => void

  kernelStatus: KernelStatus
  kernelError: string | null
  setKernelStatus: (status: KernelStatus, detail?: string) => void

  /** 場景中的 body 清單（項目面板）。 */
  bodies: BodyEntry[]
  addBody: (body: BodyEntry) => void
  removeBody: (bodyId: number) => void
  setBodyVisible: (bodyId: number, visible: boolean) => void

  /** 文件中的草圖（由 journal 推導；顯示/隱藏是本地視圖狀態，跨推導保留）。 */
  sketches: SketchEntry[]
  setSketches: (list: Omit<SketchEntry, 'visible'>[]) => void
  setSketchVisible: (sketchId: number, visible: boolean) => void

  /** 目前選取（tap 累加/再點取消；點空白清空）。 */
  selection: SelectionItem[]
  toggleSelection: (item: SelectionItem) => void
  replaceSelection: (items: SelectionItem[]) => void
  clearSelection: () => void

  /** 情境操作模式（依選取出現：移動/抽殼）。選取變更即重置。邊的圓角/倒角不需模式（選了邊就有雙向箭頭）。 */
  toolMode: 'move' | 'shell' | null
  setToolMode: (mode: AppState['toolMode']) => void

  activeTool: ActiveTool
  /** 使用者是否親自選過工具（還沒選過時，偵測到筆會自動切到直線）。 */
  toolChosen: boolean
  setActiveTool: (tool: ActiveTool, explicit?: boolean) => void

  /** 偵測到 Apple Pencil 後：筆畫圖、手指只轉視角。 */
  pencilDetected: boolean
  setPencilDetected: () => void

  dimension: DimensionLabel | null
  setDimension: (label: DimensionLabel | null) => void
  /** 數字鍵盤正在編輯哪個欄位（null = 關閉）。 */
  keypad: 'primary' | 'secondary' | null
  setKeypad: (target: 'primary' | 'secondary' | null) => void

  /** 擠出後的布林徽章（聯集/新本體/減去/交集）；mode 是目前生效的那個。 */
  boolBadge: { mode: BoolMode } | null
  setBoolBadge: (badge: { mode: BoolMode } | null) => void
  /** 拷貝徽章（Shapr3D）：開啟時移動/旋轉的是副本，原本體不動。 */
  copyMode: boolean
  toggleCopyMode: () => void
  /** 獨立布林是否保留原本體（結果成為新本體）。 */
  keepOriginals: boolean
  toggleKeepOriginals: () => void

  /** 拖曳倒角時使用的角度（度）；預設 45＝兩側等距。 */
  chamferAngleDeg: number
  setChamferAngle: (deg: number) => void

  toast: { text: string; id: number } | null
  showToast: (text: string) => void
  dismissToast: () => void

  historyOpen: boolean
  toggleHistory: () => void

  /** 歷程面板：journal 標籤與游標（cursor 之後的是可 redo 的灰色項）。 */
  journalLabels: string[]
  journalCursor: number
  /** 重放時失敗、被略過的 journal 項目（索引 → 錯誤訊息）。 */
  journalFailures: Record<number, string>
  setJournal: (
    labels: string[],
    cursor: number,
    failures: Record<number, string>,
  ) => void
}

let toastSeq = 0

export const useAppStore = create<AppState>()((set) => ({
  gridSpacingMm: 5,
  snapEnabled: true,
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  sectionActive: false,
  toggleSection: () => set((s) => ({ sectionActive: !s.sectionActive })),

  kernelStatus: 'loading',
  kernelError: null,
  setKernelStatus: (status, detail) =>
    set({ kernelStatus: status, kernelError: status === 'error' ? (detail ?? '未知錯誤') : null }),

  bodies: [],
  addBody: (body) => set((s) => ({ bodies: [...s.bodies, body] })),
  removeBody: (bodyId) =>
    set((s) => ({
      bodies: s.bodies.filter((b) => b.bodyId !== bodyId),
      selection: s.selection.filter((item) => !isBodySelection(item) || item.bodyId !== bodyId),
    })),
  setBodyVisible: (bodyId, visible) =>
    set((s) => ({
      bodies: s.bodies.map((b) => (b.bodyId === bodyId ? { ...b, visible } : b)),
    })),

  sketches: [],
  setSketches: (list) =>
    set((s) => {
      const visibility = new Map(s.sketches.map((e) => [e.sketchId, e.visible]))
      const alive = new Set(list.map((e) => e.sketchId))
      return {
        sketches: list.map((e) => ({ ...e, visible: visibility.get(e.sketchId) ?? true })),
        // 草圖內容變動後，舊的區域索引不再可靠；消失的草圖連同選取一起移除
        selection: s.selection.filter((item) => isBodySelection(item) || alive.has(item.sketchId)),
      }
    }),
  setSketchVisible: (sketchId, visible) =>
    set((s) => ({
      sketches: s.sketches.map((e) => (e.sketchId === sketchId ? { ...e, visible } : e)),
    })),

  selection: [],
  toggleSelection: (item) =>
    set((s) => {
      const key = selectionKey(item)
      const exists = s.selection.some((i) => selectionKey(i) === key)
      return {
        selection: exists
          ? s.selection.filter((i) => selectionKey(i) !== key)
          : [...s.selection, item],
        toolMode: null,
      }
    }),
  replaceSelection: (items) => set({ selection: items, toolMode: null }),
  clearSelection: () => set({ selection: [], toolMode: null }),

  toolMode: null,
  setToolMode: (mode) => set({ toolMode: mode }),

  activeTool: 'select',
  toolChosen: false,
  setActiveTool: (tool, explicit = true) =>
    set((s) => ({ activeTool: tool, toolChosen: s.toolChosen || explicit })),

  pencilDetected: false,
  setPencilDetected: () =>
    set((s) =>
      s.pencilDetected
        ? {}
        : {
            pencilDetected: true,
            // 第一次拿起筆、且使用者還沒選過工具：直接進入直線工具（Shapr3D 的預設）
            activeTool: s.toolChosen ? s.activeTool : 'line',
          },
    ),

  dimension: null,
  setDimension: (label) => set({ dimension: label }),
  keypad: null,
  setKeypad: (target) => set({ keypad: target }),

  boolBadge: null,
  setBoolBadge: (badge) => set({ boolBadge: badge }),
  copyMode: false,
  toggleCopyMode: () => set((s) => ({ copyMode: !s.copyMode })),
  keepOriginals: false,
  toggleKeepOriginals: () => set((s) => ({ keepOriginals: !s.keepOriginals })),

  chamferAngleDeg: 45,
  setChamferAngle: (deg) => set({ chamferAngleDeg: deg }),

  toast: null,
  showToast: (text) => set({ toast: { text, id: ++toastSeq } }),
  dismissToast: () => set({ toast: null }),

  historyOpen: false,
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),

  journalLabels: [],
  journalCursor: 0,
  journalFailures: {},
  setJournal: (labels, cursor, failures) =>
    set({ journalLabels: labels, journalCursor: cursor, journalFailures: failures }),
}))
