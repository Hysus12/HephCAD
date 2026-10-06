# Shapr3D 功能與互動研究，與 HephCAD 的對照

研究日期：2026-10-06。目的：弄清楚 Shapr3D 各功能「實際怎麼運作」，再決定 HephCAD 怎麼復刻、哪些刻意不同。

## 資料來源與限制（先讀這段）

- Shapr3D 官方說明站（support.shapr3d.com）**擋掉了程式抓取（HTTP 403）**，所以本文件**沒有讀到官方文章全文**，只有搜尋引擎回傳的官方文章摘要、官網產品頁、社群論壇（discourse.shapr3d.com）原文，以及 Wikipedia。
- 因此每一條都標了依據：**[官方摘要]**＝搜尋結果對官方說明文章的摘要、**[論壇]**＝使用者/版主發文、**[官網]**＝產品頁。**沒有親手操作過 Shapr3D**，所有「手感」類細節（箭頭大小、動畫、手勢門檻）都無法從文字得知，只能靠 iPad 實機比對。
- Shapr3D 是閉源、使用 Parasolid 核心（2017 年自 OpenCascade 轉換）[Wikipedia]；HephCAD 用 OCCT，部分行為（例如圓角失敗的邊界案例）不可能完全相同。

## 一、使用者點名的功能：Shapr3D 實際行為

### 倒角 / 圓角（Chamfer/Fillet）

- **同一個工具**，選邊後出現**雙向箭頭**：「往內（朝向本體）拖＝倒角、往外（離開本體）拖＝圓角」。**輸入數值時，正數＝圓角（半徑）、負數＝倒角。** [官方摘要、論壇]
- 倒角**只有距離，沒有角度**：預設兩側等距＝90° 邊得到 45° 斜面；論壇有人多年前要求加角度參數（航太常用 82°/100–110°），**沒有官方回應**。[論壇：discourse.shapr3d.com/t/chamfer-angles/10895、/chamfer-angle/33470]
- 歷程（history）裡可回頭改距離；有「Include Tangent Edges」開關，預設會自動把相切連續的邊一起選進來。[論壇：/chamfer-fillet-one-section-of-an-edge/20743]
- ⚠️ **使用者說 Shapr3D 可以指定倒角度數——我查不到佐證。** 本文件把「倒角角度」列為 HephCAD 的**擴充**而非復刻（OCCT 的距離＋角度倒角能做到）。若你在 Shapr3D 最新版看過角度欄位，請告訴我它的位置與行為，我再對齊。

### 線段長度：筆畫 或 參數化輸入

- **沒有獨立的「尺寸」工具**：選取草圖元素，尺寸標籤就直接顯示；點標籤用數字鍵盤輸入，之後出現**鎖頭**表示該尺寸已被鎖定（參數化）。[論壇/官方摘要]
- 另有完整的約束系統（水平/垂直、等長、相切…），可選線後在 Constraints 選單加。[官網 cad-constraints、官方摘要]

### 布林運算

- 獨立工具 **Union / Subtract / Intersect**，**要求本體重疊**；都有 **Keep Originals** 選項，可保留原本體。[官方摘要：Boolean operations]
- **擠出工具本身有「布林徽章」**：Union / New Body / Subtract / Intersect 四選一，擠出當下或之後都能改。[官方摘要、論壇]
- → **HephCAD 目前的差距**：擠出是「有宿主就自動 Union/Subtract、沒有就新本體」，使用者**無法選擇**；也沒有獨立的布林工具。使用者的觀察正確。

### 投影（Project）

- 把**草圖、邊或面投影**到另一個面或草圖上；兩種型態：投影**邊**（產生新邊）或投影**草圖**（產生新草圖）。投影會**與來源保持關聯**（來源改了會跟著更新）。可投影到非平面的複雜面。[官方摘要：Project – Sketches、Mastering the Project tool]

### 建構平面（Construction Plane）

- 每一種建構平面是 Construct 選單中**獨立的工具**，畫面上方有逐步引導。**Offset Plane**：選面/平面/草圖輪廓，拖箭頭或在尺寸標籤輸入距離。另有「沿邊成角度（along edge at angle）」等型態。[官方摘要、論壇]
- **在建構平面上畫圖：用手指雙擊該平面來選它**，之後就在上面畫。（這是使用者說的「點兩下選擇建構平面」。）[論壇：/help-drawing-on-an-offset-plane/19076]
- 平面、軸線會列在 Items Manager 裡，可改名、隱藏。

### 陣列（Pattern）

- Transform → Pattern：**線性**（沿 1/2/3 個軸）與**圓形**（繞中心點），對象可以是 3D 本體、草圖輪廓或整張草圖。
- 控制徽章：**數量**、以「**總距離**」或「**間距**」定義；圓形陣列要移動 gizmo 中心決定圓心。
- **陣列產生的本體會自動放進 Items Manager 的資料夾。** [官方摘要、官網]

### 移動/旋轉（Move/Rotate）與拷貝

