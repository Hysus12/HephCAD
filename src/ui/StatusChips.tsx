import { useAppStore } from '../state/appStore.ts'

/** 右上角狀態群：吸附開關與網格間距（對應 Shapr3D 的磁鐵 + 單位 chip）。 */
export function StatusChips() {
  const gridSpacingMm = useAppStore((s) => s.gridSpacingMm)
  const snapEnabled = useAppStore((s) => s.snapEnabled)
  const toggleSnap = useAppStore((s) => s.toggleSnap)

  return (
    <div className="status-chips">
      <button
        className={`chip-button ${snapEnabled ? 'chip-active' : ''}`}
        onClick={toggleSnap}
        title={snapEnabled ? '吸附：開' : '吸附：關'}
        aria-label="吸附"
        aria-pressed={snapEnabled}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M7 4 v7 a5 5 0 0 0 10 0 V4" />
          <path d="M7 4 h3.5 M13.5 4 H17" />
          <path d="M7 8 h3.5 M13.5 8 H17" strokeWidth="2.4" />
        </svg>
      </button>
      <div className="chip-label">
        <span className="chip-value">{gridSpacingMm}</span>
        <span className="chip-unit">公釐</span>
      </div>
    </div>
  )
}
