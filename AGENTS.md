# AGENTS.md

本 repo 的首要目標是：建立一個自用版 iPad B-rep CAD app，優先成功率、穩定性、可驗收里程碑，不追求一次做到商業級完整功能。

## Engineering rules
- 先讀 docs/ 再改 code
- 先更新 acceptance criteria 再新增功能
- 每個功能都要附最小驗收測試
- 每個 phase 完成後更新 roadmap / risks / known limitations
- 優先維持 buildable 狀態
- 優先小步提交，不做巨型混亂改動
- 遇到不確定架構，先新增 ADR
- 不得擅自引入大型新依賴，除非更新 ADR 並說明理由

## Product rules
- B-rep first
- mesh only for import/view/convert
- 第一版不做完整 history tree
- 第一版不做 cloud / auth / collaboration
- 第一版不做 mesh editing
- reference image 是 MVP
- helix / spring / thread 用參數化 feature generator，不做任意雕塑式工具

## Delivery rules
- 交付 working code，不只是計畫
- 若受限於環境無法完整 build，也要建立最接近可執行的 scaffold 與文件
- 明確列出 blockers，不要模糊帶過
