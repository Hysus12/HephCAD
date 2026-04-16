#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
XCODEBUILD="${DEVELOPER_DIR_DEFAULT}/usr/bin/xcodebuild"

cd "${ROOT_DIR}"

echo "[ios-build-check] validating project layout"
"${XCODEBUILD}" -list -project apps/ipad/HephCADApp.xcodeproj >/dev/null

if ! "${XCODEBUILD}" -showdestinations -project apps/ipad/HephCADApp.xcodeproj -scheme HephCADApp | grep -q "Any iOS Device"; then
  echo "[ios-build-check] no iOS destination discovered"
  exit 1
fi

if DEVELOPER_DIR="${DEVELOPER_DIR_DEFAULT}" xcrun simctl list runtimes | grep -q "iOS"; then
  echo "[ios-build-check] iOS simulator runtime detected"
else
  echo "[ios-build-check] no iOS simulator runtime installed; continuing with generic iOS device build"
fi

if [[ ! -d "${ROOT_DIR}/third_party/build/occt/install/iphoneos/lib" ]]; then
  echo "[ios-build-check] OCCT iphoneos libraries are missing."
  echo "[ios-build-check] run ./scripts/build_occt_ios.sh before building the app."
  exit 1
fi

set +e
"${XCODEBUILD}" \
  -project apps/ipad/HephCADApp.xcodeproj \
  -scheme HephCADApp \
  -destination "generic/platform=iOS" \
  CODE_SIGNING_ALLOWED=NO \
  build
status=$?
set -e

if [[ ${status} -ne 0 ]]; then
  echo "[ios-build-check] generic iOS build failed."
  echo "[ios-build-check] common cause on this machine: Xcode lists the iOS SDK but has no installed iOS platform/runtime destination."
  echo "[ios-build-check] project parsing succeeded; inspect 'xcodebuild -showdestinations -project apps/ipad/HephCADApp.xcodeproj -scheme HephCADApp' for details."
  exit ${status}
fi
