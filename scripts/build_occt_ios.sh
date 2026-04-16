#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/third_party/build/occt"
SRC_DIR="${ROOT_DIR}/third_party/src/occt"

mkdir -p "${BUILD_DIR}" "${ROOT_DIR}/third_party/src"

cat <<EOF
[build_occt_ios] Placeholder build script.
[build_occt_ios] Expected source dir: ${SRC_DIR}
[build_occt_ios] Expected build dir: ${BUILD_DIR}
[build_occt_ios] Implement OCCT 7.9.0 source extraction + CMake configure for iphoneos/iphonesimulator.
EOF
