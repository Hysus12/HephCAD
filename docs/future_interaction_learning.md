# Future Interaction Learning

## Goal

第一版不引入重量級 ML stack，但要先把事件 schema 與資料邊界設計好，讓未來可以利用公開資料集與少量真實遙測改善 selection、tool recommendation 與 sketch prior。

## Candidate Public Datasets

### SketchGraphs

- 內容：大量 CAD sketch / constraint graph 資料
- 可學到：
  - next sketch primitive prior
  - 常見 constraint 組合
  - sketch editing sequence 的統計偏好
- 學不到：
  - touch-first UI 手勢品質
  - 使用者在 3D scene 中的 selection 行為

### Fusion 360 Gallery / Reconstruction-style datasets

- 內容：參數化 CAD 模型、部分操作與重建任務資料
- 可學到：
  - feature ordering 的粗略先驗
  - 常見零件形狀與 profile/feature 關聯
- 學不到：
  - iPad 上的互動摩擦
  - 使用者個人化工具偏好

### DeepCAD

- 內容：CAD command sequence / parameter generation 類資料
- 可學到：
  - command sequence prior
  - 常見參數分佈
  - feature generator 的先驗排序
- 學不到：
  - 真實 selection disambiguation under touch
  - reference image workflow

## Local Telemetry Plan

- local-only
- opt-in by build flag
- append-only JSONL
- 不含帳號與雲端同步

## First Events To Capture

- `tool_invoked`
- `selection_attempt`
- `selection_committed`
- `camera_gesture`
- `import_completed`
- `export_completed`
- `reference_image_adjusted`

## How Future Learning Uses It

- 用少量真實遙測校正 selection disambiguation heuristics
- 將 dataset pretraining 與本地 telemetry 做 preference re-ranking
- 為 sketch primitive / tool recommendation 建立低風險 suggestion layer，而非自動代操作

## Hard Boundaries

- 不在 Phase 1 引入訓練 pipeline
- 不在 Phase 1 引入模型推論 runtime
- 不把 ML 當作核心 CAD 功能的 blocker
