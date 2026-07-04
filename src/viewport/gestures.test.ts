import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GestureController, type GestureCallbacks } from './gestures.ts'

function makeController(nowRef: { value: number }) {
  const callbacks: GestureCallbacks = {
    orbit: vi.fn(),
    pan: vi.fn(),
    dolly: vi.fn(),
    tap: vi.fn(),
  }
  const controller = new GestureController(callbacks, () => nowRef.value)
  return { callbacks, controller }
}

describe('GestureController', () => {
  const nowRef = { value: 0 }

  beforeEach(() => {
    nowRef.value = 0
  })

  it('單指拖曳 → orbit', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerMove({ pointerId: 1, clientX: 110, clientY: 95 })
    expect(callbacks.orbit).toHaveBeenCalledWith(10, -5)
    expect(callbacks.pan).not.toHaveBeenCalled()
  })

  it('滑鼠右鍵拖曳 → pan', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, pointerType: 'mouse', button: 2 })
    controller.onPointerMove({ pointerId: 1, clientX: 8, clientY: 4 })
    expect(callbacks.pan).toHaveBeenCalledWith(8, 4)
    expect(callbacks.orbit).not.toHaveBeenCalled()
  })

  it('雙指捏合 → dolly（分開 = 拉近，scale < 1）', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerDown({ pointerId: 2, clientX: 200, clientY: 100, pointerType: 'touch' })
    // 兩指distance 100 → 200
    controller.onPointerMove({ pointerId: 1, clientX: 50, clientY: 100 })
    controller.onPointerMove({ pointerId: 2, clientX: 250, clientY: 100 })

    const scales = (callbacks.dolly as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as number)
    expect(scales.length).toBeGreaterThan(0)
    const total = scales.reduce((a, b) => a * b, 1)
    expect(total).toBeCloseTo(0.5, 5)
    expect(callbacks.orbit).not.toHaveBeenCalled()
  })

  it('雙指同向移動 → pan', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerDown({ pointerId: 2, clientX: 200, clientY: 100, pointerType: 'touch' })
    controller.onPointerMove({ pointerId: 1, clientX: 120, clientY: 110 })
    controller.onPointerMove({ pointerId: 2, clientX: 220, clientY: 110 })

    const panCalls = (callbacks.pan as ReturnType<typeof vi.fn>).mock.calls
    const totalX = panCalls.reduce((a, c) => a + (c[0] as number), 0)
    const totalY = panCalls.reduce((a, c) => a + (c[1] as number), 0)
    expect(totalX).toBeCloseTo(20, 5)
    expect(totalY).toBeCloseTo(10, 5)
  })

  it('快速輕點 → tap；拖曳後放開不觸發 tap', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 50, clientY: 60, pointerType: 'touch' })
    nowRef.value = 120
    controller.onPointerUp({ pointerId: 1, clientX: 52, clientY: 61 })
    expect(callbacks.tap).toHaveBeenCalledWith(52, 61, 'touch', 1)

    controller.onPointerDown({ pointerId: 2, clientX: 50, clientY: 60, pointerType: 'touch' })
    controller.onPointerMove({ pointerId: 2, clientX: 150, clientY: 60 })
    nowRef.value = 240
    controller.onPointerUp({ pointerId: 2, clientX: 150, clientY: 60 })
    expect(callbacks.tap).toHaveBeenCalledTimes(1)
  })

  it('雙指手勢結束不觸發 tap', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerDown({ pointerId: 2, clientX: 105, clientY: 100, pointerType: 'touch' })
    controller.onPointerUp({ pointerId: 2, clientX: 105, clientY: 100 })
    controller.onPointerUp({ pointerId: 1, clientX: 100, clientY: 100 })
    expect(callbacks.tap).not.toHaveBeenCalled()
  })

  it('滾輪 → dolly；一般滾動與觸控板捏合速度不同', () => {
    const { callbacks, controller } = makeController(nowRef)
    controller.onWheel(100, false)
    controller.onWheel(100, true)
    const calls = (callbacks.dolly as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBeGreaterThan(1) // 向下滾 = 拉遠
    expect(calls[1][0]).toBeGreaterThan(calls[0][0] as number)
  })
})

describe('雙擊偵測', () => {
  const nowRef = { value: 0 }

  it('快速兩次輕點 → tapCount 1 後接 2', () => {
    nowRef.value = 0
    const { callbacks, controller } = makeController(nowRef)
    const tapMock = callbacks.tap as ReturnType<typeof vi.fn>

    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    nowRef.value = 50
    controller.onPointerUp({ pointerId: 1, clientX: 100, clientY: 100 })
    controller.onPointerDown({ pointerId: 2, clientX: 105, clientY: 102, pointerType: 'touch' })
    nowRef.value = 200
    controller.onPointerUp({ pointerId: 2, clientX: 105, clientY: 102 })

    expect(tapMock.mock.calls.map((c) => c[3])).toEqual([1, 2])
  })

  it('間隔太久或距離太遠不算雙擊', () => {
    nowRef.value = 0
    const { callbacks, controller } = makeController(nowRef)
    const tapMock = callbacks.tap as ReturnType<typeof vi.fn>

    controller.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerUp({ pointerId: 1, clientX: 100, clientY: 100 })
    nowRef.value = 800 // 超過間隔
    controller.onPointerDown({ pointerId: 2, clientX: 100, clientY: 100, pointerType: 'touch' })
    controller.onPointerUp({ pointerId: 2, clientX: 100, clientY: 100 })
    nowRef.value = 900
    controller.onPointerDown({ pointerId: 3, clientX: 300, clientY: 300, pointerType: 'touch' })
    controller.onPointerUp({ pointerId: 3, clientX: 300, clientY: 300 })

    expect(tapMock.mock.calls.map((c) => c[3])).toEqual([1, 1, 1])
  })
})
