import { useEffect } from 'react'
import { useAppStore } from '../state/appStore.ts'

const TOAST_MS = 3200

/** 底部短暫提示（偵測到筆、曲面不能畫、操作失敗…）。 */
export function Toast() {
  const toast = useAppStore((s) => s.toast)
  const dismiss = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(dismiss, TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className="toast" key={toast.id} role="status" onClick={dismiss}>
      {toast.text}
    </div>
  )
}
