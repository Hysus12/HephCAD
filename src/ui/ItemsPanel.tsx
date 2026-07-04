import { deleteBody, toggleBodyVisibility } from '../app/bodyActions.ts'
import { useAppStore } from '../state/appStore.ts'

/** 左上角項目面板：body 清單、選取、顯示/隱藏、刪除。 */
export function ItemsPanel() {
  const bodies = useAppStore((s) => s.bodies)
  const selection = useAppStore((s) => s.selection)
  const toggleSelection = useAppStore((s) => s.toggleSelection)

  if (bodies.length === 0) return null

  return (
    <div className="items-panel">
      <div className="items-panel-title">項目</div>
      {bodies.map((body) => {
        const selected = selection.some(
          (item) => item.bodyId === body.bodyId && item.kind === 'body',
        )
        const partialSelected =
          !selected && selection.some((item) => item.bodyId === body.bodyId)
        return (
          <div
            key={body.bodyId}
            className={`items-row ${selected ? 'items-row-selected' : ''} ${
              partialSelected ? 'items-row-partial' : ''
            } ${body.visible ? '' : 'items-row-hidden'}`}
          >
            <button
              className="items-name"
              onClick={() =>
                toggleSelection({ bodyId: body.bodyId, kind: 'body', topoId: 0 })
              }
            >
              {body.name}
            </button>
            <button
              className="items-icon"
              title={body.visible ? '隱藏' : '顯示'}
              aria-label={body.visible ? '隱藏' : '顯示'}
              onClick={() => toggleBodyVisibility(body.bodyId)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                {body.visible ? (
                  <>
                    <path d="M2 12 C5 6.5, 19 6.5, 22 12 C19 17.5, 5 17.5, 2 12 Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M2 12 C5 6.5, 19 6.5, 22 12 C19 17.5, 5 17.5, 2 12 Z" />
                    <path d="M4 20 L20 4" />
                  </>
                )}
              </svg>
            </button>
            <button
              className="items-icon"
              title="刪除"
              aria-label={`刪除 ${body.name}`}
              onClick={() => void deleteBody(body.bodyId)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
