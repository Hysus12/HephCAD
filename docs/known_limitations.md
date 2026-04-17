# Known Limitations

## Phase 0-1

- viewer bridge 已切到 OCCT sample route；`iphoneos` build/link 已打通，app 也已在真實 iPad 啟動成功。
- OCCT dependency backend 已從 Xcode-generated project path 轉向 CMake + Ninja；目前主線運作依賴 `iphoneos` install 輸出，`iphonesimulator` 仍未整理完成。
- OCCT link/build status:
  - `iphoneos`: app build/link 成功
  - `iphonesimulator`: search-path warnings 仍存在，尚未完成對應 OCCT libs 整理，但目前不是 blocker
- 主開發機已安裝 iOS 17.2 simulator runtime，`xcodebuild -showdestinations` 可列出 iPad simulators；generic iOS build 已被驗證可跑到 link 階段。
- reference image 只支援 inspector-based opacity / transform 編輯，不提供 on-canvas gizmo。
- STEP 是 Phase 1 唯一進入 B-rep pipeline 的匯入格式；STL/OBJ/3MF 僅限 mesh import/view/export。
- 多數真正 CAD construction/modeling 工具仍未實作；若 UI 上出現相關按鈕，應先視為 placeholder，直到具體驗證。
- 為降低 iOS static build 風險，Phase 1 的 `build_occt_ios.sh` 暫時以 `USE_FREETYPE=OFF` 建置 OCCT；文字/標示相關能力之後再補回。
- 不支援完整 history tree。
- 不支援 assembly mating。
- 不支援 2D drawings。
- 不支援 cloud/auth/collaboration。
- 不支援 mesh editing。
