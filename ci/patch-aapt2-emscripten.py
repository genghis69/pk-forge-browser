from pathlib import Path
import sys

# Apply changes only inside the ephemeral upstream source checkout.
# Never change the user's ZIP or substitute fake resource binaries.
source = Path(sys.argv[1]).resolve()
top = source / "CMakeLists.txt"
text = top.read_text()
old = 'if(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "armeabi-v7a")'
if old not in text:
    raise RuntimeError("Upstream ABI selection has changed")
text = text.replace(
    old,
    'if(EMSCRIPTEN)\n'
    '    message(STATUS "AAPT2 WebAssembly experimental")\n'
    'elseif(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "armeabi-v7a")',
    1,
)
text = text.replace(
    'set(CMAKE_EXE_LINKER_FLAGS "-static")',
    'if(NOT EMSCRIPTEN)\n'
    '    set(CMAKE_EXE_LINKER_FLAGS "-static")\n'
    'endif()',
    1,
)
if "set(CMAKE_CXX_STANDARD 20)" not in text:
    raise RuntimeError("Upstream C++ standard changed")
text = text.replace(
    "set(CMAKE_CXX_STANDARD 20)",
    "if(EMSCRIPTEN)\n"
    "    set(CMAKE_CXX_STANDARD 17)\n"
    "else()\n"
    "    set(CMAKE_CXX_STANDARD 20)\n"
    "endif()",
    1,
)
top.write_text(text)

# Android's <sys/cdefs.h> is a Bionic-specific header absent from
# Emscripten/musl. Several NDK public Android headers include it directly,
# not just configuration.h. Guard those includes only in the ephemeral
# wasm32 checkout. Never import host glibc headers into Emscripten.
native_headers = source / "submodules/native/include/android"
patched_headers = []
for header in sorted(native_headers.rglob("*.h")):
    contents = header.read_text()
    needle = "#include <sys/cdefs.h>"
    if needle not in contents:
        continue
    if contents.count(needle) != 1:
        raise RuntimeError(f"Ambiguous Bionic include: {header}")
    contents = contents.replace(
        needle,
        "#if !defined(__EMSCRIPTEN__)\\n"
        "#include <sys/cdefs.h>\\n"
        "#endif /* !__EMSCRIPTEN__ */",
        1,
    )
    header.write_text(contents)
    patched_headers.append(header.relative_to(source).as_posix())
for required in ("submodules/native/include/android/configuration.h",
                 "submodules/native/include/android/asset_manager.h"):
    if required not in patched_headers:
        raise RuntimeError(f"Expected Bionic header missing or changed: {required}")
print("Guarded Android Bionic includes for wasm32:", ", ".join(patched_headers))

cmake = source / "cmake" / "aapt2.cmake"
text = cmake.read_text()
text = text.replace("    c++_static\n", "")
output_marker = 'set_target_properties(aapt2 PROPERTIES OUTPUT_NAME "aapt2-${CMAKE_ANDROID_ARCH_ABI}")'
if output_marker not in text:
    raise RuntimeError("Upstream AAPT2 output target has changed")
text = text.replace(
    output_marker,
    """if(EMSCRIPTEN)
    set_target_properties(aapt2 PROPERTIES OUTPUT_NAME "aapt2" SUFFIX ".js")
    target_link_options(aapt2 PRIVATE
        "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sENVIRONMENT=web,node"
        "-sINVOKE_RUN=0" "-sEXIT_RUNTIME=0" "-sFORCE_FILESYSTEM=1"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sEXPORTED_RUNTIME_METHODS=FS,callMain"
        "-sEXPORTED_FUNCTIONS=_main"
        "-sUSE_ZLIB=1")
else()
    set_target_properties(aapt2 PROPERTIES OUTPUT_NAME "aapt2-${CMAKE_ANDROID_ARCH_ABI}")
endif()""",
    1,
)
native_linker = 'target_link_options(aapt2 PRIVATE "-Wl,-z,max-page-size=16384")'
if native_linker not in text:
    raise RuntimeError("Upstream AAPT2 native linker flags have changed")
text = text.replace(
    native_linker,
    'if(NOT EMSCRIPTEN)\n'
    '    target_link_options(aapt2 PRIVATE "-Wl,-z,max-page-size=16384")\n'
    'endif()',
    1,
)
cmake.write_text(text)
print("Patched isolated AOSP AAPT2 sources for Emscripten, including Bionic configuration header.")
