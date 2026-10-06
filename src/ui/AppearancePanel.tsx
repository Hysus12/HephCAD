// 外觀面板：顏色（色票 + 自訂）與不透明度滑桿，作用在選取的本體。
// 滑桿拖曳中只做即時預覽，放開才寫進 journal（一步、可 undo）。

import { useState } from 'react'
import { setAppearance } from '../app/bodyActions.ts'
import { services } from '../app/services.ts'
import { DEFAULT_MATERIAL } from '../doc/materials.ts'
import { isBodySelection, useAppStore } from '../state/appStore.ts'

const SWATCHES = ['#9a9aa0', '#e5e5e8', '#3a3a40', '#d94b4b', '#f08a24', '#e8c53a', '#4caf6d', '#3f8ae0', '#8a5cd0']

export function AppearancePanel() {
  const selection = useAppStore((s) => s.selection)
  const materials = useAppStore((s) => s.materials)
  const [draft, setDraft] = useState<number | null>(null)
  const bodyIds = [...new Set(selection.filter(isBodySelection).map((i) => i.bodyId))]
  if (bodyIds.length === 0) return null

  const current = materials[bodyIds[0]] ?? DEFAULT_MATERIAL
  const percent = draft ?? Math.round(current.opacity * 100)
  const commitOpacity = (value: number) => {
    setDraft(null)
    void setAppearance(bodyIds, { opacity: value / 100 })
  }

  return (
    <div className="appearance-panel" role="group" aria-label="外觀">
      <div className="appearance-swatches">
        {SWATCHES.map((color) => (
          <button
            key={color}
            className={`appearance-swatch ${current.color === color ? 'appearance-swatch-active' : ''}`}
            style={{ background: color }}
            aria-label={`顏色 ${color}`}
            onClick={() => void setAppearance(bodyIds, { color })}
          />
        ))}
        <input
          type="color"
          className="appearance-custom"
          aria-label="自訂顏色"
          value={current.color}
          onChange={(e) => services.viewport?.previewMaterial(bodyIds, { color: e.target.value })}
          onBlur={(e) => void setAppearance(bodyIds, { color: e.target.value })}
        />
      </div>
      <label className="appearance-opacity">
        <span>透明度</span>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={percent}
          aria-label="不透明度"
          onChange={(e) => {
            const value = Number(e.target.value)
            setDraft(value)
            services.viewport?.previewMaterial(bodyIds, { opacity: value / 100 })
          }}
          onPointerUp={(e) => commitOpacity(Number(e.currentTarget.value))}
          onKeyUp={(e) => commitOpacity(Number(e.currentTarget.value))}
        />
        <output>{percent}%</output>
      </label>
    </div>
  )
}
