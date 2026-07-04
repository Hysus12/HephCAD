import { useAppStore } from '../state/appStore.ts'
import { services } from './services.ts'

/** 從 kernel、場景、store 三處一致地移除 body。 */
export async function deleteBody(bodyId: number): Promise<void> {
  const { kernel, viewport } = services
  viewport?.removeBody(bodyId)
  useAppStore.getState().removeBody(bodyId)
  await kernel?.deleteBody(bodyId)
}

export function toggleBodyVisibility(bodyId: number): void {
  const store = useAppStore.getState()
  const entry = store.bodies.find((b) => b.bodyId === bodyId)
  if (entry) store.setBodyVisible(bodyId, !entry.visible)
}
