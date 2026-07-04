// 非 React 的長生命週期單例（viewport、kernel）。
// 不放進 zustand，避免 devtools 序列化與 React 誤觸 re-render。

import type { KernelClient } from '../kernel/KernelClient.ts'
import type { Viewport } from '../viewport/Viewport.ts'

export const services: {
  viewport: Viewport | null
  kernel: KernelClient | null
} = {
  viewport: null,
  kernel: null,
}
