import { deleteBody, exportStep, toggleBodyVisibility } from '../app/bodyActions.ts'
import { documentController } from '../app/services.ts'
import { deleteSketch } from '../app/viewportHost.ts'
import { isBodySelection, useAppStore } from '../state/appStore.ts'

/** 左上角項目面板：body 清單、選取、顯示/隱藏、刪除。 */
export function ItemsPanel() {
  const bodies = useAppStore((s) => s.bodies)
  const selection = useAppStore((s) => s.selection)
  const toggleSelection = useAppStore((s) => s.toggleSelection)
  const sketches = useAppStore((s) => s.sketches)
  const setSketchVisible = useAppStore((s) => s.setSketchVisible)
  const replaceSelection = useAppStore((s) => s.replaceSelection)
  const bodyItems = selection.filter(isBodySelection)

  if (bodies.length === 0 && sketches.length === 0) return null

  return (
    <div className="items-panel">
      <div className="items-panel-header">
        <span className="items-panel-title">項目</span>
        <button
          className="items-icon"
          title="匯出 STEP"
          aria-label="匯出 STEP"
          onClick={() => void exportStep()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19" />
            <path d="M12 17 V11 M9.5 13.5 L12 11 L14.5 13.5" />
          </svg>
        </button>
      </div>
      {bodies.map((body) => {
        const selected = bodyItems.some(
          (item) => item.bodyId === body.bodyId && item.kind === 'body',
        )
        const partialSelected =
          !selected && bodyItems.some((item) => item.bodyId === body.bodyId)
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
      {sketches.map((sketch) => {
        const selected = selection.some(
          (item) => !isBodySelection(item) && item.sketchId === sketch.sketchId,
        )
        return (
          <div
            key={`sketch-${sketch.sketchId}`}
            className={`items-row ${selected ? 'items-row-partial' : ''} ${
              sketch.visible ? '' : 'items-row-hidden'
            }`}
          >
            <button
              className="items-name items-name-sketch"
              // 點名稱：選取整張草圖的線（之後可刪除或正視）
              onClick={() => replaceSelection(sketchCurveSelection(sketch.sketchId))}
            >
              {sketch.name}
              <span className="items-meta">{sketch.curveCount} 條線</span>
            </button>
            <button
              className="items-icon"
              title={sketch.visible ? '隱藏' : '顯示'}
              aria-label={sketch.visible ? `隱藏 ${sketch.name}` : `顯示 ${sketch.name}`}
              onClick={() => setSketchVisible(sketch.sketchId, !sketch.visible)}
            >
              <EyeIcon open={sketch.visible} />
            </button>
            <button
              className="items-icon"
              title="刪除"
              aria-label={`刪除 ${sketch.name}`}
              onClick={() => void deleteSketch(sketch.sketchId)}
            >
              <TrashIcon />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function sketchCurveSelection(sketchId: number) {
  const sketch = documentController.sketches().get(sketchId)
  return (sketch?.curves ?? []).map((c) => ({ kind: 'curve' as const, sketchId, curveId: c.id }))
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 12 C5 6.5, 19 6.5, 22 12 C19 17.5, 5 17.5, 2 12 Z" />
      {open ? <circle cx="12" cy="12" r="3" /> : <path d="M4 20 L20 4" />}
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7" />
    </svg>
  )
}
