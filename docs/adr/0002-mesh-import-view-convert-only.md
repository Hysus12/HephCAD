# ADR 0002: Mesh Limited to Import/View/Convert

## Status

Accepted

## Context

產品核心是 B-rep CAD，不是 mesh editor。若一開始混入 mesh editing，會大幅增加幾何、UI、驗收與使用者預期管理的複雜度。

## Decision

mesh 只做 import / view / convert，不做 mesh editing。

## Consequences

- STL/OBJ/3MF 在 v1 為 mesh assets，不進入 B-rep feature pipeline。
- 文件與 UI 必須明確標示此邊界，避免誤解。
