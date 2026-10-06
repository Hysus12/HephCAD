import { useState } from 'react'
import { services } from '../app/services.ts'
import { useAppStore } from '../state/appStore.ts'

/**
 * 跟著幾何走的尺寸標籤。拖曳中只顯示；放開後可點（虛線框）→ 數字鍵盤輸入精確值，
 * 以新數值取代剛才那一步（Shapr3D 的「點尺寸輸入」）。
 */
export function DimensionOverlay() {
  const dimension = useAppStore((s) => s.dimension)
  const keypadOpen = useAppStore((s) => s.keypadOpen)
  const setKeypadOpen = useAppStore((s) => s.setKeypadOpen)

  if (!dimension) return null
  return (
    <>
      <button
        className={`dimension-label ${dimension.editable ? 'dimension-label-editable' : ''}`}
        style={{ left: dimension.x, top: dimension.y }}
        disabled={!dimension.editable}
        onClick={() => setKeypadOpen(true)}
      >
        {dimension.text}
      </button>
      {keypadOpen && dimension.editable && (
        <Keypad
          initial={dimension.value}
          x={dimension.x}
          y={dimension.y}
          onClose={() => setKeypadOpen(false)}
        />
      )}
    </>
  )
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.'] as const

function Keypad(props: { initial: number; x: number; y: number; onClose: () => void }) {
  // 開啟時整段選取：直接按數字就覆蓋（跟 Shapr3D 一樣不用先清除）
  const [text, setText] = useState(String(Math.round(props.initial * 10) / 10))
  const [fresh, setFresh] = useState(true)

  const press = (key: (typeof KEYS)[number]) => {
    if (key === '±') {
      setText((t) => (t.startsWith('-') ? t.slice(1) : `-${t}`))
    } else {
      setText((t) => {
        const base = fresh ? '' : t
        if (key === '.' && base.includes('.')) return base
        return base + key
      })
    }
    setFresh(false)
  }

  const submit = () => {
    const value = Number(text)
    props.onClose()
    if (Number.isFinite(value) && value !== 0) void services.viewport?.applyDimensionValue(value)
  }

  return (
    <div className="keypad-backdrop" onPointerDown={props.onClose}>
      <div
        className="keypad"
        style={{ left: Math.min(props.x, window.innerWidth - 240), top: Math.min(props.y + 28, window.innerHeight - 330) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={`keypad-display ${fresh ? 'keypad-display-fresh' : ''}`}>
          {text || '0'}
          <span className="keypad-unit">mm</span>
        </div>
        <div className="keypad-grid">
          {KEYS.map((k) => (
            <button key={k} className="keypad-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button className="keypad-key" onClick={() => { setText((t) => t.slice(0, -1)); setFresh(false) }}>
            ⌫
          </button>
          <button className="keypad-key keypad-cancel" onClick={props.onClose}>
            取消
          </button>
          <button className="keypad-key keypad-ok" onClick={submit}>
            確定
          </button>
        </div>
      </div>
    </div>
  )
}
