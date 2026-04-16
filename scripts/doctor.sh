#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
XCODEBUILD="${DEVELOPER_DIR_DEFAULT}/usr/bin/xcodebuild"

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

if ! command -v ninja >/dev/null 2>&1; then
  echo "[doctor] ninja missing; run scripts/bootstrap_macos.sh"
else
  echo "[doctor] ninja: $(ninja --version)"
fi

echo "[doctor] swift: $(swift --version | head -n 1)"
echo "[doctor] xcodebuild: $("${XCODEBUILD}" -version | head -n 2 | tr '\n' ' ')"

echo "[doctor] first-launch status:"
if "${XCODEBUILD}" -checkFirstLaunchStatus >/dev/null 2>&1; then
  echo "[doctor] Xcode first-launch tasks complete"
else
  echo "[doctor] Xcode first-launch tasks pending; run sudo xcodebuild -runFirstLaunch"
fi

echo "[doctor] installed SDKs:"
"${XCODEBUILD}" -showsdks

echo "[doctor] simulator runtimes:"
DEVELOPER_DIR="${DEVELOPER_DIR_DEFAULT}" xcrun simctl list runtimes || true

echo "[doctor] iPad simulator devices:"
DEVELOPER_DIR="${DEVELOPER_DIR_DEFAULT}" xcrun simctl list devices available | grep -E "iPad" || true

echo "[doctor] HephCAD build destinations:"
"${XCODEBUILD}" -showdestinations -project "${ROOT_DIR}/apps/ipad/HephCADApp.xcodeproj" -scheme HephCADApp || true

echo "[doctor] OCCT install directories:"
for path in \
  "${ROOT_DIR}/third_party/build/occt/install/iphoneos/lib" \
  "${ROOT_DIR}/third_party/build/occt/install/iphonesimulator/lib"; do
  if [[ -d "${path}" ]]; then
    echo "  present: ${path}"
  else
    echo "  missing: ${path}"
  fi
done
