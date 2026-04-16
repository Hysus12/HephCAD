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
- Verified: app target 已通過 Swift compile，並到達 OCCT link 階段
- Done: OCCT dependency backend 已切換為 CMake + Ninja；app-side `.xcodeproj` 僅做最小 linker 補正（`TKDE`, `TKBinL`, `TKBin`, `TKBinXCAF`）
- Verified: 新 `iphoneos` Ninja configure 成功；`TKernel` 已成功編譯並安裝到 `third_party/build/occt/install/iphoneos/lib/libTKernel.a`
- In progress: `iphoneos` frontier targets (`TKOpenGles`, `TKDESTEP`, `TKBinXCAF`) 與其完整 transitive OCCT libs install、app target最終 link 驗證
- Blocked now: `iphoneos` 新路徑尚未產出完整 Phase 1 OCCT toolkit closure；`iphonesimulator` 尚未開始；因此 app link 尚未重新驗證
- Pending: 完整 device/simulator build 驗證與剩餘 OCCT linkage 收斂

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
