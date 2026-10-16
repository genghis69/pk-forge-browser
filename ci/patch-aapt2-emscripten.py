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

# The sys/cdefs.h header belongs to Android Bionic, not Emscripten.
# Guard direct imports in Android public headers used by AAPT2.
# Patches only the ephemeral GitHub runner checkout (not user's sources).
android_header_dirs = (
    source / "submodules/native/include/android",
    source / "submodules/logging/liblog/include",
    source / "submodules/core/libutils/include",
    source / "submodules/libbase/include",
    source / "submodules/base/libs/androidfw/include",
)
patched_headers = []
for directory in android_header_dirs:
    if not directory.is_dir():
        raise RuntimeError(f"Missing upstream Android headers: {directory}")
    for header in sorted(directory.rglob("*.h")):
        contents = header.read_text()
        needle = "#include <sys/cdefs.h>"
        if needle not in contents:
            continue
        if contents.count(needle) != 1:
            raise RuntimeError(f"Ambiguous Bionic include: {header}")
        guarded_include = (
            "#if !defined(__EMSCRIPTEN__)\n"
            "#include <sys/cdefs.h>\n"
            "#else\n"
            "#ifndef __BEGIN_DECLS\n"
            "#ifdef __cplusplus\n"
            "#define __BEGIN_DECLS extern \\"C\\" {\n"
            "#define __END_DECLS }\n"
            "#else\n"
            "#define __BEGIN_DECLS\n"
            "#define __END_DECLS\n"
            "#endif\n"
            "#endif\n"
            "#ifndef __INTRODUCED_IN\n"
            "#define __INTRODUCED_IN(x)\n"
            "#endif\n"
            "#ifndef __DEPRECATED_IN\n"
            "#define __DEPRECATED_IN(x)\n"
            "#endif\n"
            "#ifndef __printflike\n"
            "#define __printflike(fmt, var) __attribute__((format(printf, fmt, var)))\n"
            "#endif\n"
            "#endif /* !__EMSCRIPTEN__ */"
        )
        # Python must write real LF characters, not the two ASCII bytes '\\n'.
        assert "\\n" not in guarded_include, "Escaped newline in generated C header"
        contents = contents.replace(needle, guarded_include, 1)
        if guarded_include not in contents:
            raise RuntimeError(f"Failed to insert valid preprocessor directives into {header}")
        header.write_text(contents)
        patched_headers.append(header.relative_to(source).as_posix())
for required in (
    "submodules/native/include/android/configuration.h",
    "submodules/native/include/android/asset_manager.h",
    "submodules/logging/liblog/include/log/log_main.h",
):
    if required not in patched_headers:
        raise RuntimeError(f"Expected Android Bionic header was not patched: {required}")
print("Guarded", len(patched_headers), "Android Bionic headers for Emscripten")

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
