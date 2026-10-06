// 左緣常駐工具列（Shapr3D 式，無模式）：選取 + 四個草圖工具隨時可切換，
// 選了草圖工具後直接用筆在任何平面或地面上畫——不需要進入/離開草圖模式。
// 下方「新增」選單：方塊、圓柱、匯入 STEP。

import { useRef, useState, type ReactElement } from 'react'
import { importStepFile } from '../app/bodyActions.ts'
import { createBox, createCylinder } from '../app/createPrimitives.ts'
import { selectTool } from '../app/viewportHost.ts'
import { useAppStore, type ActiveTool } from '../state/appStore.ts'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const TOOL_ICONS: Record<ActiveTool, ReactElement> = {
  select: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M6 4 L18 12 L12.5 13.2 L15.5 19.5 L13 20.6 L10 14.3 L6 18 Z" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 19 L19 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  arc: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 19 A 14 14 0 0 1 19 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="5" y="7" width="14" height="10" rx="1" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  ),
}

const TOOL_LABELS: Record<ActiveTool, string> = {
  select: '選取（V）',
  line: '直線（L）',
  arc: '圓弧（A）——先拉弦，再拉弧度',
  rect: '矩形（R）',
  circle: '圓（C）',
}

const TOOLS: ActiveTool[] = ['select', 'line', 'arc', 'rect', 'circle']

const ADD_ICONS: Record<string, ReactElement> = {
  add: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M12 9 V15 M9 12 H15" />
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
  const [addOpen, setAddOpen] = useState(false)
  const kernelReady = useAppStore((s) => s.kernelStatus === 'ready')
  const activeTool = useAppStore((s) => s.activeTool)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runAndCollapse = (action: () => Promise<void>) => {
    void action()
    setAddOpen(false)
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            className={`toolbar-button ${activeTool === tool ? 'toolbar-button-active' : ''}`}
            title={TOOL_LABELS[tool]}
            aria-label={TOOL_LABELS[tool]}
            aria-pressed={activeTool === tool}
            disabled={tool !== 'select' && !kernelReady}
            onClick={() => selectTool(tool)}
          >
            {TOOL_ICONS[tool]}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <div className="toolbar-flyout-anchor">
          <button
            className={`toolbar-button ${addOpen ? 'toolbar-button-active' : ''}`}
            title="新增"
            aria-label="新增"
            aria-expanded={addOpen}
            onClick={() => setAddOpen(!addOpen)}
          >
            {ADD_ICONS.add}
          </button>
          {addOpen && (
            <div className="toolbar-flyout">
              <button className="flyout-item" disabled={!kernelReady} onClick={() => runAndCollapse(createBox)}>
                {ADD_ICONS.box}
                <span>方塊</span>
              </button>
              <button
                className="flyout-item"
                disabled={!kernelReady}
                onClick={() => runAndCollapse(createCylinder)}
              >
                {ADD_ICONS.cylinder}
                <span>圓柱</span>
              </button>
              <button
                className="flyout-item"
                disabled={!kernelReady}
                onClick={() => {
                  fileInputRef.current?.click()
                  setAddOpen(false)
                }}
              >
                {ADD_ICONS.importFile}
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
      </div>
    </div>
  )
}
