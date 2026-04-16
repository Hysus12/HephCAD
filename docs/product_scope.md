# Product Scope

## Product Positioning

HephCAD 的目標是建立一個自用版、iPad 為主、touch-first 互動取向、以 B-rep CAD 為核心的 iPadOS app。專案策略是優先追求成功率最高、人工干預最少、能被逐 phase 驗收，而不是一開始就完全複製商業 CAD。

## Target Platform

- iPadOS 17+
- iPad 優先，不做 iPhone first
- Apple Pencil interaction 納入架構，但 hover 非 Phase 1 blocker

## In Scope

- B-rep 為主的零件建模
- 草圖 primitives：line、arc、circle、spline
- closed profile detection
- extrude / cut / revolve
- boolean：union / subtract / intersect
- linear pattern / circular pattern
- helix generator / spring feature / modeled thread feature
- STEP/STL/OBJ/3MF import/export
- viewer interaction：selection、orbit、pan、zoom
- body transparency、hide/show、isolate
- reference image import、plane attach、opacity/transform adjust

## Success Criteria

- Phase-by-phase 可驗收，且每 phase 結束時 repo 維持 buildable 或最接近可執行狀態
- 本地單機可用，不依賴雲端服務
- 可穩定處理常見零件建模工作流
- 匯入匯出主流格式至少達基本可用程度

## Technical Defaults

- Geometry kernel: Open CASCADE Technology (OCCT)
- 3MF: lib3mf
- iOS app: Swift + UIKit/SwiftUI hybrid
- C++ bridge: Objective-C++
- Phase 1 viewer: follow/reference OCCT official iOS sample route

## Explicit Non-Goals

- 不做雲端同步
- 不做帳號系統
- 不做社群分享
- 不做參數歷史樹完整版
- 不做大型組件管理
- 不做 FEA / CAM
- 不做 mesh 編輯器
- 不做完整商業 CAD 替代品

## Scope Boundaries

- mesh 只做 import / view / convert，不做 mesh editing
- 初期不自研 geometry kernel
- 初期不做完整 history tree
- 初期不做 assembly mating
- 初期不做 2D drawings
- slicer 私有 3MF metadata 不做過度承諾
