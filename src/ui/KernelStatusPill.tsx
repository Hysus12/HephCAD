import { useAppStore } from '../state/appStore.ts'

/** 幾何核心（OCCT wasm）載入狀態。ready 之後整顆消失。 */
export function KernelStatusPill() {
  const status = useAppStore((s) => s.kernelStatus)
  const error = useAppStore((s) => s.kernelError)

  if (status === 'ready') return null

  return (
    <div className={`kernel-pill ${status === 'error' ? 'kernel-pill-error' : ''}`}>
      {status === 'loading' ? (
        <>
          <span className="kernel-spinner" />
          幾何核心載入中…
        </>
      ) : (
        <>幾何核心載入失敗：{error}</>
      )}
    </div>
  )
}
