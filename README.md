# HephCAD

開源、iPad 優先、觸控與 Apple Pencil 好上手的 B-rep 直接建模 CAD。UX 對標 Shapr3D 的核心體驗：**在任意面上畫草圖 → 拖曳擠出 → 自動布林**。

技術棧：TypeScript + Vite + React + Three.js，幾何核心為 OCCT 編譯成 WebAssembly（在 Web Worker 內執行）。iPad 以 PWA 使用。細節見 [docs/adr/](docs/adr/)。

> 本 repo 於 2026-07-03 重新開始（見 [docs/RESTART_NOTE.md](docs/RESTART_NOTE.md)）。

## 開發

```bash
npm install
npm run dev        # 開發伺服器（--host，iPad 可連同網段 IP）
npm run test       # 單元測試（Vitest）
npm run lint       # ESLint
npm run typecheck  # tsc
npm run build      # 產出 dist/
```

## 里程碑

- [x] **M0 基建**：scaffold、Three.js 場景、觸控相機（單指旋轉、雙指平移縮放）、ViewCube、CI
- [x] **M1 Kernel 通道**：OCCT wasm worker、primitive 建模、tessellation 上屏（含 face/edge 拓撲映射）
- [x] **M2 選取**：face/edge/body picking 與高亮、項目面板（顯示/隱藏/刪除）、縫線邊過濾
- [ ] **M3 草圖**：面上草圖、直線/矩形/圓/圓弧、snapping、閉合區域偵測
- [ ] **M4 拖曳擠出 + 布林**（產品核心驗收）
- [ ] **M5 文件與歷程**：journal undo/redo、OPFS 自動存檔、STEP 匯入/匯出
- [ ] **M6 修改工具**：移動/複製、圓角/倒角、抽殼、偏移面
- [ ] **M7 打磨**：量測、剖面、PWA、i18n
- [ ] **M8 開源化**：文件、demo、授權定案

## 手勢

| 輸入 | 動作 |
|---|---|
| 單指 / 滑鼠左鍵拖曳 | 旋轉視角 |
| 雙指移動 | 平移 |
| 雙指捏合 / 滾輪 | 縮放 |
| 點 ViewCube 面 | 切換標準視角（動畫） |
| 輕點 | 選取 face/edge（累加，再點取消；點空白清空） |
| 雙擊 | 選取整個 body |
