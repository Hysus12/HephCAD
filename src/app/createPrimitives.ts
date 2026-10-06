import { useAppStore } from '../state/appStore.ts'
import { documentController } from './services.ts'

// 示範用 primitive（M4 後由草圖→擠出取代，保留為快速測試工具）。
// 一律經 DocumentController 走 journal。

const PLACEMENT_STEP = 140

export async function createBox(): Promise<void> {
  const at = nextPlacement()
  await documentController.apply({
    kind: 'createBox',
    bodyId: 0,
    name: '方塊',
    dx: 100,
    dy: 100,
    dz: 100,
    at,
  })
}

export async function createCylinder(): Promise<void> {
  const at = nextPlacement()
  await documentController.apply({
    kind: 'createCylinder',
    bodyId: 0,
    name: '圓柱',
    radius: 50,
    height: 100,
    at,
  })
}

function nextPlacement(): [number, number, number] {
  const n = useAppStore.getState().bodies.length
  // 沿 X 正負交錯排開，避免疊在原點
  const offset = Math.ceil(n / 2) * PLACEMENT_STEP * (n % 2 === 0 ? 1 : -1)
  return [offset, 0, 0]
}
