import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // emscripten 產物不能被 esbuild 預打包（內含 wasm 定位邏輯）
  optimizeDeps: {
    exclude: ['opencascade.js'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
