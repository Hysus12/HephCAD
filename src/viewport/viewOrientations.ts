// 世界座標採 Z-up（CAD 慣例）。theta 為 XY 平面上自 +X 起算的方位角，
// phi 為自 +Z 起算的極角。方向向量 = (sinφ·cosθ, sinφ·sinθ, cosφ)，
// 代表「從 target 指向相機」的單位向量。

export type ViewOrientation =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'iso'

export interface OrbitAngles {
  theta: number
  phi: number
}

/** 標準等角視：面向前右上（相機在 +X, -Y, +Z 象限）。 */
export const ISO_PHI = Math.acos(1 / Math.sqrt(3))
export const ISO_THETA = -Math.PI / 4

export function orientationAngles(orientation: ViewOrientation): OrbitAngles {
  switch (orientation) {
    case 'front':
      return { theta: -Math.PI / 2, phi: Math.PI / 2 }
    case 'back':
      return { theta: Math.PI / 2, phi: Math.PI / 2 }
    case 'right':
      return { theta: 0, phi: Math.PI / 2 }
    case 'left':
      return { theta: Math.PI, phi: Math.PI / 2 }
    case 'top':
      // phi=0 會讓視線與 up 向量共線，由 CameraRig 的極角下限保護。
      return { theta: -Math.PI / 2, phi: 0 }
    case 'bottom':
      return { theta: -Math.PI / 2, phi: Math.PI }
    case 'iso':
      return { theta: ISO_THETA, phi: ISO_PHI }
  }
}
