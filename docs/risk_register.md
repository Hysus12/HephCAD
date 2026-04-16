# Risk Register

| ID | Risk | Impact | Likelihood | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | OCCT iOS viewer 仍帶有舊 sample / platform assumptions，可能在 simulator 或新 iPadOS SDK 上不穩 | High | Medium | Phase 1 先採 sample route，不自研 renderer；generic iOS build + device validation；文件記錄 simulator limitations | Open |
| R-002 | OCCT/lib3mf source build 成本高，且 iOS static libs build pipeline 複雜 | High | High | 先寫 deterministic scripts、版本鎖定、doctor/bootstrap；延後引入非必要 optional deps | Open |
| R-003 | 目前環境缺 `cmake` 且 simulator runtime/device 未 provision | Medium | High | `bootstrap_macos.sh` 自動補 host tools；CI 先做 generic iOS build；UI automation 延後 | Open |
| R-004 | STEP healing / topology naming 之後會造成匯入或後續 feature 失穩 | High | Medium | Phase 1 只承諾基本 STEP import；round-trip 驗收採 body count/bounding box tolerance，不過度承諾 topology identity | Open |
| R-005 | binary size 可能因 OCCT 靜態連結快速膨脹 | Medium | Medium | Phase 0 鎖定最小必要 toolkit；禁用非必要 optional deps；Phase 1 後量測產物大小 | Open |
| R-006 | reference image interaction 若太複雜，會延遲 viewer 核心交付 | Medium | Medium | MVP 採 inspector-based controls，不做 on-canvas gizmo | Open |
| R-007 | sketch/feature 系統之後容易爆成 history tree 問題 | High | Medium | 明確限制 v1 不做完整 history tree；採 feature generators + direct state model | Open |
| R-008 | OBJ/STL/3MF 都是 mesh，使用者可能誤解為可編輯 solid | Medium | Medium | 文件與 UI 文案明確標示 mesh asset、不可進入 B-rep editing pipeline | Open |
