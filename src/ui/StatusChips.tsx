import { useAppStore } from '../state/appStore.ts'

/** 右上角狀態群：吸附開關與網格間距（對應 Shapr3D 的磁鐵 + 單位 chip）。 */
export function StatusChips() {
  const gridSpacingMm = useAppStore((s) => s.gridSpacingMm)
  const snapEnabled = useAppStore((s) => s.snapEnabled)
  const toggleSnap = useAppStore((s) => s.toggleSnap)
  const sectionActive = useAppStore((s) => s.sectionActive)
  const toggleSection = useAppStore((s) => s.toggleSection)

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
      <button
        className={`chip-button ${sectionActive ? 'chip-active' : ''}`}
        onClick={toggleSection}
        title={sectionActive ? '剖面視圖：開' : '剖面視圖：關'}
        aria-label="剖面視圖"
        aria-pressed={sectionActive}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
          <path d="M4 7.5 L20 16.5" strokeDasharray="2.5 2.5" />
        </svg>
      </button>
    </div>
  )
}
