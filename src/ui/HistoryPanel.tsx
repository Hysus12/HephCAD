import { documentController } from '../app/services.ts'
import { useAppStore } from '../state/appStore.ts'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** 右側歷程記錄面板：journal 清單 + undo/redo。cursor 之後的項目為可 redo（灰色）。 */
export function HistoryPanel() {
  const labels = useAppStore((s) => s.journalLabels)
  const cursor = useAppStore((s) => s.journalCursor)
  const sketchActive = useAppStore((s) => s.sketchActive)

  if (labels.length === 0 || sketchActive) return null

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">歷程記錄</span>
        <button
          className="items-icon"
          title="復原"
          aria-label="復原"
          disabled={cursor === 0}
          onClick={() => void documentController.undo()}
        >
          <svg viewBox="0 0 24 24" {...stroke}>
            <path d="M9 7 L4 12 L9 17 M4 12 H15 A5 5 0 0 1 15 22 H12" />
          </svg>
        </button>
        <button
          className="items-icon"
          title="重做"
          aria-label="重做"
          disabled={cursor >= labels.length}
          onClick={() => void documentController.redo()}
        >
          <svg viewBox="0 0 24 24" {...stroke}>
            <path d="M15 7 L20 12 L15 17 M20 12 H9 A5 5 0 0 0 9 22 H12" />
          </svg>
        </button>
      </div>
      <div className="history-list">
        {labels.map((label, i) => (
          <div
            key={i}
            className={`history-row ${i >= cursor ? 'history-row-undone' : ''}`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
