# Acceptance Tests

## Status Legend

- `Planned`: 規格已定義，尚未全數自動化
- `Host Tested`: 已有 host-side automated coverage
- `Project Parsed`: `.xcodeproj` 與 scheme 可被 `xcodebuild -list` / `-showdestinations` 讀取
- `iOS Build Checked`: 已納入 generic iOS build 驗證
- `Link Blocked`: app target 已進入 compile/link，但仍受外部靜態庫尚未完成所阻擋
- `Device Manual`: 需實機或 simulator 操作驗證

## Phase 0 Acceptance

### AT-001 Repo bootstrap

- Status: Host Tested
- Given 空 repo
- When 依 README 與 scripts 執行 bootstrap / doctor / host tests
- Then 可得到可讀文件、Swift package modules、tests、CI skeleton 與 iPad app project shell

### AT-002 Acceptance spec completeness

- Status: Host Tested
- Given 本文件
- When 執行 `AcceptanceSpecTests`
- Then 必備功能與 Phase 0-1 驗收案例都存在且可被 machine-check

## Phase 1 Acceptance

### AT-101 Viewer loads demo B-rep shape

- Status: Host Tested, Project Parsed, iOS Build Checked, Link Blocked, Device Manual
- Given app 啟動到 workspace
- When 載入預設 demo scene
- Then viewer 顯示至少一個 B-rep body
- Note: OCCT-backed viewer code 已接入；generic iOS build 已到達 OCCT link 階段，等待 OCCT 必要靜態庫完成

### AT-102 STEP import succeeds

- Status: Host Tested, Project Parsed, iOS Build Checked, Link Blocked, Device Manual
- Given sample STEP 檔 `samples/models/step/screw.step`
- When 使用 import flow 載入
- Then scene 中新增至少一個 B-rep body，且 import event 被記錄

### AT-103 STEP round-trip basic success

- Status: Planned
- Given 已匯入的 STEP body
- When 匯出為 STEP 並再次匯入
- Then body count 維持一致，bounding box 差異在定義容差內

### AT-104 STL import/export basic success

- Status: Host Tested
- Given sample STL 檔
- When 進行 import/export
- Then 輸出檔非空且可被 importer stub 重新解析

### AT-105 OBJ import/export basic success

- Status: Host Tested
- Given sample OBJ 檔
- When 進行 import/export
- Then 輸出檔非空且可被 importer stub 重新解析

### AT-106 3MF import/export standard file success

- Status: Host Tested
- Given sample 3MF 檔
- When 進行 import/export
- Then 輸出檔非空，且標準 metadata path 可被讀取

### AT-107 Body selection

- Status: Host Tested, Project Parsed, iOS Build Checked, Link Blocked, Device Manual
- Given viewer 中至少有一個 body
- When 使用者 tap body
- Then `WorkspaceStore.selection` 更新，inspector 顯示該 body 狀態

### AT-108 Isolate selected body

- Status: Host Tested, Project Parsed, iOS Build Checked, Link Blocked, Device Manual
- Given 多個 body 且存在選取 body
- When 使用者執行 isolate
- Then 只顯示被 isolate 的 body 集合

### AT-109 Transparency adjustment

- Status: Host Tested, iOS Build Checked, Link Blocked, Device Manual
- Given 已選取 body
- When 使用者調整 transparency slider
- Then body transparency 更新且 viewer 呈現同步變化

### AT-110 Reference image insertion and editing

- Status: Host Tested, iOS Build Checked, Link Blocked, Device Manual
- Given 使用者選擇一張 reference image
- When 插入到建模平面並調整 opacity / position / rotation / scale
- Then `WorkspaceStore.referenceImages` 與 viewer plane 呈現一致

### AT-111 Orbit/pan/zoom gestures

- Status: Project Parsed, iOS Build Checked, Link Blocked, Device Manual
- Given viewer 可見 scene
- When 使用者進行 one-finger orbit、two-finger pan、pinch zoom
- Then camera state 更新且 scene 持續可見
