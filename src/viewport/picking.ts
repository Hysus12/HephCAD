import type { TopoGroup } from '../kernel/protocol.ts'

/**
 * 在按 start 升冪排列的 groups 中，找出包含 offset 的群組（二分搜尋）。
 * face：offset 是 index buffer 位置；edge：offset 是頂點序號。
 */
export function findTopoGroup(groups: TopoGroup[], offset: number): TopoGroup | null {
  let lo = 0
  let hi = groups.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const g = groups[mid]
    if (offset < g.start) hi = mid - 1
    else if (offset >= g.start + g.count) lo = mid + 1
    else return g
  }
  return null
}

/**
 * 觸控選 edge 的螢幕容差（px）換算成世界單位的 raycast 閾值。
 * 以 target 深度的視錐高度近似。
 */
export function edgePickThreshold(
  tolerancePx: number,
  cameraDistance: number,
  fovDeg: number,
  viewportHeightPx: number,
): number {
  const worldPerPixel =
    (2 * cameraDistance * Math.tan(((fovDeg / 2) * Math.PI) / 180)) / viewportHeightPx
  return tolerancePx * worldPerPixel
}
