// 情境動作列：依目前選取顯示可用操作（Shapr3D 式，選了才出現）。
//   body → 移動 / 複製
//   edge → 圓角 / 倒角
//   face → 抽殼
// 模式型按鈕（移動/圓角/倒角/抽殼）啟用後由 viewport 的拖曳設定參數。

import { useEffect, useState } from 'react'
import { copySelectedBody } from '../app/bodyActions.ts'
import { services } from '../app/services.ts'
import type { MeasureResult } from '../kernel/protocol.ts'
import { useAppStore, type AppState } from '../state/appStore.ts'

interface ModeAction {
  mode: NonNullable<AppState['toolMode']>
  label: string
}

function formatMeasure(m: MeasureResult): string[] {
  const parts: string[] = []
  if (m.length !== undefined) parts.push(`長 ${m.length.toFixed(1)} mm`)
  if (m.area !== undefined) {
    parts.push(
      m.area >= 1e4 ? `面積 ${(m.area / 100).toFixed(1)} cm²` : `面積 ${m.area.toFixed(1)} mm²`,
    )
  }
  if (m.volume !== undefined) {
    parts.push(
      m.volume >= 1e5
        ? `體積 ${(m.volume / 1000).toFixed(1)} cm³`
        : `體積 ${m.volume.toFixed(0)} mm³`,
    )
  }
  return parts
}

export function ContextBar() {
  const selection = useAppStore((s) => s.selection)
  const toolMode = useAppStore((s) => s.toolMode)
  const setToolMode = useAppStore((s) => s.setToolMode)
  const sketchActive = useAppStore((s) => s.sketchActive)
  const [measure, setMeasure] = useState<string[]>([])

  useEffect(() => {
    setMeasure([])
    if (selection.length === 0 || !services.kernel) return
    let stale = false
    services.kernel
      .measure(selection)
      .then((m) => !stale && setMeasure(formatMeasure(m)))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [selection])

  if (sketchActive || selection.length === 0) return null

  const bodyIds = new Set(selection.map((i) => i.bodyId))
  const sameBody = bodyIds.size === 1
  const hasBody = selection.some((i) => i.kind === 'body')
  const allEdges = sameBody && selection.every((i) => i.kind === 'edge')
  const singleFace =
    sameBody && selection.length === 1 && selection[0].kind === 'face'

  const modes: ModeAction[] = hasBody
    ? [{ mode: 'move', label: '移動' }]
    : allEdges
      ? [
          { mode: 'fillet', label: '圓角' },
          { mode: 'chamfer', label: '倒角' },
        ]
      : singleFace
        ? [{ mode: 'shell', label: '抽殼' }]
        : []

  if (modes.length === 0 && !hasBody && measure.length === 0) return null

  const hint =
    toolMode === 'move'
      ? '拖曳移動（Z 箭頭上下）'
      : toolMode === 'fillet' || toolMode === 'chamfer'
        ? '拖曳設定半徑'
        : toolMode === 'shell'
          ? '拖曳設定壁厚'
          : null

  return (
    <div className="context-bar">
      {modes.map(({ mode, label }) => (
        <button
          key={mode}
          className={`context-button ${toolMode === mode ? 'context-button-active' : ''}`}
          onClick={() => setToolMode(toolMode === mode ? null : mode)}
        >
          {label}
        </button>
      ))}
      {hasBody && (
        <button className="context-button" onClick={() => void copySelectedBody()}>
          複製
        </button>
      )}
      {hint && <span className="context-hint">{hint}</span>}
      {measure.length > 0 && (
        <span className="context-measure">{measure.join('　')}</span>
      )}
    </div>
  )
}
