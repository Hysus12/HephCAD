// 輸入角色分配（Shapr3D 慣例：Apple Pencil 畫圖與選取、手指移動視角）。
//
//   筆 / 滑鼠左鍵：按下時由呼叫端（beginPrimary）決定角色——
//                 拖把手 = 操作、使用草圖工具 = 畫線、否則轉視角
//   手指（單指）：同樣問 beginPrimary（呼叫端決定手指能否畫圖）
//   雙指：拖曳平移、捏合縮放；快速點擊 = 復原
//   三指快速點擊：重做
//   滑鼠右鍵拖曳 = 旋轉、中鍵 = 平移、滾輪 = 縮放
//   輕點 = 選取（任何指標；拖曳距離與時間都很小）
//
// 防誤觸（手掌）：筆接觸中、或筆最近 PALM_WINDOW_MS 內有活動（含懸停）時，
// 新的觸控一律忽略；筆落下時已在螢幕上的觸控視為手掌、立即丟棄。
//
// 純邏輯、不碰 DOM，方便在 node 環境測試；DOM 綁定在 attach()。

export interface PointerLike {
  pointerId: number
  clientX: number
  clientY: number
  pointerType?: string
  button?: number
  buttons?: number
  /** 接觸面積（px）；iPadOS 對手指會回報，手掌明顯較大。 */
  width?: number
  height?: number
}

/**
 * 單一指標拖曳的角色：
 *   draw       呼叫端開始畫線（之後收到 primaryMove/End/Cancel）
 *   manipulate 呼叫端開始拖把手（同上）
 *   orbit/pan  由手勢層直接轉換成相機操作
 *   none       忽略這次拖曳（仍可成為 tap）
 */
export type PrimaryRole = 'draw' | 'manipulate' | 'orbit' | 'pan' | 'none'

export interface GestureCallbacks {
  orbit(dxPx: number, dyPx: number): void
  pan(dxPx: number, dyPx: number): void
  /** scale > 1 拉遠、< 1 拉近。 */
  dolly(scale: number): void
  /** tapCount：1 = 單擊、2 = 雙擊（雙擊前仍會先收到一次單擊）。 */
  tap(xPx: number, yPx: number, pointerType: string, tapCount: number): void
  beginPrimary(xPx: number, yPx: number, pointerType: string): PrimaryRole
  primaryMove(xPx: number, yPx: number): void
  primaryEnd(xPx: number, yPx: number): void
  /** 拖曳被取消（變成多指手勢、變成輕點、或指標被系統取消）。 */
  primaryCancel(): void
  /** 筆懸停（iPad M2+ 的 Apple Pencil）或滑鼠移動、沒有按下任何鍵。 */
  hover?(xPx: number, yPx: number, pointerType: string): void
  hoverEnd?(): void
  /** 多指快速點擊（2 = 復原、3 = 重做）。 */
  multiTap?(fingers: number): void
  /** 第一次看到筆輸入。 */
  penDetected?(): void
}

const TAP_MAX_MOVEMENT_PX = 6
const TAP_MAX_DURATION_MS = 350
const DOUBLE_TAP_MAX_INTERVAL_MS = 350
const DOUBLE_TAP_MAX_DISTANCE_PX = 30
const MULTI_TAP_MAX_DURATION_MS = 300
const MULTI_TAP_MAX_MOVEMENT_PX = 12
/** 筆活動後多久內的觸控視為手掌。 */
export const PALM_WINDOW_MS = 300
/** 筆「接觸中」但這麼久沒有任何筆事件 → 視為事件遺失，不再擋手指。 */
const PEN_STALE_MS = 2000
/** 接觸面積超過此值的觸控視為手掌。 */
const PALM_CONTACT_PX = 40
const WHEEL_DOLLY_SPEED = 0.0015
const PINCH_WHEEL_DOLLY_SPEED = 0.01

interface TrackedPointer {
  x: number
  y: number
  downX: number
  downY: number
  downTime: number
  type: string
  button: number
}

/** 一次「從第一指按下到全部放開」的觸控期間，用於多指點擊判斷。 */
interface Session {
  start: number
  maxPointers: number
  allTouch: boolean
  moved: boolean
}

export class GestureController {
  private readonly pointers = new Map<number, TrackedPointer>()
  /** 被判定為手掌的觸控：之後的事件全部忽略。 */
  private readonly rejected = new Set<number>()
  private primary: { id: number; role: PrimaryRole } | null = null
  private session: Session | null = null
  private multiTouchSession = false
  private lastPinchDistance = 0
  private lastCentroidX: number | null = null
  private lastCentroidY: number | null = null
  private lastTap: { x: number; y: number; time: number } | null = null
  private penDown = 0
  private lastPenTime = -Infinity
  private penSeen = false
  private hovering = false
  private detach: (() => void) | null = null

