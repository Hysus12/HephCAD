// 手勢語意（Shapr3D 慣例）：
//   單指/滑鼠左鍵拖曳 = 旋轉視角
//   雙指捏合 = 縮放、雙指移動 = 平移
//   滑鼠右/中鍵拖曳 = 平移、滾輪 = 縮放
//   輕點 = tap（之後給選取用）
// 純邏輯、不碰 DOM，方便在 node 環境測試；DOM 綁定在 attach()。

export interface PointerLike {
  pointerId: number
  clientX: number
  clientY: number
  pointerType?: string
  button?: number
  buttons?: number
}

export type GestureMode = 'navigate' | 'draw'

export interface GestureCallbacks {
  orbit(dxPx: number, dyPx: number): void
  pan(dxPx: number, dyPx: number): void
  /** scale > 1 拉遠、< 1 拉近。 */
  dolly(scale: number): void
  /** tapCount：1 = 單擊、2 = 雙擊（雙擊前仍會先收到一次單擊）。 */
  tap(xPx: number, yPx: number, pointerType: string, tapCount: number): void
  /** draw 模式下的單指筆劃（sketch 用）。 */
  drawStart?(xPx: number, yPx: number): void
  drawMove?(xPx: number, yPx: number): void
  drawEnd?(xPx: number, yPx: number): void
  /** 筆劃被打斷（第二指加入變成導航手勢）。 */
  drawCancel?(): void
}

const TAP_MAX_MOVEMENT_PX = 6
const TAP_MAX_DURATION_MS = 350
const DOUBLE_TAP_MAX_INTERVAL_MS = 350
const DOUBLE_TAP_MAX_DISTANCE_PX = 30
const WHEEL_DOLLY_SPEED = 0.0015
const PINCH_WHEEL_DOLLY_SPEED = 0.01

interface TrackedPointer {
  x: number
  y: number
  downX: number
  downY: number
  downTime: number
  type: string
  panButton: boolean
}

export class GestureController {
  private readonly pointers = new Map<number, TrackedPointer>()
  private multiTouchSession = false
  private lastPinchDistance = 0
  private detach: (() => void) | null = null
  private mode: GestureMode = 'navigate'
  /** draw 模式下進行中筆劃的 pointerId。 */
  private strokePointerId: number | null = null

  constructor(
    private readonly callbacks: GestureCallbacks,
    private readonly now: () => number = () => performance.now(),
  ) {}

  setMode(mode: GestureMode): void {
    if (this.mode === mode) return
    if (this.strokePointerId !== null) {
      this.callbacks.drawCancel?.()
      this.strokePointerId = null
    }
    this.mode = mode
    this.pointers.clear()
    this.multiTouchSession = false
    this.resetPinchBaseline()
  }