- Transform → Move/Rotate 的 **gizmo**：箭頭（平移）與環/弧（旋轉）、**尺寸標籤可輸入精確值**；gizmo 中心可拖曳並**吸附到既有幾何**（軸、面、邊、草圖輪廓…），決定旋轉中心。
- **Copy 徽章**：開啟後移動/旋轉的是副本。可操作對象：草圖區域、邊、面、3D 本體。[官方摘要：Move/Rotate (3D)]

### 材質：顏色與透明度

- 選取面或本體 → Properties → Material → 拖放材質；**預設材質有顏色與 Opacity（透明度）滑桿**；玻璃等特殊材質的透明度固定。[官方摘要、論壇]

### 項目管理（Items Manager）

- 列出專案內所有項目：本體、草圖平面、建構平面/軸、網格、圖片、資料夾；可**建立資料夾**、改名、眼睛圖示顯示/隱藏、依類型過濾。[官方摘要]

## 二、其他在官網列出、值得知道的功能

Loft、Sweep、Revolve、Shell、Split、Replace Face、Wrap/Emboss、Mirror、草圖 Offset/Trim/Mirror/Pattern、Variables（參數與運算式）、History-based parametric modeling、Zebra/曲率分析、2D 工程圖、STEP/IGES/DWG/DXF/STL/OBJ/USDZ/GLB 匯出。[官網、Wikipedia] — 本輪不涵蓋。

## 三、HephCAD 現況對照與實作計畫

| 功能 | Shapr3D | HephCAD 現況 | 本輪計畫 |
|---|---|---|---|
| 圓角/倒角 | 一個工具、雙向箭頭、外＝圓角/內＝倒角、負值＝倒角 | 兩個分開的模式、單向箭頭 | **P1** 合併成單一雙向箭頭；負值＝倒角；倒角角度為**擴充** |
| 線段長度 | 選取即顯示尺寸、點擊輸入、鎖定 | 只能改「剛畫完的最後一條」 | **P1** 選取任意直線/圓即可改；端點相接的線跟著動（無約束求解器的務實替代） |
| 布林 | 擠出徽章四選一＋獨立 Union/Subtract/Intersect＋Keep Originals | 擠出自動判斷、無獨立布林 | **P1** 兩者都做 |
| 移動/旋轉/拷貝 | gizmo＋Copy 徽章＋數值 | 三軸平移、複製鈕（固定偏移） | **P2** 旋轉環、Copy 徽章、數值輸入 |
| 陣列 | 線性/圓形、數量、總距離/間距、自動資料夾 | 無 | **P2** |
| 建構平面 | 多型態、雙擊選取後繪圖 | 無 | **P2** 先做 Offset Plane |
| 投影 | 邊/草圖投影到面或草圖 | 無 | **P2** 先做「邊投影到目前草圖平面」 |
| 材質顏色/透明度 | 屬性面板、滑桿 | 無 | **P3** |
| 資料夾 | Items Manager 資料夾 | 無 | **P3** |

**刻意不做（本輪）**：完整約束求解器（用「端點相接跟著動」近似）、參數化歷程編輯（HephCAD 是線性 journal，可改最後一步但不能回頭改中間步驟）、Parasolid 等級的圓角穩健度。

## 四、來源

- [Chamfer/Fillet — 官方說明](https://support.shapr3d.com/hc/en-us/articles/7874402399900-Chamfer-Fillet)、[Boolean operations — 官方說明](https://support.shapr3d.com/hc/en-us/articles/10565066254108)、[Construction Plane — 官方說明](https://support.shapr3d.com/hc/en-us/articles/7874364567452)、[Pattern (3D) — 官方說明](https://support.shapr3d.com/hc/en-us/articles/7874397541532)、[Move/Rotate (3D) — 官方說明](https://support.shapr3d.com/hc/en-us/articles/7874396289308)、[Project – Sketches — 官方說明](https://support.shapr3d.com/hc/en-us/articles/11676543902492)、[Items Manager — 官方說明](https://support.shapr3d.com/hc/en-us/articles/7873936188956)（以上僅讀到搜尋摘要，全文 403）
- [Shapr3D 官網：3D modeling](https://www.shapr3d.com/product/3d-modeling)、[CAD constraints](https://shapr3d.com/product/cad-constraints)
- 論壇：[Chamfer angles](https://discourse.shapr3d.com/t/chamfer-angles/10895)、[Chamfer angle](https://discourse.shapr3d.com/t/chamfer-angle/33470/2)、[Chamfer/Fillet one section of an edge](https://discourse.shapr3d.com/t/chamfer-fillet-one-section-of-an-edge/20743)、[Drawing on an offset plane](https://discourse.shapr3d.com/t/help-drawing-on-an-offset-plane/19076)、[Extrude boolean default](https://discourse.shapr3d.com/t/request-default-extrude-operation-to-new-body-rather-than-union/28817)、[Opacity slider](https://discourse.shapr3d.com/t/opacity-slider-on-3d-models/36229)
- [Wikipedia: Shapr3D](https://en.wikipedia.org/wiki/Shapr3D)
