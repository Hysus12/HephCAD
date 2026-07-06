import { useEffect } from 'react'
import { services } from './app/services.ts'
import { KernelClient } from './kernel/KernelClient.ts'
import { useAppStore } from './state/appStore.ts'
import { ExtrudeHint } from './ui/ExtrudeHint.tsx'
import { ItemsPanel } from './ui/ItemsPanel.tsx'
import { KernelStatusPill } from './ui/KernelStatusPill.tsx'
import { StatusChips } from './ui/StatusChips.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { ViewportCanvas } from './ui/ViewportCanvas.tsx'

export function App() {
  useEffect(() => {
    const kernel = new KernelClient((status, detail) =>
      useAppStore.getState().setKernelStatus(status, detail),
    )
    services.kernel = kernel
    return () => {
      if (services.kernel === kernel) services.kernel = null
      kernel.dispose()
    }
  }, [])

  return (
    <div className="app">
      <ViewportCanvas />
      <ItemsPanel />
      <Toolbar />
      <StatusChips />
      <KernelStatusPill />
      <ExtrudeHint />
    </div>
  )
}
