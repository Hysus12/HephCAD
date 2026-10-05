# ADR 0005：裁剪 OCCT wasm 體積

日期：2026-10-05　狀態：提議中（評估完成，尚未實作）

## 背景

目前使用 `opencascade.js@2.0.0-beta` 的 full build：`opencascade.full.wasm` 50 MB、gzip 後 14 MB。PWA precache 讓第二次起秒開，但**首次載入**在 iPad 行動網路上仍是最大的上手門檻，也是線上 demo 給新訪客的第一印象。

## 評估過的選項

### A. 換用 `replicad-opencascadejs@1.1.0`（社群維護的裁剪版）

- 體積：`replicad_single.wasm` 23 MB、gzip 7.2 MB——約為現況一半。
- **不能直接替換。** 驗證方式：把 `src/kernel/*.ts` 複製一份，型別匯入改指向 `replicad_single.d.ts` 後跑 `tsc`，得到 69 個錯誤，分兩類：
  1. 命名規則不同：它以執行期多載解析，沒有 `gp_Vec_4`、`TopoDS.Face_1` 這類編號。可機械式移植。
  2. **缺少核心 binding**：`TopExp`、`TopTools_IndexedMapOfShape`、`TopTools_IndexedDataMapOfShapeListOfShape`、`BOPAlgo_Tools`、`BRep_Builder`、`Handle_Geom_Curve`、`Handle_Poly_Triangulation`。前三者是拓撲索引（選取、圓角、抽殼、量測）的根基，`BOPAlgo_Tools` 是閉合區域偵測的核心。缺了要重寫演算法，不是換套件的工作量。

### B. 自建只含所需 binding 的 opencascade.js（建議方向）

opencascade.js 支援以 YAML 列出要匯出的類別、用其 Docker 映像建置自訂版本。本機無 Docker / Emscripten，適合放在 GitHub Actions 的 `workflow_dispatch` job，產物以 release asset 或 npm 私有套件發佈。

需要匯出的符號（以 `src/kernel/*.ts` 機械式抽取，2026-10-05；共 52 個直接引用）：

```
BOPAlgo_Tools BRepAdaptor_Curve BRepAdaptor_Surface BRepAlgoAPI_Cut BRepAlgoAPI_Fuse
BRepBuilderAPI_Copy BRepBuilderAPI_MakeEdge BRepBuilderAPI_Transform BRepFilletAPI_MakeChamfer
BRepFilletAPI_MakeFillet BRepGProp BRepMesh_IncrementalMesh BRepOffsetAPI_MakeThickSolid
BRepOffset_Mode BRepPrimAPI_MakeBox BRepPrimAPI_MakeCylinder BRepPrimAPI_MakePrism BRep_Builder
BRep_Tool ChFi3d_FilletShape GCPnts_TangentialDeflection GC_MakeArcOfCircle GC_MakeSegment
GProp_GProps GeomAbs_JoinType GeomAbs_SurfaceType Handle_Geom_Curve Handle_Poly_Triangulation
IFSelect_ReturnStatus Message_ProgressRange STEPControl_Reader STEPControl_StepModelType
STEPControl_Writer TopAbs_Orientation TopAbs_ShapeEnum TopExp TopExp_Explorer TopLoc_Location
TopTools_IndexedDataMapOfShapeListOfShape TopTools_IndexedMapOfShape TopTools_ListOfShape TopoDS
TopoDS_Compound TopoDS_Edge TopoDS_Face TopoDS_Shape gp_Ax2 gp_Circ gp_Dir gp_Pnt gp_Trsf gp_Vec
```

另需上述 API 的傳遞性回傳型別，至少：`Poly_Triangulation`、`Poly_Triangle`、`gp_Pln`、`gp_Ax3`、`gp_XYZ`、`Handle_Geom_TrimmedCurve`、`Geom_TrimmedCurve`、`TopoDS_Wire`、`TopoDS_Solid`。

### C. 維持 full build（現況）

成本只在首次載入；PWA 之後完全離線。

## 決策

短期維持 C；B 列為 M8 下一步。A 不採用。

## 驗收門檻（任何替換方案都適用）

缺 binding 在 embind 下是**執行期**錯誤，平常的 `tsc` 抓不到。替換前必須：

1. **型別相容性檢查**：把 kernel 程式碼對候選建置的 `.d.ts` 做型別檢查，0 錯誤（做法見上方選項 A）。
2. **瀏覽器冒煙測試**：建方塊、地面草圖擠出、面上草圖切除、圓角、抽殼、量測、STEP 匯出再匯入、undo 到底再 redo 到底，全部成功且 console 無錯誤。
3. 量測新舊建置的 gzip 體積與 iPad 首次載入時間，寫回本 ADR。
