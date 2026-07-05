import { create } from 'zustand'
import type { KernelStatus } from '../kernel/KernelClient.ts'
import type { ToolKind } from '../sketch/tools.ts'

export interface BodyEntry {
  bodyId: number
  name: string
  visible: boolean
}

export type SelectionKind = 'body' | 'face' | 'edge'

export interface SelectionItem {
  bodyId: number
  kind: SelectionKind
  /** face/edge 的拓撲索引；body 選取固定為 0。 */
  topoId: number
}

export function selectionKey(item: SelectionItem): string {
  return `${item.bodyId}:${item.kind}:${item.topoId}`
}

/**
 * App 層 UI 狀態。文件/幾何狀態（M5 的 journal）之後獨立成 document store，
 * 不要混進來。
 */
export interface AppState {
  /** 網格間距（mm），右上角 chip 顯示用。 */
  gridSpacingMm: number
  snapEnabled: boolean
  toggleSnap: () => void

  kernelStatus: KernelStatus
  kernelError: string | null
  setKernelStatus: (status: KernelStatus, detail?: string) => void

  /** 場景中的 body 清單（項目面板）。 */
  bodies: BodyEntry[]
  addBody: (body: BodyEntry) => void
  removeBody: (bodyId: number) => void
  setBodyVisible: (bodyId: number, visible: boolean) => void

  /** 目前選取（tap 累加/再點取消；點空白清空）。 */
  selection: SelectionItem[]
  toggleSelection: (item: SelectionItem) => void
  replaceSelection: (items: SelectionItem[]) => void
  clearSelection: () => void

  /** 草圖模式。 */
  sketchActive: boolean
  sketchTool: ToolKind
  sketchRegionCount: number
  setSketchActive: (active: boolean) => void
  setSketchTool: (tool: ToolKind) => void
  setSketchRegionCount: (count: number) => void
}

export const useAppStore = create<AppState>()((set) => ({
  gridSpacingMm: 5,
  snapEnabled: true,
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  kernelStatus: 'loading',
  kernelError: null,
  setKernelStatus: (status, detail) =>
    set({ kernelStatus: status, kernelError: status === 'error' ? (detail ?? '未知錯誤') : null }),

  bodies: [],
  addBody: (body) => set((s) => ({ bodies: [...s.bodies, body] })),
  removeBody: (bodyId) =>
    set((s) => ({
      bodies: s.bodies.filter((b) => b.bodyId !== bodyId),
      selection: s.selection.filter((item) => item.bodyId !== bodyId),
    })),
  setBodyVisible: (bodyId, visible) =>
    set((s) => ({
      bodies: s.bodies.map((b) => (b.bodyId === bodyId ? { ...b, visible } : b)),
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
      }
    }),
  replaceSelection: (items) => set({ selection: items }),
  clearSelection: () => set({ selection: [] }),

  sketchActive: false,
  sketchTool: 'line',
  sketchRegionCount: 0,
  setSketchActive: (active) =>
    set(active ? { sketchActive: true } : { sketchActive: false, sketchRegionCount: 0, sketchTool: 'line' }),
  setSketchTool: (tool) => set({ sketchTool: tool }),
  setSketchRegionCount: (count) => set({ sketchRegionCount: count }),
}))
