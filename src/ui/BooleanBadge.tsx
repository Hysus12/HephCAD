import { services } from '../app/services.ts'
import { BOOL_LABELS, type BoolMode } from '../doc/journal.ts'
import { useAppStore } from '../state/appStore.ts'

const MODES: BoolMode[] = ['union', 'new', 'subtract', 'intersect']

/**
 * 擠出後出現的布林徽章（Shapr3D 的 Union / New Body / Subtract / Intersect）：
 * 目前生效的模式亮起，點別的就以該模式取代剛才的擠出。
 */
export function BooleanBadge() {
  const badge = useAppStore((s) => s.boolBadge)
  const dimension = useAppStore((s) => s.dimension)
  if (!badge || !dimension) return null

  return (
    <div
      className="bool-badge"
      style={{ left: dimension.x, top: dimension.y + 46 }}
      role="group"
      aria-label="布林運算"
    >
      {MODES.map((mode) => (
        <button
          key={mode}
          className={`bool-badge-option ${badge.mode === mode ? 'bool-badge-active' : ''}`}
          aria-pressed={badge.mode === mode}
          onClick={() => void services.viewport?.applyBoolMode(mode)}
        >
          {BOOL_LABELS[mode]}
        </button>
      ))}
    </div>
  )
}
