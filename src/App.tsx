import { useEffect } from 'react'
import { documentController, services } from './app/services.ts'
import { KernelClient } from './kernel/KernelClient.ts'
import { useAppStore } from './state/appStore.ts'
import { ContextBar } from './ui/ContextBar.tsx'
import { ExtrudeHint } from './ui/ExtrudeHint.tsx'
import { HistoryPanel } from './ui/HistoryPanel.tsx'
import { ItemsPanel } from './ui/ItemsPanel.tsx'
import { KernelStatusPill } from './ui/KernelStatusPill.tsx'
import { StatusChips } from './ui/StatusChips.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { ViewportCanvas } from './ui/ViewportCanvas.tsx'

export function App() {
  useEffect(() => {
    const kernel = new KernelClient((status, detail) => {
      useAppStore.getState().setKernelStatus(status, detail)
      // kernel 就緒後恢復上次的文件（OPFS 自動存檔）
      if (status === 'ready') void documentController.load()
    })
    services.kernel = kernel
    return () => {
      if (services.kernel === kernel) services.kernel = null
      kernel.dispose()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) void documentController.redo()
      else void documentController.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <ViewportCanvas />
      <ItemsPanel />
      <HistoryPanel />
      <Toolbar />
      <StatusChips />
      <KernelStatusPill />
      <ExtrudeHint />
      <ContextBar />
    </div>
  )
}
