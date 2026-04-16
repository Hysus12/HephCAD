# Architecture

## Architecture Summary

HephCAD 採用 iPad app shell + Swift state/domain modules + Objective-C++ bridge + C++ kernel/backend 的分層架構。目標是把 UI/interaction、scene state、geometry/io、viewer implementation 清楚切開，讓 Phase 0-1 先用 stub 與 host tests 穩定骨架，再逐步接上 OCCT/lib3mf。

## Layering

1. `apps/ipad/HephCADApp`
   - UIKit/SwiftUI hybrid app shell
   - `WorkspaceView`, `ViewerContainerView`, `InspectorView`
   - 不直接接觸 OCCT types
2. `HephCADScene`
   - `WorkspaceStore` 作為單一真相來源
   - 管 selection、visibility、isolation、transparency、reference images、viewer commands
3. `HephCADDomain`
   - 文件與 body/reference image 等純資料模型
4. `HephCADReferenceImages`
   - reference image plane 與 transform/opacity model
5. `HephCADTelemetry`
   - local-only event schema 與 JSONL sink
6. `HephCADIO`
   - STEP/STL/OBJ/3MF import/export service protocol
7. `HephCADKernelBridge`
   - Objective-C++ façade，對 Swift 提供穩定 API
   - C++ layer 擁有 OCCT/lib3mf 物件生命週期
8. `HephCADViewerBridge`
   - `UIViewController` façade，Phase 1 先用 stub viewer；後續替換為 OCCT sample route

## Data Flow

1. App 啟動後建立 `WorkspaceStore`
2. `WorkspaceStore` 請求 `KernelSession` 產生 demo shape 或匯入 STEP
3. `KernelSession` 回傳 Swift-safe scene payload
4. `ViewerBridge` 載入 scene payload 並呈現 body / reference image plane
5. 使用者 selection / isolate / transparency / reference image 調整先更新 `WorkspaceStore`
6. `WorkspaceStore` 發送 viewer command 給 viewer bridge，必要時同步通知 kernel bridge

## B-rep vs Mesh Policy

- STEP: Phase 1 的可編輯 B-rep import path
- STL/OBJ/3MF: v1 視為 mesh assets，只做 import/view/export/convert
- mesh 不進入 B-rep feature pipeline

## Viewer Strategy

- 不先自研 renderer
- Phase 1 以沿用/參考 OCCT official iOS UIKit sample 為主
- 若 simulator 不穩定，以 generic iOS build + device 驗證為主，並在文件中記錄限制
- 目前 real viewer path 採用 OCCT sample 的 `EAGLContext + OpenGl_GraphicDriver + V3d/AIS` 路線，reference image 則先以 viewer overlay 方式實作 MVP

## Bridge Boundary

Swift 不直接暴露任何 OCCT/lib3mf type。bridge 層提供以下穩定 façade：

- `makeDemoShape()`
- `importSTEP(url:)`
- `exportSTEP(bodyIDs:url:)`
- `loadMesh(url:format:)`
- `exportMesh(nodeID:url:format:)`
- `setBodyTransparency(id:value:)`
- `setBodyVisibility(id:visible:)`

## Telemetry Hook

- telemetry 為 local-only、append-only JSONL
- 預留事件：tool invoke、selection、camera gesture、import/export、reference image edits
- 不引入雲端，不做 Phase 1 blocker

## Build Strategy

- repo 內有 checked-in `.xcodeproj`
- Swift package 負責 host-side modules/tests
- third-party 由 script 依 `third_party/versions.lock.json` build 至 `third_party/build/`
- CI 分成 host checks 與 iOS generic build check
- Phase 1 的 OCCT build 先暫時以 `USE_FREETYPE=OFF` 降低 iOS static build 複雜度；若後續 viewer/STEP compile 穩定，再補回 FreeType
