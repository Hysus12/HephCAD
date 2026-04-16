# Known Limitations

## Phase 0-1

- viewer bridge 已切到 OCCT sample route，app target 也已可進入 compile / link；目前主要 blocker 是 OCCT 必要靜態庫仍在建置中，尚未完成最終 app link。
- OCCT dependency backend 已從 Xcode-generated project path 轉向 CMake + Ninja；`iphoneos` configure 與 `libTKernel.a` 安裝已驗證，frontier targets (`TKOpenGles` / `TKDESTEP` / `TKBinXCAF`) 尚未完成。
- OCCT link requirement status:
  - `iphoneos` installed via new path: `TKernel`
  - `iphoneos` still pending from new path: `TKMath`, `TKG2d`, `TKG3d`, `TKGeomBase`, `TKGeomAlgo`, `TKBRep`, `TKTopAlgo`, `TKPrim`, `TKBO`, `TKMesh`, `TKShHealing`, `TKService`, `TKHLR`, `TKV3d`, `TKOpenGles`, `TKCDF`, `TKLCAF`, `TKCAF`, `TKVCAF`, `TKXCAF`, `TKDE`, `TKXSBase`, `TKDESTEP`, `TKBinL`, `TKBin`, `TKBinXCAF`
  - `iphonesimulator` build tree 尚未產出，等同全部 Phase 1 所需 OCCT libs 缺失
- 主開發機已安裝 iOS 17.2 simulator runtime，`xcodebuild -showdestinations` 可列出 iPad simulators；generic iOS build 已被驗證可跑到 link 階段。
- reference image 只支援 inspector-based opacity / transform 編輯，不提供 on-canvas gizmo。
- STEP 是 Phase 1 唯一進入 B-rep pipeline 的匯入格式；STL/OBJ/3MF 僅限 mesh import/view/export。
- 為降低 iOS static build 風險，Phase 1 的 `build_occt_ios.sh` 暫時以 `USE_FREETYPE=OFF` 建置 OCCT；文字/標示相關能力之後再補回。
- 不支援完整 history tree。
- 不支援 assembly mating。
- 不支援 2D drawings。
- 不支援 cloud/auth/collaboration。
- 不支援 mesh editing。
