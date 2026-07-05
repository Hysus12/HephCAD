import { Vector3 } from 'three'
import {
  orientationAngles,
  ISO_PHI,
  ISO_THETA,
  type ViewOrientation,
} from './viewOrientations.ts'

// 極角夾在 (0, π) 內側一點點，避免視線與世界 up (+Z) 共線導致 lookAt 退化。
const MIN_PHI = 0.01
const MAX_PHI = Math.PI - MIN_PHI

const MIN_RADIUS = 5
const MAX_RADIUS = 100_000

/** 每像素拖曳對應的軌道角速度（rad/px）。 */
const ORBIT_SPEED = 0.008

/** snap 動畫的阻尼係數，越大收斂越快。 */
const DAMPING = 12

const WORLD_UP = new Vector3(0, 0, 1)

/**
 * 相機軌道 rig：turntable 模型（Z-up、繞 target 旋轉）。
 *
 * 手勢直接改變 goal 與 current（1:1 跟手）；snapTo 只改 goal，
 * 由 update() 以指數阻尼把 current 帶過去（用於視角切換動畫）。
 */
export class CameraRig {
  theta = ISO_THETA
  phi = ISO_PHI
  radius = 600
  readonly target = new Vector3()

  private curTheta = this.theta
  private curPhi = this.phi
  private curRadius = this.radius
  private readonly curTarget = new Vector3()

  orbit(dxPx: number, dyPx: number): void {
    this.theta -= dxPx * ORBIT_SPEED
    this.phi = clamp(this.phi - dyPx * ORBIT_SPEED, MIN_PHI, MAX_PHI)
    this.curTheta = this.theta
    this.curPhi = this.phi
  }

  /**
   * 螢幕像素平移轉成 target 的世界位移。
   * worldPerPixel 以視錐在 target 深度的高度換算。
   */
  pan(dxPx: number, dyPx: number, viewportHeightPx: number, fovDeg: number): void {
    const worldPerPixel =
      (2 * this.curRadius * Math.tan(((fovDeg / 2) * Math.PI) / 180)) /
      viewportHeightPx
    const { right, up } = this.cameraBasis()
    this.target
      .addScaledVector(right, -dxPx * worldPerPixel)
      .addScaledVector(up, dyPx * worldPerPixel)
    this.curTarget.copy(this.target)
  }

  /** scale > 1 拉遠、< 1 拉近。 */
  dolly(scale: number): void {
    this.radius = clamp(this.radius * scale, MIN_RADIUS, MAX_RADIUS)
    this.curRadius = this.radius
  }

  snapTo(orientation: ViewOrientation): void {
    const { theta, phi } = orientationAngles(orientation)
    // 取與目前方位角等價且最近的角度，讓動畫走最短路徑。
    this.theta = nearestEquivalentAngle(theta, this.curTheta)
    this.phi = clamp(phi, MIN_PHI, MAX_PHI)
  }

  /** 動畫轉到正對指定方向（如草圖平面法線）。 */
  snapToDirection(dir: [number, number, number]): void {
    const [x, y, z] = dir
    const horizontal = Math.hypot(x, y)
    // 法線接近垂直時方位角不穩定，保留目前方位角
    const theta = horizontal < 1e-6 ? this.curTheta : Math.atan2(y, x)
    const phi = Math.acos(Math.min(1, Math.max(-1, z)))
    this.theta = nearestEquivalentAngle(theta, this.curTheta)
    this.phi = clamp(phi, MIN_PHI, MAX_PHI)
  }

  currentRadius(): number {
    return this.curRadius
  }

  /** 推進 snap 動畫。回傳是否仍在移動（需要重繪）。 */
  update(dtSeconds: number): boolean {
    const k = 1 - Math.exp(-DAMPING * dtSeconds)
    this.curTheta += (this.theta - this.curTheta) * k
    this.curPhi += (this.phi - this.curPhi) * k
    this.curRadius += (this.radius - this.curRadius) * k
    this.curTarget.lerp(this.target, k)

    const moving =
      Math.abs(this.theta - this.curTheta) > 1e-4 ||
      Math.abs(this.phi - this.curPhi) > 1e-4 ||
      Math.abs(this.radius - this.curRadius) > 1e-2 ||
      this.curTarget.distanceToSquared(this.target) > 1e-4
    if (!moving) {
      this.curTheta = this.theta
      this.curPhi = this.phi
      this.curRadius = this.radius
      this.curTarget.copy(this.target)
    }
    return moving
  }

  /** 目前（動畫中）的相機位置。 */
  position(out = new Vector3()): Vector3 {
    return out
      .copy(this.direction())
      .multiplyScalar(this.curRadius)
      .add(this.curTarget)
  }

  /** 從 target 指向相機的單位向量（目前值）。 */
  direction(out = new Vector3()): Vector3 {
    const sinPhi = Math.sin(this.curPhi)
    return out.set(
      sinPhi * Math.cos(this.curTheta),
      sinPhi * Math.sin(this.curTheta),
      Math.cos(this.curPhi),
    )
  }

  currentTarget(out = new Vector3()): Vector3 {
    return out.copy(this.curTarget)
  }

  private cameraBasis(): { right: Vector3; up: Vector3 } {
    const toCamera = this.direction()
    const right = new Vector3().crossVectors(WORLD_UP, toCamera).normalize()
    const up = new Vector3().crossVectors(toCamera, right).normalize()
    return { right, up }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 回傳與 angle 相差 2π 整數倍、且離 reference 最近的角度。 */
export function nearestEquivalentAngle(angle: number, reference: number): number {
  const twoPi = Math.PI * 2
  let a = angle + Math.round((reference - angle) / twoPi) * twoPi
  if (a - reference > Math.PI) a -= twoPi
  if (reference - a > Math.PI) a += twoPi
  return a
}
