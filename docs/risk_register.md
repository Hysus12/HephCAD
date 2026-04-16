# Risk Register

| ID | Risk | Impact | Likelihood | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | OCCT iOS viewer 仍帶有舊 sample / platform assumptions，可能在 simulator 或新 iPadOS SDK 上不穩 | High | Medium | Phase 1 先採 sample route，不自研 renderer；generic iOS build + device validation；文件記錄 simulator limitations | Open |
| R-002 | OCCT/lib3mf source build 成本高，且 iOS static libs build pipeline 複雜 | High | High | 已建立 `build_occt_ios.sh`；先以 OCCT static libs + Xcode generator 打通 Phase 1；lib3mf 延後到 Phase 2；目前 app 已到 link stage，剩餘 blocker 是 OCCT 必要靜態庫仍在建置 | Open |
| R-003 | 本機/CI 可能缺 `cmake`、Xcode first-launch、iOS runtime 或 simulator/device | Medium | Medium | `bootstrap_macos.sh` / `doctor.sh` 現已明確檢測並提供 remediation；主開發機已安裝 iOS 17.2 runtime | Mitigated |
| R-004 | STEP healing / topology naming 之後會造成匯入或後續 feature 失穩 | High | Medium | Phase 1 只承諾基本 STEP import；round-trip 驗收採 body count/bounding box tolerance，不過度承諾 topology identity | Open |
| R-005 | binary size 可能因 OCCT 靜態連結快速膨脹 | Medium | Medium | Phase 0 鎖定最小必要 toolkit；禁用非必要 optional deps；Phase 1 後量測產物大小 | Open |
| R-006 | reference image interaction 若太複雜，會延遲 viewer 核心交付 | Medium | Medium | MVP 採 inspector-based controls，不做 on-canvas gizmo | Open |
| R-007 | sketch/feature 系統之後容易爆成 history tree 問題 | High | Medium | 明確限制 v1 不做完整 history tree；採 feature generators + direct state model | Open |
| R-008 | OBJ/STL/3MF 都是 mesh，使用者可能誤解為可編輯 solid | Medium | Medium | 文件與 UI 文案明確標示 mesh asset、不可進入 B-rep editing pipeline | Open |
| R-009 | iOS 上的 OCCT static build 若先禁用 FreeType，可能造成文字/輔助標示能力受限 | Low | Medium | Phase 1 先以 `USE_FREETYPE=OFF` 降低 iOS static build 風險；等 viewer/STEP 穩定後再補回 FreeType | Open |
| R-010 | OpenGL ES / EAGL 已被 iOS 標記 deprecated，OCCT sample route 可能在未來 Xcode/iPadOS 版本承受更多警告或相容性壓力 | Medium | Medium | Phase 1 仍沿用 OCCT sample route 以提高成功率；目前以 `GLES_SILENCE_DEPRECATION=1` 壓低噪音，未來若 sample route 失穩再評估 Metal migration ADR | Open |
| R-011 | Homebrew CMake + iOS cross-compile 在本機若只給 `iphoneos` alias 或使用 `/usr/bin/c++`，可能產生 configure failure 或標頭查找錯誤 | High | High | 新 OCCT build script 改用完整 SDK path 與 Xcode toolchain `clang/clang++`；已以 `iphoneos` Ninja configure + `TKernel` build 實證 | Mitigated |
