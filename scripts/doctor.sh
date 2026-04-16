#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

echo "[doctor] repo: ${ROOT_DIR}"
echo "[doctor] DEVELOPER_DIR=${DEVELOPER_DIR_DEFAULT}"

if [[ ! -d "${DEVELOPER_DIR_DEFAULT}" ]]; then
  echo "[doctor] missing Xcode developer directory"
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "[doctor] swift not found"
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "[doctor] cmake missing; run scripts/bootstrap_macos.sh"
else
  echo "[doctor] cmake: $(cmake --version | head -n 1)"
fi

echo "[doctor] swift: $(swift --version | head -n 1)"
echo "[doctor] xcodebuild: $("${DEVELOPER_DIR_DEFAULT}/usr/bin/xcodebuild" -version | head -n 2 | tr '\n' ' ')"
echo "[doctor] simulator runtimes:"
DEVELOPER_DIR="${DEVELOPER_DIR_DEFAULT}" xcrun simctl list runtimes || true
echo "[doctor] build destinations:"
"${DEVELOPER_DIR_DEFAULT}/usr/bin/xcodebuild" -showdestinations -project "${ROOT_DIR}/apps/ipad/HephCADApp.xcodeproj" -scheme HephCADApp || true
