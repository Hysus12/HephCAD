import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GestureController,
  PALM_WINDOW_MS,
  type GestureCallbacks,
  type PointerLike,
  type PrimaryRole,
} from './gestures.ts'

type Mocked = { [K in keyof Required<GestureCallbacks>]: ReturnType<typeof vi.fn> }

function setup(roleFor: (type: string) => PrimaryRole = () => 'orbit') {
  const clock = { now: 0 }
  const cb = {
    orbit: vi.fn(),
    pan: vi.fn(),
    dolly: vi.fn(),
    tap: vi.fn(),
    beginPrimary: vi.fn((_x: number, _y: number, type: string) => roleFor(type)),
    primaryMove: vi.fn(),
    primaryEnd: vi.fn(),
    primaryCancel: vi.fn(),
    hover: vi.fn(),
    hoverEnd: vi.fn(),
    multiTap: vi.fn(),
    penDetected: vi.fn(),
  } satisfies Mocked
  const g = new GestureController(cb as unknown as GestureCallbacks, () => clock.now)
  return { g, cb, clock }
}

const ev = (
  id: number,
  x: number,
  y: number,
  pointerType = 'touch',
  extra: Partial<PointerLike> = {},
): PointerLike => ({ pointerId: id, clientX: x, clientY: y, pointerType, button: 0, ...extra })

/** 依序按下→移動→放開（每步推進時間）。 */
function drag(
  g: GestureController,
  clock: { now: number },
  id: number,
  type: string,
  from: [number, number],
  to: [number, number],
) {
  g.onPointerDown(ev(id, from[0], from[1], type))
  clock.now += 50
  g.onPointerMove(ev(id, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, type))
  clock.now += 50
  g.onPointerMove(ev(id, to[0], to[1], type))
  clock.now += 400 // 超過 tap 時限
  g.onPointerUp(ev(id, to[0], to[1], type))
}

describe('單一指標的角色由 beginPrimary 決定', () => {
  it('orbit：拖曳轉成相機旋轉', () => {
    const { g, cb, clock } = setup(() => 'orbit')
    drag(g, clock, 1, 'touch', [100, 100], [140, 100])
    expect(cb.orbit).toHaveBeenCalled()
    const total = cb.orbit.mock.calls.reduce((s, c) => s + (c[0] as number), 0)
    expect(total).toBe(40)
    expect(cb.primaryMove).not.toHaveBeenCalled()
  })

  it('draw：移動與結束交給呼叫端，不轉視角', () => {
    const { g, cb, clock } = setup(() => 'draw')
    drag(g, clock, 1, 'pen', [0, 0], [50, 50])
    expect(cb.beginPrimary).toHaveBeenCalledWith(0, 0, 'pen')
    expect(cb.primaryMove).toHaveBeenCalledTimes(2)
    expect(cb.primaryEnd).toHaveBeenCalledWith(50, 50)
    expect(cb.orbit).not.toHaveBeenCalled()
  })

  it('draw 但其實是輕點：取消畫線、改發 tap（選取）', () => {
    const { g, cb, clock } = setup(() => 'draw')
    g.onPointerDown(ev(1, 10, 10, 'pen'))
    clock.now += 80
    g.onPointerUp(ev(1, 12, 11, 'pen'))
    expect(cb.primaryCancel).toHaveBeenCalledTimes(1)
    expect(cb.primaryEnd).not.toHaveBeenCalled()
    expect(cb.tap).toHaveBeenCalledWith(12, 11, 'pen', 1)
  })

  it('滑鼠右鍵拖曳旋轉、中鍵平移，不問 beginPrimary', () => {
    const { g, cb } = setup(() => 'draw')
    g.onPointerDown(ev(1, 0, 0, 'mouse', { button: 2 }))
    g.onPointerMove(ev(1, 10, 0, 'mouse'))
    g.onPointerUp(ev(1, 10, 0, 'mouse', { button: 2 }))
    g.onPointerDown(ev(2, 0, 0, 'mouse', { button: 1 }))
    g.onPointerMove(ev(2, 0, 8, 'mouse'))
    expect(cb.beginPrimary).not.toHaveBeenCalled()
    expect(cb.orbit).toHaveBeenCalledWith(10, 0)
    expect(cb.pan).toHaveBeenCalledWith(0, 8)
  })

  it('右鍵點一下不算選取', () => {
    const { g, cb } = setup()
    g.onPointerDown(ev(1, 5, 5, 'mouse', { button: 2 }))
    g.onPointerUp(ev(1, 5, 5, 'mouse', { button: 2 }))
    expect(cb.tap).not.toHaveBeenCalled()
  })
})

