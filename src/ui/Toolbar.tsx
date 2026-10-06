// 左緣直立工具列，依 Shapr3D 的分群：搜尋 / 草圖 / 新增 / 變形 / 工具。
// M1：「新增」子選單可建立 primitive（之後由草圖→擠出取代）；其餘仍是佔位。

import { useRef, useState, type ReactElement } from 'react'
import { importStepFile } from '../app/bodyActions.ts'
import { createBox, createCylinder } from '../app/createPrimitives.ts'
import { enterSketchMode } from '../app/sketchActions.ts'
import { useAppStore } from '../state/appStore.ts'
import { SketchToolbar } from './SketchToolbar.tsx'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const ICONS: Record<string, ReactElement> = {
  search: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 L20 20" />
    </svg>
  ),
  sketch: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 18 C8 8, 14 8, 20 6" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M12 9 V15 M9 12 H15" />
    </svg>
  ),
  transform: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 4 V20 M4 12 H20" />
      <path d="M12 4 L9.5 6.5 M12 4 L14.5 6.5" />
      <path d="M12 20 L9.5 17.5 M12 20 L14.5 17.5" />
      <path d="M4 12 L6.5 9.5 M4 12 L6.5 14.5" />
      <path d="M20 12 L17.5 9.5 M20 12 L17.5 14.5" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M14.5 6.5 a4 4 0 1 0 3 3 L21 13 l-2 2 -3.5-3.5" />
      <path d="M5 19 l4.5-4.5" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
      <path d="M4 7.5 L12 12 L20 7.5 M12 12 V21" />
    </svg>
  ),
  cylinder: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6 V18 M19 6 V18" />
      <path d="M5 18 a7 3 0 0 0 14 0" />
    </svg>
  ),
  importFile: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19" />
      <path d="M12 11 V17 M9.5 14.5 L12 17 L14.5 14.5" />
    </svg>
  ),
}

export function Toolbar() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const kernelReady = useAppStore((s) => s.kernelStatus === 'ready')
  const sketchActive = useAppStore((s) => s.sketchActive)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (sketchActive) return <SketchToolbar />

  const runAndCollapse = (action: () => Promise<void>) => {
    void action()
    setExpanded(null)
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="toolbar-button" title="搜尋" aria-label="搜尋">
          {ICONS.search}
        </button>
      </div>
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          title="草圖"
          aria-label="草圖"
          disabled={!kernelReady}
          onClick={() => void enterSketchMode()}
        >
          {ICONS.sketch}
        </button>
        <div className="toolbar-flyout-anchor">
          <button
            className={`toolbar-button ${expanded === 'add' ? 'toolbar-button-active' : ''}`}
            title="新增"
            aria-label="新增"
            aria-expanded={expanded === 'add'}
            onClick={() => setExpanded(expanded === 'add' ? null : 'add')}
          >
            {ICONS.add}
          </button>
          {expanded === 'add' && (
            <div className="toolbar-flyout">
              <button
                className="flyout-item"
                disabled={!kernelReady}
                onClick={() => runAndCollapse(createBox)}
              >
                {ICONS.box}
                <span>方塊</span>
              </button>
              <button
                className="flyout-item"
                disabled={!kernelReady}
                onClick={() => runAndCollapse(createCylinder)}
              >
                {ICONS.cylinder}
                <span>圓柱</span>
              </button>
              <button
                className="flyout-item"
                disabled={!kernelReady}
                onClick={() => {
                  fileInputRef.current?.click()
                  setExpanded(null)
                }}
              >
                {ICONS.importFile}
                <span>匯入 STEP…</span>
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".step,.stp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importStepFile(file)
              e.target.value = ''
            }}
          />
        </div>
        <button className="toolbar-button" title="變形" aria-label="變形">
          {ICONS.transform}
        </button>
        <button className="toolbar-button" title="工具" aria-label="工具">
          {ICONS.tools}
        </button>
      </div>
    </div>
  )
}