  constructor(
    private readonly callbacks: GestureCallbacks,
    private readonly now: () => number = () => performance.now(),
  ) {}

  onPointerDown(e: PointerLike): void {
    const type = e.pointerType ?? 'mouse'
    const now = this.now()
    this.purgeStalePen(now)

    if (type === 'pen') {
      this.notePen(now)
      this.penDown++
      this.rejectActiveTouches()
    } else if (type === 'touch' && this.isPalm(e, now)) {
      this.rejected.add(e.pointerId)
      return
    }

    this.endHover()
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      downTime: now,
      type,
      button: e.button ?? 0,
    })

    if (this.pointers.size === 1) {
      this.session = { start: now, maxPointers: 1, allTouch: type === 'touch', moved: false }
      let role: PrimaryRole
      if (type === 'mouse' && e.button === 2) role = 'orbit'
      else if (type === 'mouse' && e.button === 1) role = 'pan'
      else role = this.callbacks.beginPrimary(e.clientX, e.clientY, type)
      this.primary = { id: e.pointerId, role }
      return
    }

    // 第二指以上：取消進行中的畫線/操作，轉成多指導航
    if (this.session) {
      this.session.maxPointers = Math.max(this.session.maxPointers, this.pointers.size)
      if (type !== 'touch') this.session.allTouch = false
    }
    if (this.primary && (this.primary.role === 'draw' || this.primary.role === 'manipulate')) {
      this.callbacks.primaryCancel()
    }
    if (this.primary) this.primary.role = 'none'
    this.multiTouchSession = true
    this.resetPinchBaseline()
  }

  onPointerMove(e: PointerLike): void {
    const type = e.pointerType ?? 'mouse'
    if (this.rejected.has(e.pointerId)) return
    const p = this.pointers.get(e.pointerId)

    if (!p) {
      // 沒按下的筆/滑鼠移動 = 懸停
      // 懸停只用來偵測「有筆」，不延長手掌忽略期：筆懸在上方時另一隻手要能轉視角
      if (type === 'pen') this.notePen(this.now(), false)
      if ((type === 'pen' || type === 'mouse') && this.pointers.size === 0) {
        this.hovering = true
        this.callbacks.hover?.(e.clientX, e.clientY, type)
      }
      return
    }
    if (type === 'pen') this.notePen(this.now())

    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (
      this.session &&
      Math.hypot(e.clientX - p.downX, e.clientY - p.downY) > MULTI_TAP_MAX_MOVEMENT_PX
    ) {
      this.session.moved = true
    }

    if (this.pointers.size === 1 && this.primary?.id === e.pointerId) {
      if (dx === 0 && dy === 0) return
      switch (this.primary.role) {
        case 'draw':
        case 'manipulate':
          this.callbacks.primaryMove(e.clientX, e.clientY)
          break
        case 'orbit':
          this.callbacks.orbit(dx, dy)
          break
        case 'pan':
          this.callbacks.pan(dx, dy)
          break
        case 'none':
          break
      }
      return
    }

    if (this.pointers.size >= 2) this.navigateMultiTouch()
  }

  onPointerUp(e: PointerLike): void {
    this.release(e, false)
  }

  onPointerCancel(e: PointerLike): void {
    this.release(e, true)
  }

  onPointerLeave(): void {
    this.endHover()
  }

  onWheel(deltaY: number, isPinch: boolean): void {
    const speed = isPinch ? PINCH_WHEEL_DOLLY_SPEED : WHEEL_DOLLY_SPEED
    this.callbacks.dolly(Math.exp(deltaY * speed))
  }

  /** 綁定 DOM 事件；先 detach 舊的。 */
  attach(el: HTMLElement): void {
    this.detach?.()

    const down = (e: PointerEvent) => {
      this.onPointerDown(e)
      if (this.pointers.has(e.pointerId)) {
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          // 合成事件（測試）或已釋放的 pointer 沒有 capture 可設，忽略。
        }
      }
    }
    const move = (e: PointerEvent) => this.onPointerMove(e)
    const up = (e: PointerEvent) => this.onPointerUp(e)
    const cancel = (e: PointerEvent) => this.onPointerCancel(e)
    const leave = () => this.onPointerLeave()
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      this.onWheel(e.deltaY, e.ctrlKey)
    }
    const contextmenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', contextmenu)

    this.detach = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', contextmenu)
    }
  }

  dispose(): void {
    this.detach?.()
    this.detach = null
    this.pointers.clear()
    this.rejected.clear()
  }

  // ---- 內部 ----

  private release(e: PointerLike, cancelled: boolean): void {
    if (this.rejected.delete(e.pointerId)) return
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    this.pointers.delete(e.pointerId)
    const now = this.now()
    if (p.type === 'pen') {
      this.penDown = Math.max(0, this.penDown - 1)
      this.notePen(now)
    }

    if (this.primary?.id === e.pointerId) {
      const role = this.primary.role
      this.primary = null
      const moved = Math.hypot(e.clientX - p.downX, e.clientY - p.downY)
      const isTap =
        !cancelled &&
        !this.multiTouchSession &&
        p.button === 0 &&
        moved <= TAP_MAX_MOVEMENT_PX &&
        now - p.downTime <= TAP_MAX_DURATION_MS

      if (role === 'draw' || role === 'manipulate') {
        if (isTap || cancelled) this.callbacks.primaryCancel()
        else this.callbacks.primaryEnd(e.clientX, e.clientY)
      }
      if (isTap) this.emitTap(e.clientX, e.clientY, p.type, now)
    }

    if (this.pointers.size >= 1) {
      // 剩餘手指繼續操作：重設基準避免跳動
      this.resetPinchBaseline()
      return
    }

    const session = this.session
    if (
      !cancelled &&
      session &&
      session.allTouch &&
      session.maxPointers >= 2 &&
      !session.moved &&
      now - session.start <= MULTI_TAP_MAX_DURATION_MS
    ) {
      this.callbacks.multiTap?.(session.maxPointers)
    }
    this.session = null
    this.multiTouchSession = false
  }

  private emitTap(x: number, y: number, type: string, now: number): void {
    const isDouble =
      this.lastTap !== null &&
      now - this.lastTap.time <= DOUBLE_TAP_MAX_INTERVAL_MS &&
      Math.hypot(x - this.lastTap.x, y - this.lastTap.y) <= DOUBLE_TAP_MAX_DISTANCE_PX
    this.lastTap = isDouble ? null : { x, y, time: now }
    this.callbacks.tap(x, y, type, isDouble ? 2 : 1)
  }

  private isPalm(e: PointerLike, now: number): boolean {
    // 筆「接觸中」才算；事件遺失（pointerup 沒送達）時，過久沒有筆活動就視為已抬起，避免手指永遠被忽略
    if (this.penDown > 0 && now - this.lastPenTime < PEN_STALE_MS) return true
    if (now - this.lastPenTime < PALM_WINDOW_MS) return true
    return (e.width ?? 0) > PALM_CONTACT_PX || (e.height ?? 0) > PALM_CONTACT_PX
  }

  /** 筆的 pointerup/cancel 沒送達（Safari 偶發）：久未活動的「按著的筆」當作已抬起。 */
  private purgeStalePen(now: number): void {
    if (this.penDown === 0 || now - this.lastPenTime < PEN_STALE_MS) return
    for (const [id, p] of this.pointers) {
      if (p.type !== 'pen') continue
      if (this.primary?.id === id) {
        if (this.primary.role === 'draw' || this.primary.role === 'manipulate') this.callbacks.primaryCancel()
        this.primary = null
      }
      this.pointers.delete(id)
    }
    this.penDown = 0
    this.session = null
    this.multiTouchSession = false
  }

  /** 筆落下時已在螢幕上的觸控 = 先擱上去的手掌：停止它們造成的導航並忽略。 */
  private rejectActiveTouches(): void {
    let changed = false
    for (const [id, p] of this.pointers) {
      if (p.type !== 'touch') continue
      if (this.primary?.id === id) {
        if (this.primary.role === 'draw' || this.primary.role === 'manipulate') {
          this.callbacks.primaryCancel()
        }
        this.primary = null
      }
      this.pointers.delete(id)
      this.rejected.add(id)
      changed = true
    }
    if (changed) {
      this.multiTouchSession = false
      this.session = null
      this.resetPinchBaseline()
    }
  }

  private notePen(now: number, contact = true): void {
    if (contact) this.lastPenTime = now
    if (!this.penSeen) {
      this.penSeen = true
      this.callbacks.penDetected?.()
    }
  }

  private endHover(): void {
    if (!this.hovering) return
    this.hovering = false
    this.callbacks.hoverEnd?.()
  }

  private navigateMultiTouch(): void {
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
