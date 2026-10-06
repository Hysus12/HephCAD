import { documentController } from '../app/services.ts'
import { useAppStore } from '../state/appStore.ts'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * 常駐的復原/重做（觸控上也可兩指點擊復原、三指點擊重做）＋ 歷程面板開關。
 * 歷程面板預設收起，不佔畫面。
 */
export function UndoBar() {
  const cursor = useAppStore((s) => s.journalCursor)
  const total = useAppStore((s) => s.journalLabels.length)
  const historyOpen = useAppStore((s) => s.historyOpen)
  const toggleHistory = useAppStore((s) => s.toggleHistory)

  return (
    <div className="undo-bar">
      <button
        className="items-icon"
        title="復原（兩指點擊）"
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
        title="重做（三指點擊）"
        aria-label="重做"
        disabled={cursor >= total}
        onClick={() => void documentController.redo()}
      >
        <svg viewBox="0 0 24 24" {...stroke}>
          <path d="M15 7 L20 12 L15 17 M20 12 H9 A5 5 0 0 0 9 22 H12" />
        </svg>
      </button>
      <button
        className={`items-icon ${historyOpen ? 'items-icon-active' : ''}`}
        title="歷程記錄"
        aria-label="歷程記錄"
        aria-pressed={historyOpen}
        disabled={total === 0}
        onClick={toggleHistory}
      >
        <svg viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5 V12 L15 14" />
        </svg>
      </button>
    </div>
  )
}
