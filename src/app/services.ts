// 非 React 的長生命週期單例（viewport、kernel、文件控制器）。
// 不放進 zustand，避免 devtools 序列化與 React 誤觸 re-render。

import { DocumentController } from '../doc/DocumentController.ts'
import type { KernelClient } from '../kernel/KernelClient.ts'
import type { Viewport } from '../viewport/Viewport.ts'

export const services: {
  viewport: Viewport | null
  kernel: KernelClient | null
} = {
  viewport: null,
  kernel: null,
}

/** 所有幾何變更的唯一入口（journal + undo/redo + 自動存檔）。 */
export const documentController = new DocumentController({
  kernel: () => services.kernel,
  viewport: () => services.viewport,
})

// dev 環境暴露給瀏覽器 console 除錯用
if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).__heph = services
  ;(globalThis as Record<string, unknown>).__hephDoc = documentController
}