describe('多指', () => {
  it('第二指加入：取消畫線，改為雙指平移/縮放', () => {
    const { g, cb } = setup(() => 'draw')
    g.onPointerDown(ev(1, 100, 100))
    g.onPointerMove(ev(1, 110, 100))
    g.onPointerDown(ev(2, 200, 100))
    expect(cb.primaryCancel).toHaveBeenCalledTimes(1)
    g.onPointerMove(ev(1, 50, 100))
    g.onPointerMove(ev(2, 250, 100))
    const scale = cb.dolly.mock.calls.reduce((s, c) => s * (c[0] as number), 1)
    expect(scale).toBeLessThan(1) // 手指張開 = 拉近
  })

  it('雙指快速點擊 → multiTap(2)、三指 → multiTap(3)', () => {
    const { g, cb, clock } = setup()
    g.onPointerDown(ev(1, 100, 100))
    g.onPointerDown(ev(2, 160, 100))
    clock.now += 120
    g.onPointerUp(ev(1, 100, 100))
    g.onPointerUp(ev(2, 160, 100))
    expect(cb.multiTap).toHaveBeenLastCalledWith(2)

    clock.now += 1000
    g.onPointerDown(ev(3, 100, 100))
    g.onPointerDown(ev(4, 150, 100))
    g.onPointerDown(ev(5, 200, 100))
    clock.now += 150
    for (const id of [3, 4, 5]) g.onPointerUp(ev(id, 100 + (id - 3) * 50, 100))
    expect(cb.multiTap).toHaveBeenLastCalledWith(3)
    expect(cb.tap).not.toHaveBeenCalled()
  })

  it('捏合或按太久不算多指點擊', () => {
    const { g, cb, clock } = setup()
    g.onPointerDown(ev(1, 100, 100))
    g.onPointerDown(ev(2, 160, 100))
    g.onPointerMove(ev(2, 220, 100)) // 移動了 60px
    g.onPointerUp(ev(1, 100, 100))
    g.onPointerUp(ev(2, 220, 100))
    g.onPointerDown(ev(3, 100, 100))
    g.onPointerDown(ev(4, 160, 100))
    clock.now += 600
    g.onPointerUp(ev(3, 100, 100))
    g.onPointerUp(ev(4, 160, 100))
    expect(cb.multiTap).not.toHaveBeenCalled()
  })
})

