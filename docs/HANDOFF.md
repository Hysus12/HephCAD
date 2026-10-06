# 交接紀錄：Pencil-first UX 重構

最後更新：2026-10-06　分支：`ux-pencil-first`（尚未開 PR、尚未合併 `main`）

> 給接手的人/模型：先讀這份，再讀 [architecture.md](architecture.md)（注意其中「Life of a drag-extrude」一節**已過時**，見待辦 #1）。

## 背景與目標

使用者回饋：體驗「跟 Shapr3D 差很多」，功能不足、操作不直覺，**尤其是 iPad + Apple Pencil**。
診斷：問題不在個別功能，而在互動模型——舊版是「模式式」草圖（按草圖鈕 → 相機轉正 → 換工具列 → 畫 → 按 ✓ → 相機轉回）。Shapr3D 的核心規則：

1. **Pencil 畫圖與選取、手指只移動視角**（分工固定，所以不需要模式）
2. **免模式繪圖**：筆落在面上就畫在那個面、落在空白處就畫在地面，相機不動
3. **選取 → 出現箭頭把手 → 拖把手**修改；拖曳時有即時尺寸，放開後點尺寸可輸入精確值
4. **兩指點擊復原、三指點擊重做**

## 這個分支已完成（皆已驗證）

| 項目 | 主要檔案 | 驗證 |
|---|---|---|
| 草圖成為文件實體（每筆畫線一個 journal op，可逐筆 undo、存檔保留、可刪線） | `doc/journal.ts`（`sketch` op）、`doc/sketches.ts`（`deriveSketches` 純函式推導）、`doc/DocumentController.ts`（`syncSketches`、`sketchFor`） | 單元測試 + 瀏覽器 |
| 已擠出的區域自動隱藏（以 `regionKey` 面積+形心指紋比對） | `doc/sketches.ts`、`viewport/SketchLayer.ts` | 單元測試 |
| 輸入角色分配：筆/滑鼠左鍵畫、手指轉視角（未偵測到筆前手指可畫）、滑鼠右鍵旋轉中鍵平移 | `viewport/gestures.ts`（`beginPrimary` 回傳角色） | 17 個單元測試 |
| 防誤觸：筆接觸中/最近 300ms 內（含懸停）的觸控忽略；筆落下時已在螢幕上的觸控丟棄；大接觸面積丟棄 | `viewport/gestures.ts` | 單元測試（**未在實機驗證**） |
| 兩指點擊 = 復原、三指 = 重做 | `gestures.ts` → `Viewport` → `ViewportHost.undo/redo` | 單元測試 + 瀏覽器 |
| 第一次偵測到筆：自動切到直線工具＋提示 | `state/appStore.ts`（`setPencilDetected`） | 瀏覽器 |
| 免模式繪圖：落點決定平面（進行中圓弧 → 既有草圖區域 → 模型平面 → 地面），曲面上提示不能畫 | `viewport/Viewport.ts`（`drawTargetAt`）、`viewport/DrawController.ts`、`sketch/plane.ts` | 瀏覽器 |
| 在面上畫圖時吸附模型頂點與直線邊中點 | `sketch/snapping.ts`（`extraPoints`）、`viewport/meshGeometry.ts` | 單元測試 |
| 筆懸停顯示落筆會吸附的位置 | `DrawController.hover` | 僅程式路徑，未實機驗證 |
| 箭頭把手：區域擠出、平面推拉、三軸移動、圓角/倒角/抽殼 | `viewport/HandleLayer.ts`、`Viewport.computeHandles/beginManipulation` | 擠出、推拉已在瀏覽器驗證 |
| **新操作：推拉面**（平面沿法線長出/壓入） | `kernel/worker.ts`（`pushPullShape`）、journal `pushPull` op | 瀏覽器（體積精確） |
| 布林後合併共面面（不再有接縫） | `worker.ts`（`unifySameDomain`） | 拉高方塊後仍是 6 面 12 邊 |
| 即時尺寸標籤＋放開後點擊輸入精確值（數字鍵盤） | `ui/DimensionOverlay.tsx`、`DocumentController.amendLast`、`ViewportHost.resizeLastSketchCurve` | 擠出 103 → 輸入 40，體積 320,000 精確 |
| 拖曳數值 1mm 吸附（關閉吸附時 0.1mm） | `Viewport.updateManipulation` | 瀏覽器 |
| 減料預覽為紅色、穿透顯示 | `viewport/ExtrudePreview.ts` | — |
| 常駐工具列（選取/直線/圓弧/矩形/圓＋新增），移除三個無作用的佔位按鈕 | `ui/Toolbar.tsx` | 瀏覽器 |
| 常駐復原/重做列、歷程面板改為可收合 | `ui/UndoBar.tsx`、`ui/HistoryPanel.tsx` | 瀏覽器 |
| 情境列依選取類型（區域/線/面/邊/主體）顯示動作；正視、刪除 | `ui/ContextBar.tsx`、`app/viewportHost.ts`（`deleteSelection`） | 部分 |
| 項目面板列出草圖（顯示/隱藏/刪除/點選整張） | `ui/ItemsPanel.tsx` | 瀏覽器 |
| 鍵盤：V/L/A/R/C 切工具、Esc、Delete、⌘Z/⇧⌘Z | `App.tsx` | — |
| 提示訊息（toast） | `ui/Toast.tsx` | 瀏覽器 |

