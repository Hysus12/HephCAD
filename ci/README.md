# CI Notes

## Workflows

- `host-checks.yml`: runs `swift test` and validates the acceptance spec/document skeleton.
- `ios-build.yml`: runs generic iOS build without code signing. Simulator/UI tests remain non-blocking until runtimes/devices are provisioned.

## Why Two Pipelines

- host-side checks are deterministic on any macOS runner with Swift
- iOS build depends on full Xcode and may still lack runtime/device support
- separating them keeps Phase 0 stable while viewer integration is still in flight
