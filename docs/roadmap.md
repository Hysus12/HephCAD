# Roadmap

## Phase 0

- 建立文件、ADR、risk register、acceptance tests
- 建立 repo skeleton、Swift package modules、test harness、CI skeleton
- 建立 iPad app shell、Objective-C++ bridge stub、viewer stub、sample assets

### Current Status

- Done: 文件、Swift package、host tests、sample assets、scripts、CI skeleton、checked-in `.xcodeproj`
- Verified: `swift test --disable-index-store -j 1` 通過；`xcodebuild -list -project apps/ipad/HephCADApp.xcodeproj` 可解析專案
- Verified: `cmake` / `ninja` 已安裝；iOS 17.2 simulator runtime 已安裝；`-showdestinations` 可列出 iPad simulators
- Verified: generic iOS build 已可跑到 app compile / link 階段
- In progress: OCCT static library build pipeline 與 app target OCCT linkage

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

- Done: OCCT-backed viewer/controller code 已接入 repo；gesture wiring、selection delegate、STEP sample `screw.step` 匯入路徑、isolate/transparency/reference image overlay wiring 已切到 real path
- Verified: app target 已可完成 `iphoneos` build/link，`scripts/run_ios_build_check.sh` 成功
- Done: OCCT dependency backend 已切換為 CMake + Ninja；app-side `.xcodeproj` 僅做最小 linker 補正（`TKDE`, `TKBinL`, `TKBin`, `TKBinXCAF`）
- Verified: 新 `iphoneos` Ninja configure 成功；`TKernel` 已成功編譯並安裝到 `third_party/build/occt/install/iphoneos/lib/libTKernel.a`
- Verified: app 已在真實 iPad 上成功啟動，UI shell 與 demo 3D model 可見，basic viewing 可用，transparency 可用
- In progress: 將 device runtime 驗證從「可啟動/可見」擴展到 STEP import、selection、isolate、reference image controls 的逐項確認
- Pending: `iphonesimulator` OCCT libs、完整 device runtime checklist、剩餘 Phase 1 缺口收斂

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
