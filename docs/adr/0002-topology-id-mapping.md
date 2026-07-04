# ADR 0002：拓撲 ID 映射策略

日期：2026-07-03　狀態：草案（M2 前定案）

## 問題

選取、歷程記錄與後續操作都需要穩定引用 B-rep 的 face/edge/vertex，但 OCCT 布林運算後拓撲會重建，`TopoDS_Shape` 指標/雜湊不可跨操作持久。

## 方向（M2 定案前的工作假設)

- Kernel worker 對每個 body 維護一張「拓撲索引表」：以 `TopExp_Explorer` 走訪順序給 face/edge 編號，tessellation 輸出攜帶 face/edge → 三角形/線段範圍的映射，viewport picking 反查。
- 跨操作的持久 ID（歷程重放需要）採 OCCT `BRepTools_History`/`BOPAlgo` history 追蹤 generated/modified/deleted，映射舊 ID → 新 ID。
- v1 的歷程是線性 journal（不做參數化 regen），持久 ID 只需支撐 undo/redo 與顯示，不需完整 topological naming 方案。

## 風險

Topological naming 是 CAD 界著名難題（FreeCAD 長年痛點）。v1 刻意縮小需求範圍：ID 只要在 journal 線性重放下穩定即可。