  onPointerDown(e: PointerLike): void {
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      downTime: this.now(),
      type: e.pointerType ?? 'mouse',
      panButton: e.button === 1 || e.button === 2,
    })
    if (this.pointers.size >= 2) {
      this.multiTouchSession = true
      // 第二指加入：中斷進行中的筆劃，切成導航手勢
      if (this.strokePointerId !== null) {
        this.callbacks.drawCancel?.()
        this.strokePointerId = null
      }
      this.resetPinchBaseline()
      return
    }
    if (this.mode === 'draw' && !this.isPanButton(e)) {
      this.strokePointerId = e.pointerId
      this.callbacks.drawStart?.(e.clientX, e.clientY)
    }
  }

  onPointerMove(e: PointerLike): void {
    const p = this.pointers.get(e.pointerId)
    if (!p) return

    if (this.pointers.size === 1) {
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (dx === 0 && dy === 0) return
      if (this.strokePointerId === e.pointerId) {
        this.callbacks.drawMove?.(e.clientX, e.clientY)
        return
      }
      if (p.panButton) {
        this.callbacks.pan(dx, dy)
      } else if (this.mode === 'navigate') {
        this.callbacks.orbit(dx, dy)
      }
      return
    }

    p.x = e.clientX
    p.y = e.clientY

    const [a, b] = this.firstTwoPointers()
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const dist = Math.hypot(a.x - b.x, a.y - b.y)

    if (this.lastCentroidX !== null && this.lastCentroidY !== null) {
      const dx = cx - this.lastCentroidX
      const dy = cy - this.lastCentroidY
      if (dx !== 0 || dy !== 0) this.callbacks.pan(dx, dy)
    }
    if (this.lastPinchDistance > 1e-3 && dist > 1e-3) {
      const scale = this.lastPinchDistance / dist
      if (scale !== 1) this.callbacks.dolly(scale)
    }
    this.lastCentroidX = cx
    this.lastCentroidY = cy
    this.lastPinchDistance = dist
  }

  onPointerUp(e: PointerLike): void {
    const p = this.pointers.get(e.pointerId)
    this.pointers.delete(e.pointerId)
    if (!p) return

    if (this.strokePointerId === e.pointerId) {
      this.strokePointerId = null
      this.callbacks.drawEnd?.(e.clientX, e.clientY)
      if (this.pointers.size === 0) this.multiTouchSession = false
      return
    }

    if (this.pointers.size >= 1) {
      // 剩餘手指繼續操作：重設基準避免跳動。
      this.resetPinchBaseline()
      return
    }

    const moved = Math.hypot(e.clientX - p.downX, e.clientY - p.downY)
    const duration = this.now() - p.downTime
    if (
      !this.multiTouchSession &&
      !p.panButton &&
      moved <= TAP_MAX_MOVEMENT_PX &&
      duration <= TAP_MAX_DURATION_MS
    ) {
      const now = this.now()
      const isDouble =
        this.lastTap !== null &&
        now - this.lastTap.time <= DOUBLE_TAP_MAX_INTERVAL_MS &&
        Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) <=
          DOUBLE_TAP_MAX_DISTANCE_PX
      this.lastTap = isDouble ? null : { x: e.clientX, y: e.clientY, time: now }
      this.callbacks.tap(e.clientX, e.clientY, p.type, isDouble ? 2 : 1)
    }
    this.multiTouchSession = false
  }

  onPointerCancel(e: PointerLike): void {
    this.pointers.delete(e.pointerId)
    if (this.strokePointerId === e.pointerId) {
      this.strokePointerId = null
      this.callbacks.drawCancel?.()
    }
    if (this.pointers.size >= 2) this.resetPinchBaseline()
    if (this.pointers.size === 0) this.multiTouchSession = false
  }

  onWheel(deltaY: number, isPinch: boolean): void {
    const speed = isPinch ? PINCH_WHEEL_DOLLY_SPEED : WHEEL_DOLLY_SPEED
    this.callbacks.dolly(Math.exp(deltaY * speed))
  }

  /** 綁定 DOM 事件；回傳前先 detach 舊的。 */
  attach(el: HTMLElement): void {
    this.detach?.()

    const down = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // 合成事件（測試）或已釋放的 pointer 沒有 capture 可設，忽略。
      }
      this.onPointerDown(e)
    }
    const move = (e: PointerEvent) => this.onPointerMove(e)
    const up = (e: PointerEvent) => this.onPointerUp(e)
    const cancel = (e: PointerEvent) => this.onPointerCancel(e)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      this.onWheel(e.deltaY, e.ctrlKey)
    }
    const contextmenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', contextmenu)

    this.detach = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', contextmenu)
    }
  }

  dispose(): void {
    this.detach?.()
    this.detach = null
    this.pointers.clear()
  }

  private lastCentroidX: number | null = null
  private lastCentroidY: number | null = null
  private lastTap: { x: number; y: number; time: number } | null = null

  private isPanButton(e: PointerLike): boolean {
    return e.button === 1 || e.button === 2
  }

  private resetPinchBaseline(): void {
    if (this.pointers.size < 2) {
      this.lastCentroidX = null
      this.lastCentroidY = null
      this.lastPinchDistance = 0
      return
    }
    const [a, b] = this.firstTwoPointers()
    this.lastCentroidX = (a.x + b.x) / 2
    this.lastCentroidY = (a.y + b.y) / 2
    this.lastPinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
  }

  private firstTwoPointers(): [TrackedPointer, TrackedPointer] {
    const it = this.pointers.values()
    return [it.next().value as TrackedPointer, it.next().value as TrackedPointer]
  }
}
