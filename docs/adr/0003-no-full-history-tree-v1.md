# ADR 0003: No Full History Tree in V1

## Status

Accepted

## Context

完整參數歷史樹會引入 topology naming、dependency tracking、recompute propagation、rollback UI 等高風險問題。

## Decision

第一版不做完整 history tree，優先以直接狀態模型與參數化 feature generator 達成功能。

## Consequences

- feature scope 仍可存在，但不承諾商業 CAD 級完整編輯歷史。
- Phase 3-5 的 feature 設計要避免先綁死在複雜 history engine 上。
