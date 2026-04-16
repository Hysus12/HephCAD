# ADR 0004: Use lib3mf for 3MF

## Status

Accepted

## Context

3MF 需要標準相容與穩定讀寫，不值得自研 parser/writer。

## Decision

採用 lib3mf 處理 3MF import/export。

## Consequences

- 增加一個 C++ dependency 與 build pipeline。
- 先以標準 3MF 相容為目標，不承諾 slicer 私有 metadata。
