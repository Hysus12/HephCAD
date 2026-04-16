# HephCAD

HephCAD 是一個自用版、iPad 優先、B-rep first 的 CAD app 專案。第一優先是穩定、本地可用、可驗收，並以 Open CASCADE Technology (OCCT) 作為幾何核心，mesh 僅限匯入、檢視與轉檔。

## 目前狀態

- Phase 0 已建立文件、repo 結構、Swift core module、測試骨架、CI 骨架與 iPad app shell。
- Phase 1 已建立最小 viewer/demo 架構、STEP import pipeline 介面、selection/isolate/transparency/reference image 狀態管理。
- OCCT/lib3mf 真正編譯整合仍需依 `scripts/bootstrap_macos.sh` 準備工具鏈後完成。
- 目前本機 `swift test` 可通過；`.xcodeproj` 可被 Xcode 解析，但 generic iOS build 受本機 Xcode iOS destination/platform 狀態限制。

## 核心原則

- B-rep first；mesh 只做 import/view/convert。
- iPadOS 17+。
- 不做 cloud/auth/collaboration。
- 第一版不做完整 history tree、assembly mating、2D drawings、mesh editing。
- 先有驗收標準，再做功能。

## Repo 結構

```text
apps/ipad/                iPad app shell 與 UI 層
Sources/                  Swift package modules 與 ObjC++/C++ bridge 骨架
Tests/                    host-side unit / acceptance spec tests
docs/                     產品、架構、ADR、roadmap、風險、驗收、限制
samples/                  golden test assets 與示例檔
scripts/                  bootstrap、doctor、build/test scripts
third_party/              third-party 版本鎖定與 build 輸出位置
```

## 主要模組

- `HephCADDomain`: 文件、body、scene node、格式 enum 與基礎型別。
- `HephCADScene`: `WorkspaceStore` 與 viewer command state。
- `HephCADReferenceImages`: reference image model 與編輯操作。
- `HephCADTelemetry`: 本地 JSONL telemetry schema。
- `HephCADIO`: import/export 介面與 stub adapters。
- `HephCADKernelBridge`: Objective-C++/C++ bridge façade。
- `HephCADViewerBridge`: iOS viewer controller stub，後續換成 OCCT-backed viewer。

## 開發前置

1. 安裝完整 Xcode，並讓 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 可用。
2. 執行 `scripts/bootstrap_macos.sh` 安裝 `cmake` / `ninja`，並在缺少 iOS runtime 時透過 `xcodebuild -downloadPlatform iOS` 補齊。
3. 執行 `scripts/doctor.sh` 檢查 Xcode first-launch、SDK、simulator runtime、destinations 與 OCCT install 目錄。
4. 執行 `scripts/build_occt_ios.sh` 產生 `iphoneos` / `iphonesimulator` 靜態庫後，再跑 app build。

## 常用指令

```bash
swift test
scripts/run_host_tests.sh
scripts/doctor.sh
scripts/build_occt_ios.sh
scripts/run_ios_build_check.sh
scripts/build_app.sh
```

## 第一批驗收重點

- STEP import 成功
- STEP round-trip 基本成功
- STL/OBJ/3MF import/export 基本成功
- viewer 可載入 shape
- 可選取 body
- 可 isolate
- 可調 transparency
- 可插入 reference image 並調整 opacity / transform

詳細規格見 [docs/acceptance_tests.md](/Users/hysus/Documents/dev/3D_editor/HephCAD/docs/acceptance_tests.md)。
