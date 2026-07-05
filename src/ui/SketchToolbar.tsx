import type { ReactElement } from 'react'
import { cancelSketch, finishSketch, selectSketchTool } from '../app/sketchActions.ts'
import type { ToolKind } from '../sketch/tools.ts'
import { useAppStore } from '../state/appStore.ts'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const TOOL_ICONS: Record<ToolKind, ReactElement> = {
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

const TOOL_LABELS: Record<ToolKind, string> = {
  line: '直線',
  arc: '圓弧',
  rect: '矩形',
  circle: '圓',
}

const TOOLS: ToolKind[] = ['line', 'arc', 'rect', 'circle']

/** 草圖模式的左緣工具列（取代一般工具列）。 */
export function SketchToolbar() {
  const activeTool = useAppStore((s) => s.sketchTool)
  const regionCount = useAppStore((s) => s.sketchRegionCount)

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            className={`toolbar-button ${activeTool === tool ? 'toolbar-button-active' : ''}`}
            title={TOOL_LABELS[tool]}
            aria-label={TOOL_LABELS[tool]}
            onClick={() => selectSketchTool(tool)}
          >
            {TOOL_ICONS[tool]}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button
          className="toolbar-button sketch-done"
          title="完成草圖"
          aria-label="完成草圖"
          onClick={() => void finishSketch()}
        >
          <svg viewBox="0 0 24 24" {...stroke}>
            <path d="M5 12.5 L10 17.5 L19 6.5" />
          </svg>
        </button>
        <button
          className="toolbar-button sketch-cancel"
          title="取消草圖"
          aria-label="取消草圖"
          onClick={() => void cancelSketch()}
        >
          <svg viewBox="0 0 24 24" {...stroke}>
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>
      </div>
      {regionCount > 0 && (
        <div className="sketch-region-hint">{regionCount} 個閉合區域</div>
      )}
    </div>
  )
}