刪除的檔案（被取代）：`SketchSession.ts`、`SketchRenderer.ts`、`SketchToolbar.tsx`、`ExtrudeHint.tsx`、`app/sketchActions.ts`。

檢查狀態：`tsc` 0 錯誤、lint 乾淨、114 個測試全過、production build 成功。

## 架構變動摘要（接手前必讀）

- **`ViewportHost` 介面**（`Viewport.ts` 定義、`app/viewportHost.ts` 實作）：Viewport 不再直接持有 DocumentController，所有文件操作經由 host（`commit`、`amend`、`commitSketch`、`resizeLastSketchCurve`、`undo`、`redo`、`kernel`）。
- **選取型別變成聯集**（`state/appStore.ts`）：`BodySelection`（body/face/edge，有 `bodyId`）與 `SketchSelection`（curve/region，有 `sketchId`）。存取 `bodyId` 前要用 `isBodySelection()` 收窄。
- **手勢層不再有 mode**：`GestureController` 每次單指按下呼叫 `beginPrimary(x, y, pointerType)`，由 Viewport 回傳 `'draw' | 'manipulate' | 'orbit' | 'pan' | 'none'`。
- **草圖不在 kernel**：worker 對 `sketch` op 是 no-op；擠出 op 仍自帶 plane + curves + regionIndex（重放自包含），另加 `sketchId` + `regionKey` 只用來隱藏已用掉的區域。
- **尺寸標籤**：Viewport 持有世界座標錨點，每幀投影後寫入 store 的 `dimension`；`applyDimensionValue(v)` 呼叫拖曳結束時保存的 closure（通常是 `host.amend(build(v))`）。
- store 移除了 `sketchActive / sketchTool / sketchRegionCount / extrudableRegionCount`；新增 `activeTool / toolChosen / pencilDetected / sketches / dimension / keypadOpen / toast / historyOpen`。

## 待辦（依優先序）

1. **更新 `docs/architecture.md`**：「Life of a drag-extrude」與「Recipe」描述的是舊的模式式草圖；README 的「The signature interaction」五步驟也要改成新流程（拿筆直接畫 → 點區域 → 拖箭頭）。README 的 Contributing/What works 也要提 Pencil 分工與兩指復原。
2. **iPad 實機驗證**（模擬器/瀏覽器測不到）：防誤觸手感、300ms 窗口是否合適、筆懸停（M2 以上 iPad Pro）、兩指點擊與捏合的誤判、把手 72px/26px 容差是否好抓。建議請使用者在 demo 站（合併 `main` 後自動部署）測。
3. **首次使用導覽**：一張可關閉的卡片說明「筆畫圖、手指轉視角、兩指點擊復原」（`localStorage` 記住已讀）；以及「?」按鈕重開。
4. **圓角/倒角/抽殼把手的實機驗證**：已實作但未在瀏覽器跑過完整拖曳（擠出與推拉有）。
5. **自動布林的判斷**：目前地面草圖擠出一律建新 body；畫在 body 面上的才會 fuse/cut 宿主。Shapr3D 會依是否與既有 body 相交決定。
6. **草圖約束/尺寸**：只能在剛畫完時改長度/半徑；矩形寬高不可編輯（`describeCurves` 的 `editable: false`）。
7. **旋轉 gizmo**（移動只有三軸平移）、偏移面、多 body 移動。
8. 剖面視圖：可拖曳剖切面＋封蓋面（ADR/README 已列 M7.5）。
9. 裁剪版 OCCT wasm（見 ADR 0005）。

## 已知問題與風險

- **自動擠出只在選取恰好一個區域時出現把手**；選多個區域目前不能一次擠出。
- 宿主 body 被移動後，畫在它上面的草圖**留在原地**（與 Shapr3D 一致，草圖是獨立實體），但若之後擠出，`hostBodyId` 仍指向已移動的 body——boolean 會在新位置失敗或產生分離實體。可考慮擠出時以相交檢查決定宿主。
- `amendLast` 會做一次全量重放（`rebuild`），大文件時改數值會慢。
- 矩形在等角視角下沿某些斜線拖曳時，寬或高會被網格吸附成 0 而被當成誤觸丟棄（行為正確，但使用者沒有回饋——可加 toast）。

## 驗證方法與坑（省時間用）

- dev 模式下 console 有 `__heph`（kernel/viewport）、`__hephDoc`、`__hephStore`。**用 `__hephStore`，不要動態 import store**（HMR 後會拿到不同的模組實例）。
- **瀏覽器面板隱藏時 rAF 降到 ~1fps**：相機動畫幾乎不動、尺寸標籤不發佈。測試前用 `for (...) if (!vp.rig.update(1/60)) break` 推進相機，必要時呼叫 `vp.renderFrame()`。
- 模擬筆劃時**先把世界座標投影到螢幕再拖**（`new Vector3(x,y,z).project(vp.camera)`），不要用任意螢幕對角線——等角視角下的斜線可能平行世界軸，矩形會退化。
- Viewport 的閉包在 HMR 後可能仍是舊實例，改了 Viewport 後**重新整理頁面**再驗證。
- 已驗證的端到端腳本流程：清空 OPFS（`navigator.storage.getDirectory()` → `removeEntry('hephcad-current.json')`）→ 重新整理 → 筆畫矩形 → 筆點區域 → 拖擠出把手 → `vp.applyDimensionValue(40)` → 量體積 → 點頂面 → 拖推拉把手 → 兩指點擊復原。
