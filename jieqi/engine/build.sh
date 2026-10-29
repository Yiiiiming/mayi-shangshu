#!/usr/bin/env bash
# Build the full AB-JChess v0.2d NNUE engine for browsers with Emscripten 3.1.74.
# Usage: ./build.sh /path/to/patched/AB-JChess/source /path/to/output
set -euo pipefail
source_root=${1:?Pass the patched source repository root}
output_dir=${2:?Pass an output directory}
mkdir -p "$output_dir"
sources=()
while IFS= read -r file; do sources+=("$file"); done < <(find "$source_root/abjchess/src" -name '*.cpp' | sort)
em++ "${sources[@]}" -I"$source_root/abjchess/src" \
  -std=c++17 -O3 -funroll-loops -DNDEBUG -DIS_64BIT -DNO_PREFETCH \
  -DUSE_POPCNT -DUSE_SSE2 -msse2 -DUSE_SSSE3 -mssse3 -DUSE_SSE41 -msse4.1 \
  -DUSE_SLOPPY_ATOMICS -msimd128 -pthread -fexceptions \
  -sWASM=1 -sMODULARIZE=1 -sEXPORT_NAME=ABJChess -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_abj_initialize,_abj_command,_main,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,FS -sDISABLE_EXCEPTION_CATCHING=0 \
  -sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2GB \
  -sSTACK_SIZE=4MB -sPTHREAD_POOL_SIZE=4 -sPTHREAD_POOL_SIZE_STRICT=0 \
  -sNO_EXIT_RUNTIME=1 -sINVOKE_RUN=0 -o "$output_dir/abjchess.js"
