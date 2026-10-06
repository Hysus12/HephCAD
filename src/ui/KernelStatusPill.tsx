import { useAppStore } from '../state/appStore.ts'

/** 幾何核心（OCCT wasm）狀態。ready 之後整顆消失。 */
export function KernelStatusPill() {
  const status = useAppStore((s) => s.kernelStatus)
  const error = useAppStore((s) => s.kernelError)

  if (status === 'ready') return null

  if (status === 'error') {
    return <div className="kernel-pill kernel-pill-error">幾何核心載入失敗：{error}</div>
  }

  return (
    <div className="kernel-pill">
      <span className="kernel-spinner" />
      {status === 'recovering' ? '幾何核心異常，正在重新啟動並還原模型…' : '幾何核心載入中…'}
    </div>
  )
}
