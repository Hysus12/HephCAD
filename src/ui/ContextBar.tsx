// 情境動作列：依目前選取顯示可用操作（Shapr3D 式，選了才出現）。
//   草圖區域 → 拖曳藍色箭頭擠出；正視
//   草圖線   → 刪除；正視
//   面       → 拖曳藍色箭頭推拉；抽殼；正視
//   邊       → 圓角 / 倒角（之後拖曳橘色箭頭）
//   主體     → 移動（三軸箭頭）/ 複製 / 刪除
// 量測（長度/面積/體積）跟著 body 類選取一起顯示。

import { useEffect, useState } from 'react'
import { copySelectedBody } from '../app/bodyActions.ts'
import { services } from '../app/services.ts'
import { deleteSelection } from '../app/viewportHost.ts'
import type { MeasureResult } from '../kernel/protocol.ts'
import { isBodySelection, useAppStore, type AppState } from '../state/appStore.ts'

function formatMeasure(m: MeasureResult): string[] {
  const parts: string[] = []
  if (m.length !== undefined) parts.push(`長 ${m.length.toFixed(1)} mm`)
  if (m.area !== undefined) {
    parts.push(m.area >= 1e4 ? `面積 ${(m.area / 100).toFixed(1)} cm²` : `面積 ${m.area.toFixed(1)} mm²`)
  }
  if (m.volume !== undefined) {
    parts.push(
      m.volume >= 1e5 ? `體積 ${(m.volume / 1000).toFixed(1)} cm³` : `體積 ${m.volume.toFixed(0)} mm³`,
    )
  }
  return parts
}

type Mode = NonNullable<AppState['toolMode']>

export function ContextBar() {
  const selection = useAppStore((s) => s.selection)
  const toolMode = useAppStore((s) => s.toolMode)
  const setToolMode = useAppStore((s) => s.setToolMode)
  const [measure, setMeasure] = useState<string[]>([])

  const bodyItems = selection.filter(isBodySelection)

  useEffect(() => {
    setMeasure([])
    const items = selection.filter(isBodySelection)
    if (items.length === 0 || !services.kernel) return
    let stale = false
    services.kernel
      .measure(items)
      .then((m) => !stale && setMeasure(formatMeasure(m)))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [selection])

  if (selection.length === 0) return null

  const kinds = new Set(selection.map((i) => i.kind))
  const only = (k: string) => kinds.size === 1 && kinds.has(k as never)
  const sameBody = new Set(bodyItems.map((i) => i.bodyId)).size === 1

  const modes: { mode: Mode; label: string }[] = []
  let hint: string | null = null
  let canDelete = false
  let canLookAt = false
  let canCopy = false

  if (only('region')) {
    hint = selection.length === 1 ? '拖曳藍色箭頭擠出（往回拖＝切除）' : null
    canLookAt = true
  } else if (only('curve')) {
    canDelete = true
    canLookAt = true
  } else if (only('face') && sameBody) {
    if (selection.length === 1) {
      hint = '拖曳藍色箭頭推拉這個面'
      modes.push({ mode: 'shell', label: '抽殼' })
    }
    canLookAt = true
  } else if (only('edge') && sameBody) {
    modes.push({ mode: 'fillet', label: '圓角' }, { mode: 'chamfer', label: '倒角' })
  } else if (only('body')) {
    if (selection.length === 1) {
      modes.push({ mode: 'move', label: '移動' })
      canCopy = true
    }
    canDelete = true
  }

  if (toolMode === 'move') hint = '拖曳彩色箭頭沿 X / Y / Z 移動'
  else if (toolMode === 'fillet' || toolMode === 'chamfer') hint = '拖曳橘色箭頭設定大小'
  else if (toolMode === 'shell') hint = '拖曳橘色箭頭設定壁厚'

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
      {canCopy && (
        <button className="context-button" onClick={() => void copySelectedBody()}>
          複製
        </button>
      )}
      {canLookAt && (
        <button className="context-button" onClick={() => services.viewport?.lookAtSelection()}>
          正視
        </button>
      )}
      {canDelete && (
        <button className="context-button context-button-danger" onClick={() => void deleteSelection()}>
          刪除
        </button>
      )}
      {hint && <span className="context-hint">{hint}</span>}
      {measure.length > 0 && <span className="context-measure">{measure.join('　')}</span>}
    </div>
  )
}
