# Roadmap

## Phase 0

- 建立文件、ADR、risk register、acceptance tests
- 建立 repo skeleton、Swift package modules、test harness、CI skeleton
- 建立 iPad app shell、Objective-C++ bridge stub、viewer stub、sample assets

### Current Status

- Done: 文件、Swift package、host tests、sample assets、scripts、CI skeleton、checked-in `.xcodeproj`
- Verified: `swift test --disable-index-store -j 1` 通過；`xcodebuild -list -project apps/ipad/HephCADApp.xcodeproj` 可解析專案
- Blocker: 本機 Xcode `-showdestinations` 只回報 ineligible `Any iOS Device`，generic iOS build 尚未完成

### Exit Criteria

- `swift test` 通過
- generic iOS build check 可執行
- 文件明確列出產品定位、架構、風險、限制與未來 phase

## Phase 1

- viewer 載入 B-rep demo shape
- STEP sample import
- selection / isolate / transparency
- reference image insert + opacity/transform edit

### Current Status

- Done: demo shape stub、bundled STEP sample import path、selection/isolate/transparency/reference image inspector flow
- Pending: 用 OCCT viewer 取代 stub viewer，並完成實際 device/simulator build 驗證

### Exit Criteria

- app 可啟動到 workspace
- viewer 可顯示一個 shape
- STEP sample import 成功
- 可 orbit/pan/zoom/select
- 可 isolate 與調 transparency
- 可插入 reference image 並調 opacity / position / rotation / scale

## Phase 2

- STL/OBJ/3MF import/export
- golden file checks

## Phase 3

- sketch primitives
- closed profile detection
- extrude / cut / revolve

## Phase 4

- boolean ops
- linear pattern / circular pattern

## Phase 5

- helix generator
- spring feature
- modeled thread feature

## Phase 6

- interaction polish
- Apple Pencil workflow
- hover planning
- local telemetry hooks for future recommendation/re-ranking
