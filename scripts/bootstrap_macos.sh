#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
XCODEBUILD="${DEVELOPER_DIR_DEFAULT}/usr/bin/xcodebuild"

echo "[bootstrap] repo: ${ROOT_DIR}"

if ! command -v brew >/dev/null 2>&1; then
  echo "[bootstrap] Homebrew is required: https://brew.sh/"
  exit 1
fi

if [[ ! -d "${DEVELOPER_DIR_DEFAULT}" ]]; then
  echo "[bootstrap] missing Xcode developer dir at ${DEVELOPER_DIR_DEFAULT}"
  echo "[bootstrap] install full Xcode and export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer"
  exit 1
fi

echo "[bootstrap] ensuring host tools"
brew install cmake ninja

echo "[bootstrap] checking Xcode first-launch state"
if ! "${XCODEBUILD}" -checkFirstLaunchStatus >/dev/null 2>&1; then
  echo "[bootstrap] Xcode first-launch tasks are pending."
  echo "[bootstrap] run: sudo xcodebuild -runFirstLaunch"
fi

echo "[bootstrap] checking simulator runtimes"
if ! DEVELOPER_DIR="${DEVELOPER_DIR_DEFAULT}" xcrun simctl list runtimes | grep -q "iOS"; then
  echo "[bootstrap] no iOS simulator runtime detected."
  echo "[bootstrap] downloading iOS platform/runtime with xcodebuild -downloadPlatform iOS"
  "${XCODEBUILD}" -downloadPlatform iOS
else
  echo "[bootstrap] iOS simulator runtime already installed"
fi

echo "[bootstrap] export DEVELOPER_DIR=${DEVELOPER_DIR_DEFAULT}"
echo "[bootstrap] next:"
echo "  ${ROOT_DIR}/scripts/doctor.sh"
echo "  ${ROOT_DIR}/scripts/build_occt_ios.sh"
