# ADR 0005: Follow the OCCT iOS Sample Route First

## Status

Accepted

## Context

專案第一優先是成功率與可驗收，不是自研 renderer。OCCT 已有官方 iOS sample，可作為 Phase 1 viewer integration 的最短路徑。

## Decision

第一版 viewer 沿用/參考 OCCT official iOS UIKit sample route，而不是先重寫自有 renderer 架構。

## Consequences

- 初期 viewer architecture 會受 sample 既有設計影響。
- 若 sample 在 simulator 上有限制，需接受 device-first 驗收與文件化限制。
