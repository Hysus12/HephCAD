import { useState } from 'react'
import {
  createBasePlane,
  deleteBody,
  deletePlane,
  exportStep,
  renameFolder,
  toggleBodyVisibility,
  toggleFolderVisibility,
  ungroupFolder,
} from '../app/bodyActions.ts'
import { documentController } from '../app/services.ts'
import { deleteSketch } from '../app/viewportHost.ts'
import { isBodySelection, useAppStore } from '../state/appStore.ts'

/** 左上角項目面板：body 清單、選取、顯示/隱藏、刪除。 */
export function ItemsPanel() {
  const bodies = useAppStore((s) => s.bodies)
  const selection = useAppStore((s) => s.selection)
  const sketches = useAppStore((s) => s.sketches)
  const setSketchVisible = useAppStore((s) => s.setSketchVisible)
  const replaceSelection = useAppStore((s) => s.replaceSelection)
  const planes = useAppStore((s) => s.planes)
  const setPlaneVisible = useAppStore((s) => s.setPlaneVisible)
  const activePlaneId = useAppStore((s) => s.activePlaneId)
  const setActivePlaneId = useAppStore((s) => s.setActivePlaneId)
  const [planeMenu, setPlaneMenu] = useState(false)
  const folders = useAppStore((s) => s.folders)
  const toggleFolderExpanded = useAppStore((s) => s.toggleFolderExpanded)
  const inFolder = new Set(folders.flatMap((f) => f.bodyIds))

  if (bodies.length === 0 && sketches.length === 0 && planes.length === 0) return null

  return (
    <div className="items-panel">
      <div className="items-panel-header">
        <span className="items-panel-title">項目</span>
        <button
          className="items-icon"
          title="新增建構平面"
          aria-label="新增建構平面"
          aria-expanded={planeMenu}
          onClick={() => setPlaneMenu(!planeMenu)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 15 L9 8 H21 L15 15 Z" />
            <path d="M12 18 V22 M10 20 H14" />
          </svg>
        </button>
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
      {planeMenu && (
        <div className="items-menu" role="menu" aria-label="基準面">
          {(
            [
              ['top', '上視（水平）'],
              ['front', '前視'],
              ['right', '右視'],
            ] as const
          ).map(([base, label]) => (
            <button
              key={base}
              role="menuitem"
              className="items-menu-item"
              onClick={() => {
                setPlaneMenu(false)
                void createBasePlane(base)
              }}
            >
              偏移 {label}
            </button>
          ))}
          <span className="items-menu-hint">選一個面後用情境列的「偏移平面」可從面偏移</span>
        </div>
      )}
      {folders.map((folder) => {
        const members = folder.bodyIds
          .map((id) => bodies.find((b) => b.bodyId === id))
          .filter((b): b is BodyEntry => !!b)
        const allHidden = members.length > 0 && members.every((b) => !b.visible)
        return (
          <div key={`folder-${folder.folderId}`}>
            <div className={`items-row items-folder ${allHidden ? 'items-row-hidden' : ''}`}>
              <button
                className="items-icon"
                aria-label={folder.expanded ? `收合 ${folder.name}` : `展開 ${folder.name}`}
                aria-expanded={folder.expanded}
                onClick={() => toggleFolderExpanded(folder.folderId)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d={folder.expanded ? 'M6 9 L12 15 L18 9' : 'M9 6 L15 12 L9 18'} />
                </svg>
              </button>
              <FolderName folderId={folder.folderId} name={folder.name} count={members.length} />
              <button
                className="items-icon"
                title={allHidden ? '顯示全部' : '隱藏全部'}
                aria-label={allHidden ? `顯示 ${folder.name}` : `隱藏 ${folder.name}`}
                onClick={() => toggleFolderVisibility(folder.bodyIds)}
              >
                <EyeIcon open={!allHidden} />
              </button>
              <button
                className="items-icon"
                title="解散資料夾（本體保留）"
                aria-label={`解散 ${folder.name}`}
                onClick={() => void ungroupFolder(folder.folderId)}
              >
                <UngroupIcon />
              </button>
            </div>
            {folder.expanded && members.map((body) => <BodyRow key={body.bodyId} body={body} nested />)}
          </div>
        )
      })}
      {bodies
        .filter((b) => !inFolder.has(b.bodyId))
        .map((body) => (
          <BodyRow key={body.bodyId} body={body} />
        ))}
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
      {planes.map((plane) => (
        <div
          key={`plane-${plane.planeId}`}
          className={`items-row ${activePlaneId === plane.planeId ? 'items-row-selected' : ''} ${
            plane.visible ? '' : 'items-row-hidden'
          }`}
        >
          <button
            className="items-name items-name-plane"
            title="雙擊 3D 中的平面，或點這裡：選為草圖平面"
            onClick={() => setActivePlaneId(activePlaneId === plane.planeId ? null : plane.planeId)}
          >
            {plane.name}
            {activePlaneId === plane.planeId && <span className="items-meta">草圖中</span>}
          </button>
          <button
            className="items-icon"
            title={plane.visible ? '隱藏' : '顯示'}
            aria-label={plane.visible ? `隱藏 ${plane.name}` : `顯示 ${plane.name}`}
            onClick={() => setPlaneVisible(plane.planeId, !plane.visible)}
          >
            <EyeIcon open={plane.visible} />
          </button>
          <button
            className="items-icon"
            title="刪除"
            aria-label={`刪除 ${plane.name}`}
            onClick={() => void deletePlane(plane.planeId)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
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

type BodyEntry = ReturnType<typeof useAppStore.getState>['bodies'][number]

function BodyRow({ body, nested = false }: { body: BodyEntry; nested?: boolean }) {
  const selection = useAppStore((s) => s.selection)
  const toggleSelection = useAppStore((s) => s.toggleSelection)
  const bodyItems = selection.filter(isBodySelection)
  const selected = bodyItems.some((item) => item.bodyId === body.bodyId && item.kind === 'body')
  const partialSelected = !selected && bodyItems.some((item) => item.bodyId === body.bodyId)
  return (
    <div
      className={`items-row ${nested ? 'items-row-nested' : ''} ${selected ? 'items-row-selected' : ''} ${
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
}

function FolderName({ folderId, name, count }: { folderId: number; name: string; count: number }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (editing) {
    const finish = (commit: boolean) => {
      setEditing(false)
      if (commit && draft.trim() && draft.trim() !== name) void renameFolder(folderId, draft)
    }
    return (
      <input
        className="items-rename"
        autoFocus
        value={draft}
        aria-label="資料夾名稱"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          else if (e.key === 'Escape') finish(false)
        }}
      />
    )
  }
  return (
    <button
      className="items-name items-name-folder"
      title="點兩下重新命名"
      onDoubleClick={() => {
        setDraft(name)
        setEditing(true)
      }}
    >
      {name}
      <span className="items-meta">{count}</span>
    </button>
  )
}

function UngroupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7 H9 L11 9 H21 V19 H3 Z" />
      <path d="M9 14 H15" />
    </svg>
  )
}
