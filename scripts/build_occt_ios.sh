#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVELOPER_DIR_DEFAULT="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
XCODE_TOOLCHAIN="${DEVELOPER_DIR_DEFAULT}/Toolchains/XcodeDefault.xctoolchain/usr/bin"
SRC_DIR="${ROOT_DIR}/third_party/src/occt"
BUILD_ROOT="${ROOT_DIR}/third_party/build/occt-ninja"
ENV_ROOT="${ROOT_DIR}/third_party/build/occt"
INSTALL_ROOT="${ENV_ROOT}/install"
DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-17.0}"
SDKS=(${OCCT_SDKS:-iphoneos})
OCCT_TOOLKITS=(
  TKernel
  TKMath
  TKG2d
  TKG3d
  TKGeomBase
  TKGeomAlgo
  TKBRep
  TKTopAlgo
  TKPrim
  TKBO
  TKMesh
  TKShHealing
  TKService
  TKHLR
  TKV3d
  TKOpenGles
  TKCDF
  TKLCAF
  TKCAF
  TKVCAF
  TKXCAF
  TKDE
  TKXSBase
  TKDESTEP
  TKBinL
  TKBin
  TKBinXCAF
)
FRONTIER_TARGETS=(
  TKernel
  TKOpenGles
  TKDESTEP
  TKBinXCAF
)

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "[build_occt_ios] missing source dir ${SRC_DIR}"
  echo "[build_occt_ios] clone OCCT first or run bootstrap steps"
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "[build_occt_ios] cmake is required"
  exit 1
fi

if ! command -v ninja >/dev/null 2>&1; then
  echo "[build_occt_ios] ninja is required"
  exit 1
fi

if [[ ! -x "${XCODE_TOOLCHAIN}/clang" || ! -x "${XCODE_TOOLCHAIN}/clang++" ]]; then
  echo "[build_occt_ios] missing Xcode toolchain compilers under ${XCODE_TOOLCHAIN}"
  exit 1
fi

mkdir -p "${BUILD_ROOT}" "${INSTALL_ROOT}" "${ENV_ROOT}"

sdk_path_for() {
  local sdk="$1"
  case "${sdk}" in
    iphoneos)
      echo "${DEVELOPER_DIR_DEFAULT}/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS17.2.sdk"
      ;;
    iphonesimulator)
      echo "${DEVELOPER_DIR_DEFAULT}/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator17.2.sdk"
      ;;
    *)
      echo ""
      ;;
  esac
}

toolkit_csv() {
  local csv=""
  local toolkit=""
  for toolkit in "${OCCT_TOOLKITS[@]}"; do
    if [[ -n "${csv}" ]]; then
      csv="${csv};"
    fi
    csv="${csv}${toolkit}"
  done
  printf '%s' "${csv}"
}

build_one() {
  local sdk="$1"
  local sdk_path
  local build_dir="${BUILD_ROOT}/${sdk}"
  local install_dir="${INSTALL_ROOT}/${sdk}"
  local toolkit_list

  sdk_path="$(sdk_path_for "${sdk}")"
  if [[ -z "${sdk_path}" || ! -d "${sdk_path}" ]]; then
    echo "[build_occt_ios] missing SDK path for ${sdk}: ${sdk_path}"
    exit 1
  fi

  toolkit_list="$(toolkit_csv)"

  echo "[build_occt_ios] configuring ${sdk}"
  cmake -S "${SRC_DIR}" -B "${build_dir}" -G Ninja \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT="${sdk_path}" \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET}" \
    -DCMAKE_C_COMPILER="${XCODE_TOOLCHAIN}/clang" \
    -DCMAKE_CXX_COMPILER="${XCODE_TOOLCHAIN}/clang++" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_LIBRARY_TYPE=Static \
    -DBUILD_MODULE_FoundationClasses=OFF \
    -DBUILD_MODULE_ModelingData=OFF \
    -DBUILD_MODULE_ModelingAlgorithms=OFF \
    -DBUILD_MODULE_Visualization=OFF \
    -DBUILD_MODULE_ApplicationFramework=OFF \
    -DBUILD_MODULE_DataExchange=OFF \
    -DBUILD_MODULE_DETools=OFF \
    -DBUILD_MODULE_Draw=OFF \
    -DBUILD_DOC_Overview=OFF \
    -DBUILD_USE_PCH=OFF \
    -DUSE_FREETYPE=OFF \
    -DUSE_TBB=OFF \
    -DUSE_VTK=OFF \
    -DCMAKE_INSTALL_PREFIX="${install_dir}" \
    -DBUILD_ADDITIONAL_TOOLKITS="${toolkit_list}"

  echo "[build_occt_ios] building ${sdk} target TKernel"
  cmake --build "${build_dir}" --target TKernel -j 1

  echo "[build_occt_ios] building ${sdk} frontier targets: ${FRONTIER_TARGETS[*]}"
  cmake --build "${build_dir}" --target "${FRONTIER_TARGETS[@]}" -j 1

  echo "[build_occt_ios] installing ${sdk}"
  cmake --install "${build_dir}"

  echo "[build_occt_ios] verifying ${sdk} install output"
  local toolkit=""
  for toolkit in "${OCCT_TOOLKITS[@]}"; do
    if [[ ! -f "${install_dir}/lib/lib${toolkit}.a" ]]; then
      echo "[build_occt_ios] missing installed library ${install_dir}/lib/lib${toolkit}.a"
      exit 1
    fi
  done
}

for sdk in "${SDKS[@]}"; do
  build_one "${sdk}"
done

cat > "${BUILD_ROOT}/occt_env.sh" <<EOF
export HEPHCAD_OCCT_INCLUDE_IPHONEOS="${INSTALL_ROOT}/iphoneos/include/opencascade"
export HEPHCAD_OCCT_LIB_IPHONEOS="${INSTALL_ROOT}/iphoneos/lib"
export HEPHCAD_OCCT_INCLUDE_SIMULATOR="${INSTALL_ROOT}/iphonesimulator/include/opencascade"
export HEPHCAD_OCCT_LIB_SIMULATOR="${INSTALL_ROOT}/iphonesimulator/lib"
EOF

cp "${BUILD_ROOT}/occt_env.sh" "${ENV_ROOT}/occt_env.sh"

echo "[build_occt_ios] complete"
echo "[build_occt_ios] include: ${INSTALL_ROOT}/iphoneos/include/opencascade"
echo "[build_occt_ios] libs: ${INSTALL_ROOT}/iphoneos/lib"
