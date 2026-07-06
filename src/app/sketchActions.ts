import { GROUND_PLANE } from '../sketch/model.ts'
import type { ToolKind } from '../sketch/tools.ts'
import { useAppStore } from '../state/appStore.ts'
import { services } from './services.ts'

/**
 * 進入草圖模式：有選取平面 face 就畫在上面，否則畫在地面（XY）。
 * 選到非平面 face 時 fallback 地面（之後再做提示 UI）。
 */
export async function enterSketchMode(): Promise<void> {
  const { viewport, kernel } = services
  if (!viewport || !kernel) return
  const store = useAppStore.getState()

  let plane = GROUND_PLANE
  let hostBodyId: number | null = null
  const faceSel = store.selection.find((item) => item.kind === 'face')
  if (faceSel) {
    const facePlane = await kernel.facePlane(faceSel.bodyId, faceSel.topoId)
    if (facePlane) {
      plane = facePlane
      hostBodyId = faceSel.bodyId
    }
  }

  store.clearSelection()
  viewport.enterSketch(plane, kernel, hostBodyId)
  store.setSketchActive(true)
  store.setSketchTool('line')
}

export async function finishSketch(): Promise<void> {
  await services.viewport?.exitSketch(true)
  useAppStore.getState().setSketchActive(false)
}

export async function cancelSketch(): Promise<void> {
  await services.viewport?.exitSketch(false)
  useAppStore.getState().setSketchActive(false)
}

export function selectSketchTool(tool: ToolKind): void {
  useAppStore.getState().setSketchTool(tool)
  services.viewport?.setSketchTool(tool)
}
