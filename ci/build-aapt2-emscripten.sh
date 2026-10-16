#!/usr/bin/env bash
# Experimental port of REAL AOSP AAPT2 C++ to WebAssembly.
# Only public upstream sources and a synthetic fixture are permitted in CI.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/ci/build/aapt2-upstream"
OUT="$ROOT/ci/build/aapt2-wasm-build"
command -v emcmake >/dev/null
command -v emcc >/dev/null
command -v protoc >/dev/null
mkdir -p "$ROOT/ci/build"
if [[ ! -f "$SRC/CMakeLists.txt" ]]; then
  git clone --depth 1 https://github.com/ReVanced/aapt2.git "$SRC"
  git -C "$SRC" submodule update --init --recursive --depth 1 --jobs 8
  (cd "$SRC" && ./patch.sh)
fi
python3 "$ROOT/ci/patch-aapt2-emscripten.py" "$SRC"
emcmake cmake -S "$SRC" -B "$OUT" -GNinja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_ANDROID_ARCH_ABI=wasm32 \
  -DProtobuf_PROTOC_EXECUTABLE="$(command -v protoc)" \
  -DPROTOC_PATH="$(command -v protoc)" \
  -DPNG_SHARED=OFF \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_C_FLAGS="-sUSE_ZLIB=1" \
  -DCMAKE_CXX_FLAGS="-sUSE_ZLIB=1"
emmake cmake --build "$OUT" --target aapt2 --parallel 4
WASM_JS="$(find "$OUT" -type f -name aapt2.js -print -quit)"
if [[ -z "$WASM_JS" || ! -s "$WASM_JS" || ! -s "${WASM_JS%.js}.wasm" ]]; then
  echo "::error::No actual AAPT2 WASM binary was produced"
  exit 1
fi
mkdir -p "$ROOT/ci/build/aapt2-web"
cp "$WASM_JS" "${WASM_JS%.js}.wasm" "$ROOT/ci/build/aapt2-web/"
node "$ROOT/ci/verify-real-aapt2-wasm.mjs" "$ROOT/ci/build/aapt2-web/aapt2.js"
