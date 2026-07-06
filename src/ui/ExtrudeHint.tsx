import { useAppStore } from '../state/appStore.ts'

/** 場景有可擠出區域時的操作提示。 */
export function ExtrudeHint() {
  const count = useAppStore((s) => s.extrudableRegionCount)
  const sketchActive = useAppStore((s) => s.sketchActive)

  if (count === 0 || sketchActive) return null

  return <div className="extrude-hint">拖曳藍色區域以擠出（拉出加料、壓入減料）</div>
}
