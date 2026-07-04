# ADR 0003：文件格式

日期：2026-07-03　狀態：草案（M5 前定案）

## 決策方向

自訂 JSON 文件 = 「線性操作 journal + 定期 B-rep snapshot」混合：

- journal：每筆操作（匯入、草圖、擠出、布林、刪除…）的參數與受影響實體 ID，對應 UI 的歷程記錄面板與 undo/redo。
- snapshot：每 N 筆操作把各 body 的 B-rep 以 OCCT BinOCAF/BRep 序列化（base64 或 sidecar blob）存一份，開檔時從最近 snapshot 重放其後的 journal，避免全程重算。
- 儲存位置：OPFS 自動存檔；匯出/交換用 STEP（AP242）。

## 理由

- journal 天然對應 Shapr3D 式的歷程 UI 與 undo。
- snapshot 讓開檔時間與 journal 長度脫鉤，也隔離 OCCT 版本間重放差異。

## 未定

- snapshot 間隔策略、blob 壓縮、schema 版本遷移規則 — M5 實作時定。
