import { useEffect } from 'react'
import { documentController, services } from './app/services.ts'
import { deleteSelection, selectTool } from './app/viewportHost.ts'
import { KernelClient } from './kernel/KernelClient.ts'
import { useAppStore, type ActiveTool } from './state/appStore.ts'
import { AppearancePanel } from './ui/AppearancePanel.tsx'
import { BooleanBadge } from './ui/BooleanBadge.tsx'
import { ContextBar } from './ui/ContextBar.tsx'
import { DimensionOverlay } from './ui/DimensionOverlay.tsx'
import { HistoryPanel } from './ui/HistoryPanel.tsx'
import { ItemsPanel } from './ui/ItemsPanel.tsx'
import { KernelStatusPill } from './ui/KernelStatusPill.tsx'
import { StatusChips } from './ui/StatusChips.tsx'
import { Toast } from './ui/Toast.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { UndoBar } from './ui/UndoBar.tsx'
import { ViewportCanvas } from './ui/ViewportCanvas.tsx'

/** 鍵盤工具快捷鍵（Shapr3D / 常見 CAD 慣例）。 */
const TOOL_KEYS: Record<string, ActiveTool> = {
  v: 'select',
  l: 'line',
  a: 'arc',
  r: 'rect',
  c: 'circle',
}

export function App() {
  useEffect(() => {
    let loaded = false
    const kernel = new KernelClient({
      onStatus: (status, detail) => {
        useAppStore.getState().setKernelStatus(status, detail)
        // 首次就緒：恢復上次的文件（OPFS 自動存檔）
        if (status === 'ready' && !loaded) {
          loaded = true
          void documentController.load()
        }
      },
      // 崩潰重啟後以記憶體中的 journal 還原（比存檔新，不能重讀存檔）
      onRestarted: () => void documentController.recover(),
    })
    services.kernel = kernel
    return () => {
      if (services.kernel === kernel) services.kernel = null
      kernel.dispose()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const store = useAppStore.getState()
      if (store.keypad) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) void documentController.redo()
        else void documentController.undo()
        return
      }
      if (mod || e.altKey) return
      if (key === 'escape') {
        services.viewport?.cancelInteraction()
        store.clearSelection()
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        void deleteSelection()
      } else if (TOOL_KEYS[key]) {
        selectTool(TOOL_KEYS[key])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <ViewportCanvas />
      <ItemsPanel />
      <UndoBar />
      <HistoryPanel />
      <Toolbar />
      <StatusChips />
      <KernelStatusPill />
      <ContextBar />
      <DimensionOverlay />
      <BooleanBadge />
      <AppearanceHost />
      <Toast />
    </div>
  )
}

/** 情境列的「外觀」按下後才顯示面板。 */
function AppearanceHost() {
  const open = useAppStore((s) => s.appearanceOpen)
  return open ? <AppearancePanel /> : null
}
