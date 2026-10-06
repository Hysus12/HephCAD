import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // OCCT wasm 有 50MB，離線快取是 iPad 回訪體驗的關鍵
      workbox: {
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,webp}'],
      },
      manifest: {
        name: 'HephCAD',
        short_name: 'HephCAD',
        description: 'Open-source, iPad-first B-rep direct modeling CAD',
        display: 'standalone',
        orientation: 'any',
        background_color: '#141416',
        theme_color: '#141416',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
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
