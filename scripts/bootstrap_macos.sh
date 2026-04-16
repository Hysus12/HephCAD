#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="/Applications/Xcode.app/Contents/Developer"

echo "[bootstrap] repo: ${ROOT_DIR}"

if ! command -v brew >/dev/null 2>&1; then
  echo "[bootstrap] Homebrew is required: https://brew.sh/"
  exit 1
fi

if [[ ! -d "${DEVELOPER_DIR_DEFAULT}" ]]; then
  echo "[bootstrap] Xcode.app not found at /Applications/Xcode.app"
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "[bootstrap] installing cmake"
  brew install cmake
fi

if ! command -v ninja >/dev/null 2>&1; then
  echo "[bootstrap] installing ninja"
  brew install ninja
fi

echo "[bootstrap] using DEVELOPER_DIR=${DEVELOPER_DIR_DEFAULT}"
echo "[bootstrap] export DEVELOPER_DIR=${DEVELOPER_DIR_DEFAULT}"
echo "[bootstrap] next: ${ROOT_DIR}/scripts/doctor.sh"
