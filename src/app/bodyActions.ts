import { BOOL_LABELS, type BoolMode } from '../doc/journal.ts'
import { isBodySelection, useAppStore } from '../state/appStore.ts'
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

/**
 * 獨立布林（Shapr3D 的 Union / Subtract / Intersect）：先選的本體是目標，其餘是工具體。
 * 需要本體重疊；「保留原本體」開啟時結果是新本體、原本體都留著。
 */
export async function applyBoolean(mode: Exclude<BoolMode, 'new'>): Promise<void> {
  const store = useAppStore.getState()
  const picked = store.selection.filter(isBodySelection).filter((i) => i.kind === 'body')
  if (picked.length < 2) return
  const [target, ...tools] = picked
  const nameOf = (id: number) => store.bodies.find((b) => b.bodyId === id)?.name ?? `主體 ${id}`
  try {
    await documentController.apply({
      kind: 'boolean',
      mode,
      targetId: target.bodyId,
      toolIds: tools.map((t) => t.bodyId),
      keepOriginals: store.keepOriginals,
      resultBodyId: 0,
      name: `${nameOf(target.bodyId)} ${BOOL_LABELS[mode]}`,
    })
    store.clearSelection()
  } catch (e) {
    store.showToast(`${BOOL_LABELS[mode]}失敗：${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 把本體收進新資料夾（經 journal，可 undo）。 */
export async function createFolder(bodyIds: number[]): Promise<void> {
  await documentController.apply({
    kind: 'folder',
    action: 'create',
    folderId: documentController.nextFolderId(),
    name: '資料夾',
    bodyIds,
  })
}

export async function renameFolder(folderId: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await documentController.apply({ kind: 'folder', action: 'rename', folderId, name: trimmed })
}

/** folderId 為 null＝移出資料夾。 */
export async function moveToFolder(bodyIds: number[], folderId: number | null): Promise<void> {
  await documentController.apply({ kind: 'folder', action: 'move', folderId, bodyIds })
}

/** 解散資料夾：本體留著，只是不再分組。 */
export async function ungroupFolder(folderId: number): Promise<void> {
  await documentController.apply({ kind: 'folder', action: 'delete', folderId })
}

/** 資料夾的眼睛：全顯示或全隱藏。 */
export function toggleFolderVisibility(bodyIds: number[]): void {
  const store = useAppStore.getState()
  const members = store.bodies.filter((b) => bodyIds.includes(b.bodyId))
  const show = members.some((b) => !b.visible)
  for (const b of members) store.setBodyVisible(b.bodyId, show)
}

/** 複製目前選取的 body（帶偏移，經 journal）。 */
export async function copySelectedBody(): Promise<void> {
  const store = useAppStore.getState()
  const bodySel = store.selection.filter(isBodySelection).find((i) => i.kind === 'body')
  if (!bodySel) return
  const source = store.bodies.find((b) => b.bodyId === bodySel.bodyId)
  await documentController.apply({
    kind: 'copyBody',
    sourceBodyId: bodySel.bodyId,
    bodyId: 0,
    name: `${source?.name ?? '主體'} 副本`,
    translation: [40, 40, 0],
  })
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
