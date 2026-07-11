import { useAppStore } from '../state/appStore.ts'
import { documentController, services } from './services.ts'

/** 刪除 body（經 journal，可 undo）。 */
export async function deleteBody(bodyId: number): Promise<void> {
  await documentController.apply({ kind: 'deleteBody', bodyId })
}

export function toggleBodyVisibility(bodyId: number): void {
  const store = useAppStore.getState()
  const entry = store.bodies.find((b) => b.bodyId === bodyId)
  if (entry) store.setBodyVisible(bodyId, !entry.visible)
}

/** 匯入 STEP 檔（經 journal，可 undo）。 */
export async function importStepFile(file: File): Promise<void> {
  const data = await file.text()
  await documentController.apply({
    kind: 'importStep',
    bodyId: 0,
    name: file.name.replace(/\.(step|stp)$/i, ''),
    data,
  })
}

/** 匯出所有 body 成 STEP 並觸發下載。 */
export async function exportStep(): Promise<void> {
  const { kernel } = services
  const bodies = useAppStore.getState().bodies
  if (!kernel || bodies.length === 0) return
  const text = await kernel.exportStep(bodies.map((b) => b.bodyId))
  const blob = new Blob([text], { type: 'application/step' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'hephcad.step'
  a.click()
  URL.revokeObjectURL(url)
}
