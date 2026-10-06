// 情境動作列：依目前選取顯示可用操作（Shapr3D 式，選了才出現）。
//   草圖區域 → 拖曳藍色箭頭擠出；正視
//   草圖線   → 刪除；正視
//   面       → 拖曳藍色箭頭推拉；抽殼；正視
//   邊       → 圓角 / 倒角（之後拖曳橘色箭頭）
//   主體     → 移動（三軸箭頭）/ 複製 / 刪除
// 量測（長度/面積/體積）跟著 body 類選取一起顯示。

import { useEffect, useState } from 'react'
import { applyBoolean, copySelectedBody, createFolder, moveToFolder } from '../app/bodyActions.ts'
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
  const copyMode = useAppStore((s) => s.copyMode)
  const toggleCopyMode = useAppStore((s) => s.toggleCopyMode)
  const keepOriginals = useAppStore((s) => s.keepOriginals)
  const toggleKeepOriginals = useAppStore((s) => s.toggleKeepOriginals)
  const folders = useAppStore((s) => s.folders)
  const patternType = useAppStore((s) => s.patternType)
  const patternCount = useAppStore((s) => s.patternCount)
  const patternDefinition = useAppStore((s) => s.patternDefinition)
  const setPatternType = useAppStore((s) => s.setPatternType)
  const setPatternCount = useAppStore((s) => s.setPatternCount)
  const setPatternDefinition = useAppStore((s) => s.setPatternDefinition)
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
  let canBoolean = false

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
    hint = '拖曳橘色箭頭：往外拉＝圓角、往內推＝倒角（可點數字輸入，負數＝倒角）'
  } else if (only('body')) {
    if (selection.length === 1) {
      modes.push({ mode: 'move', label: '移動' })
      modes.push({ mode: 'pattern', label: '陣列' })
      canCopy = true
    } else {
      canBoolean = true
      hint = '先選的本體是目標；本體需要重疊'
    }
    canDelete = true
  }

  if (toolMode === 'move') hint = '箭頭＝沿軸移動、圓環＝繞軸旋轉（5° 一格）；點數字可輸入精確值'
  else if (toolMode === 'pattern') {
    hint =
      patternType === 'linear'
        ? `箭頭＝沿軸陣列（${patternDefinition === 'total' ? '拖到的距離是總長' : '拖到的距離是間距'}）；點數字可輸入精確值`
        : '圓環＝繞軸陣列（拖滿一圈＝均分整圈）；點數字可輸入總角度'
  } else if (toolMode === 'shell') hint = '拖曳橘色箭頭設定壁厚'

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
      {toolMode === 'move' && (
        <button
          className={`context-button ${copyMode ? 'context-button-active' : ''}`}
          aria-pressed={copyMode}
          title="開啟後，移動或旋轉的是副本，原本體不動"
          onClick={toggleCopyMode}
        >
          拷貝
        </button>
      )}
      {toolMode === 'pattern' && (
        <>
          <button
            className={`context-button ${patternType === 'linear' ? 'context-button-active' : ''}`}
            onClick={() => setPatternType('linear')}
          >
            線性
          </button>
          <button
            className={`context-button ${patternType === 'circular' ? 'context-button-active' : ''}`}
            onClick={() => setPatternType('circular')}
          >
            圓形
          </button>
          <span className="context-stepper" aria-label="陣列數量（含原本體）">
            <button
              className="context-button"
              aria-label="減少數量"
              onClick={() => {
                setPatternCount(patternCount - 1)
                void services.viewport?.refreshArmed()
              }}
            >
              −
            </button>
            <span className="context-stepper-value">×{patternCount}</span>
            <button
              className="context-button"
              aria-label="增加數量"
              onClick={() => {
                setPatternCount(patternCount + 1)
                void services.viewport?.refreshArmed()
              }}
            >
              ＋
            </button>
          </span>
          {patternType === 'linear' && (
            <button
              className="context-button"
              title="切換「拖到的距離」代表間距或總長"
              onClick={() => {
                setPatternDefinition(patternDefinition === 'spacing' ? 'total' : 'spacing')
                void services.viewport?.refreshArmed()
              }}
            >
              {patternDefinition === 'spacing' ? '間距' : '總長'}
            </button>
          )}
        </>
      )}
      {canCopy && toolMode !== 'move' && (
        <button className="context-button" onClick={() => void copySelectedBody()}>
          複製
        </button>
      )}
      {only('body') && (
        <>
          <button
            className="context-button"
            title="把選取的本體收進新資料夾"
            onClick={() => void createFolder(bodyItems.map((i) => i.bodyId))}
          >
            群組
          </button>
          {folders.length > 0 && (
            <select
              className="context-select"
              aria-label="移到資料夾"
              value=""
              onChange={(e) => {
                const value = e.target.value
                if (value === '') return
                void moveToFolder(bodyItems.map((i) => i.bodyId), value === 'none' ? null : Number(value))
              }}
            >
              <option value="">移到…</option>
              {folders.map((f) => (
                <option key={f.folderId} value={f.folderId}>
                  {f.name}
                </option>
              ))}
              <option value="none">（移出資料夾）</option>
            </select>
          )}
        </>
      )}
      {canBoolean && (
        <>
          <button className="context-button" onClick={() => void applyBoolean('union')}>
            聯集
          </button>
          <button className="context-button" onClick={() => void applyBoolean('subtract')}>
            減去
          </button>
          <button className="context-button" onClick={() => void applyBoolean('intersect')}>
            交集
          </button>
          <button
            className={`context-button ${keepOriginals ? 'context-button-active' : ''}`}
            aria-pressed={keepOriginals}
            onClick={toggleKeepOriginals}
          >
            保留原本體
          </button>
        </>
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
