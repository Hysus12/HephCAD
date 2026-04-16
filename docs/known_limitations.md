# Known Limitations

## Phase 0-1

- 目前 viewer bridge 先提供 stub 與 state-driven demo，OCCT-backed renderer integration 尚未完成。
- simulator runtime/device 目前未 provision；CI 與本機驗證以 host tests + generic iOS build 為主。
- 目前這台機器的 Xcode project 可被解析，但 `xcodebuild -showdestinations` 只回報 ineligible `Any iOS Device`；generic iOS build 尚未打通。
- reference image 只支援 inspector-based opacity / transform 編輯，不提供 on-canvas gizmo。
- STEP 是 Phase 1 唯一進入 B-rep pipeline 的匯入格式；STL/OBJ/3MF 僅限 mesh import/view/export。
- 不支援完整 history tree。
- 不支援 assembly mating。
- 不支援 2D drawings。
- 不支援 cloud/auth/collaboration。
- 不支援 mesh editing。
