#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/third_party/build/lib3mf"
SRC_DIR="${ROOT_DIR}/third_party/src/lib3mf"

mkdir -p "${BUILD_DIR}" "${ROOT_DIR}/third_party/src"

cat <<EOF
[build_lib3mf_apple] Placeholder build script.
[build_lib3mf_apple] Expected source dir: ${SRC_DIR}
[build_lib3mf_apple] Expected build dir: ${BUILD_DIR}
[build_lib3mf_apple] Implement lib3mf 2.3.2 source extraction + Apple platform build here.
EOF
