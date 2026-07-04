import { useAppStore } from '../state/appStore.ts'
import { services } from './services.ts'

// M1 示範用的 primitive 建立：交錯排開避免疊在原點。
// M4 之後由「畫草圖 → 擠出」取代，這裡會退役成除錯工具。

const PLACEMENT_STEP = 140

export async function createBox(): Promise<void> {
  const { kernel, viewport } = services
  if (!kernel || !viewport) return
  const at = nextPlacement()
  const t0 = performance.now()
  const body = await kernel.makeBox(100, 100, 100, at)
  viewport.addBody(body.bodyId, body.mesh)
  registerBody(body.bodyId, `方塊 ${body.bodyId}`, performance.now() - t0)
}

export async function createCylinder(): Promise<void> {
  const { kernel, viewport } = services
  if (!kernel || !viewport) return
  const at = nextPlacement()
  const t0 = performance.now()
  const body = await kernel.makeCylinder(50, 100, at)
  viewport.addBody(body.bodyId, body.mesh)
  registerBody(body.bodyId, `圓柱 ${body.bodyId}`, performance.now() - t0)
}

function nextPlacement(): [number, number, number] {
  const n = useAppStore.getState().bodies.length
  // 螺旋狀排開：0 在原點，之後沿 X 正負交錯
  const offset = Math.ceil(n / 2) * PLACEMENT_STEP * (n % 2 === 0 ? 1 : -1)
  return [offset, 0, 0]
}

function registerBody(bodyId: number, name: string, elapsedMs: number): void {
  useAppStore.getState().addBody({ bodyId, name, visible: true })
  console.info(`[kernel] ${name} 建立+網格化 ${elapsedMs.toFixed(0)}ms`)
}