describe('Apple Pencil 防誤觸', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => {
    s = setup((type) => (type === 'pen' ? 'draw' : 'orbit'))
  })

  it('第一次筆輸入通知 penDetected（只一次）', () => {
    s.g.onPointerMove(ev(1, 0, 0, 'pen', { buttons: 0 }))
    s.g.onPointerDown(ev(1, 0, 0, 'pen'))
    expect(s.cb.penDetected).toHaveBeenCalledTimes(1)
  })

  it('筆接觸中的觸控被忽略（手掌）', () => {
    s.g.onPointerDown(ev(1, 0, 0, 'pen'))
    s.g.onPointerDown(ev(2, 300, 300, 'touch'))
    s.g.onPointerMove(ev(2, 340, 300, 'touch'))
    s.g.onPointerMove(ev(1, 20, 0, 'pen'))
    expect(s.cb.orbit).not.toHaveBeenCalled()
    expect(s.cb.primaryCancel).not.toHaveBeenCalled() // 筆劃沒被打斷
    expect(s.cb.primaryMove).toHaveBeenCalledWith(20, 0)
  })

  it(`筆離開後 ${PALM_WINDOW_MS}ms 內的觸控被忽略，之後恢復`, () => {
    s.g.onPointerDown(ev(1, 0, 0, 'pen'))
    s.clock.now += 400
    s.g.onPointerUp(ev(1, 50, 0, 'pen'))
    s.clock.now += PALM_WINDOW_MS - 50
    s.g.onPointerDown(ev(2, 300, 300, 'touch'))
    s.g.onPointerMove(ev(2, 330, 300, 'touch'))
    expect(s.cb.orbit).not.toHaveBeenCalled()
    s.g.onPointerUp(ev(2, 330, 300, 'touch'))

    s.clock.now += 200
    s.g.onPointerDown(ev(3, 300, 300, 'touch'))
    s.g.onPointerMove(ev(3, 330, 300, 'touch'))
    expect(s.cb.orbit).toHaveBeenCalled()
  })

  it('筆懸停時落下的觸控被忽略（iPad M2+ 懸停）', () => {
    s.clock.now = 10_000
    s.g.onPointerMove(ev(1, 0, 0, 'pen', { buttons: 0 }))
    expect(s.cb.hover).toHaveBeenCalledWith(0, 0, 'pen')
    s.clock.now += 100
    s.g.onPointerDown(ev(2, 300, 300, 'touch'))
    s.g.onPointerMove(ev(2, 330, 300, 'touch'))
    expect(s.cb.orbit).not.toHaveBeenCalled()
  })

  it('先擱上的手掌：筆落下時停止它的導航、之後的移動都忽略', () => {
    s.g.onPointerDown(ev(2, 300, 300, 'touch'))
    s.g.onPointerMove(ev(2, 310, 300, 'touch'))
    expect(s.cb.orbit).toHaveBeenCalledTimes(1)
    s.g.onPointerDown(ev(1, 0, 0, 'pen'))
    s.g.onPointerMove(ev(2, 400, 300, 'touch'))
    s.g.onPointerMove(ev(1, 30, 0, 'pen'))
    expect(s.cb.orbit).toHaveBeenCalledTimes(1)
    expect(s.cb.primaryMove).toHaveBeenCalledWith(30, 0)
  })

  it('接觸面積很大的觸控視為手掌', () => {
    s.g.onPointerDown(ev(2, 300, 300, 'touch', { width: 80, height: 70 }))
    s.g.onPointerMove(ev(2, 330, 300, 'touch'))
    expect(s.cb.beginPrimary).not.toHaveBeenCalled()
    expect(s.cb.orbit).not.toHaveBeenCalled()
  })
})

describe('tap / 雙擊 / 滾輪', () => {
  it('快速兩次輕點 → tapCount 1 後接 2；太遠或太久不算', () => {
    const { g, cb, clock } = setup()
    g.onPointerDown(ev(1, 100, 100))
    clock.now += 50
    g.onPointerUp(ev(1, 100, 100))
    g.onPointerDown(ev(2, 104, 102))
    clock.now += 150
    g.onPointerUp(ev(2, 104, 102))
    clock.now += 800
    g.onPointerDown(ev(3, 104, 102))
    g.onPointerUp(ev(3, 104, 102))
    clock.now += 100
    g.onPointerDown(ev(4, 300, 300))
    g.onPointerUp(ev(4, 300, 300))
    expect(cb.tap.mock.calls.map((c) => c[3])).toEqual([1, 2, 1, 1])
  })

  it('滾輪 → dolly；觸控板捏合速度較快', () => {
    const { g, cb } = setup()
    g.onWheel(100, false)
    g.onWheel(100, true)
    expect(cb.dolly.mock.calls[0][0]).toBeGreaterThan(1)
    expect(cb.dolly.mock.calls[1][0]).toBeGreaterThan(cb.dolly.mock.calls[0][0] as number)
  })

  it('指標被系統取消：畫線取消、不發 tap', () => {
    const { g, cb } = setup(() => 'draw')
    g.onPointerDown(ev(1, 0, 0, 'pen'))
    g.onPointerCancel(ev(1, 0, 0, 'pen'))
    expect(cb.primaryCancel).toHaveBeenCalledTimes(1)
    expect(cb.tap).not.toHaveBeenCalled()
  })
})
