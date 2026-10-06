// Viewport 與文件層之間的接線：Viewport 只知道 ViewportHost 介面，
// 這裡用 DocumentController 實作它，並提供 UI/鍵盤用的選取動作。

import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import { resizeCurve } from '../sketch/dimensions.ts'
import { resizeLineConnected } from '../sketch/edit.ts'
import type { ToolKind } from '../sketch/tools.ts'
import { isBodySelection, useAppStore, type ActiveTool } from '../state/appStore.ts'
import type { ViewportHost } from '../viewport/Viewport.ts'
import { documentController, services } from './services.ts'

export function createViewportHost(): ViewportHost {
  return {
    kernel: () => services.kernel,
    commit: (op) => documentController.apply(op),
    amend: (op) => documentController.amendLast(op),
    async commitSketch(plane: SketchPlane, hostBodyId: number | null, curves: SketchCurve[], tool: ToolKind) {
      const { sketchId, nextCurveId } = documentController.sketchFor(plane, hostBodyId)
      await documentController.apply({
        kind: 'sketch',
        sketchId,
        plane,
        hostBodyId,
        add: curves.map((c, i) => ({ ...c, id: nextCurveId + i })),
        remove: [],
        tool,
      })
    },
    async resizeLastSketchCurve(value: number) {
      const last = documentController.lastOp()
      if (!last || last.kind !== 'sketch' || last.add.length === 0) return
      const target = last.add[last.add.length - 1]
      const resized = resizeCurve(target, value)
      if (!resized) return
      await documentController.amendLast({
        ...last,
        add: last.add.map((c) => (c === target ? resized : c)),
      })
    },
    async resizeSketchCurve(sketchId: number, curveId: number, value: number) {
      const sketch = documentController.sketches().get(sketchId)
      const curve = sketch?.curves.find((c) => c.id === curveId)
      if (!sketch || !curve) return
      // 直線：相接的線跟著動（矩形改一邊仍是矩形）；圓：直接改半徑
      const changed =
        curve.kind === 'line'
          ? resizeLineConnected(sketch.curves, curveId, value)
          : (() => {
              const r = resizeCurve(curve, value)
              return r ? [r] : null
            })()
      if (!changed || changed.length === 0) return
      await documentController.apply({
        kind: 'sketch',
        sketchId,
        plane: sketch.plane,
        hostBodyId: sketch.hostBodyId,
        // 同 id 先移除再加入：選取與標籤都不會失效
        remove: changed.map((c) => c.id),
        add: changed,
      })
    },
    nextFolderId: () => documentController.nextFolderId(),
    nextPlaneId: () => documentController.nextPlaneId(),
    undo: () => void documentController.undo(),
    redo: () => void documentController.redo(),
  }
}

export function selectTool(tool: ActiveTool): void {
  useAppStore.getState().setActiveTool(tool)
}

/** 刪除選取：草圖線（依草圖分組成一筆 op）與整個主體；面/邊不能單獨刪。 */
export async function deleteSelection(): Promise<void> {
  const store = useAppStore.getState()
  const { selection } = store
  if (selection.length === 0) return

  const curvesBySketch = new Map<number, number[]>()
  for (const item of selection) {
    if (item.kind === 'curve') {
      curvesBySketch.set(item.sketchId, [...(curvesBySketch.get(item.sketchId) ?? []), item.curveId])
    }
  }
  const sketches = documentController.sketches()
  for (const [sketchId, curveIds] of curvesBySketch) {
    const sketch = sketches.get(sketchId)
    if (!sketch) continue
    await documentController.apply({
      kind: 'sketch',
      sketchId,
      plane: sketch.plane,
      hostBodyId: sketch.hostBodyId,
      add: [],
      remove: curveIds,
    })
  }

  const bodyIds = selection.filter(isBodySelection).filter((i) => i.kind === 'body').map((i) => i.bodyId)
  for (const bodyId of bodyIds) await documentController.apply({ kind: 'deleteBody', bodyId })

  if (curvesBySketch.size === 0 && bodyIds.length === 0) {
    store.showToast('雙擊選取整個主體後才能刪除')
  }
  store.clearSelection()
}

/** 刪除整張草圖（項目面板）。 */
export async function deleteSketch(sketchId: number): Promise<void> {
  const sketch = documentController.sketches().get(sketchId)
  if (!sketch) return
  await documentController.apply({
    kind: 'sketch',
    sketchId,
    plane: sketch.plane,
    hostBodyId: sketch.hostBodyId,
    add: [],
    remove: sketch.curves.map((c) => c.id),
  })
}
