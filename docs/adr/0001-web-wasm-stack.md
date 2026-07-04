# ADR 0001：Web + WASM 技術棧

日期：2026-07-03　狀態：已接受

## 背景

前一版 HephCAD 走 Swift 原生 + OCCT iOS 交叉編譯，卡在工具鏈（Xcode iOS destination、OCCT 靜態庫建置），於 2026-07-03 重置。專案目標改為「開源版 Shapr3D」：iPad 優先、觸控/Pencil 好上手的 B-rep 直接建模 CAD。

## 決策

- TypeScript + Vite + React（面板 UI）+ Zustand。
- Three.js（WebGL2）渲染；日後可評估 WebGPU。
- OCCT 編譯成 WebAssembly（opencascade.js 路線），只在 Web Worker 內執行。
- iPad 以 PWA/Safari 使用；日後需要時再包原生殼（WKWebView/Capacitor）。

## 理由

- 開發迭代與開源貢獻門檻遠低於原生（瀏覽器即可跑，不需 Mac + Xcode + 自建 OCCT）。
- chili3d 等專案已證明 OCCT-wasm 路線可行。
- 主執行緒不碰 wasm ⇒ UI 幀率與 kernel 崩潰隔離。

## 代價

- 效能上限低於原生（wasm 單執行緒起步、Safari 記憶體上限）。
- 手勢細膩度、離線體驗略遜原生；由 PWA 與 Pointer Events 盡量補齊。

## Kernel build 策略

先從 opencascade.js 現成 npm 套件起步（M1 驗證流程），之後改為自訂 build（裁剪 toolkit、鎖定 OCCT 版本、記錄 build script 進 repo），目標 wasm gzip < 15MB。
