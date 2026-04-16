# ADR 0001: Use OCCT as Geometry Kernel

## Status

Accepted

## Context

專案需要一個成熟、可用於 B-rep 建模、STEP 生態相容、可在 iOS 上整合的幾何核心，同時避免自研 kernel 的高風險。

## Decision

採用 Open CASCADE Technology (OCCT) 作為幾何核心。

## Rationale

- 有成熟的 B-rep、topology、boolean、sweep、fillet/chamfer 與 STEP/XDE pipeline。
- 官方文件與 sample 已涵蓋 iOS viewer route。
- 比起自研 kernel，成功率高且人工干預少。

## Consequences

- 需承擔 C++ / Objective-C++ bridge 與 iOS build pipeline 成本。
- viewer 與資料結構需尊重 OCCT 的 object lifecycle。
