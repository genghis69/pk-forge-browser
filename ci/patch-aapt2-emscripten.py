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
    "    set(CMAKE_CXX_STANDARD 23)\n"
    "else()\n"
    "    set(CMAKE_CXX_STANDARD 20)\n"
    "endif()",
    1,
)
# AAPT2 needs C++20 APIs; Emscripten's <stdatomic.h> also requires C++23.
# fmt 10.2.0 itself works under C++17 on the pinned Clang toolchain.
fmt_marker = "add_subdirectory(submodules/fmtlib EXCLUDE_FROM_ALL)"
if fmt_marker not in text:
    raise RuntimeError("Upstream fmt build declaration changed")
text = text.replace(fmt_marker, """add_subdirectory(submodules/fmtlib EXCLUDE_FROM_ALL)
if(EMSCRIPTEN)
    set_property(TARGET fmt PROPERTY CXX_STANDARD 17)
endif()""", 1)
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
    source / "submodules/core/libcutils",
    source / "submodules/core/include",
    source / "submodules/libziparchive/include",
    source / "submodules/logging/liblog",
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
            "#define __BEGIN_DECLS extern \"C\" {\n"
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
    "submodules/libziparchive/include/ziparchive/zip_archive.h",
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

# Linux-only device services are not used for AAPT2 resource compilation
# in the browser. Do not provide fake implementations. If AAPT2 truly needs
# one, the real linker will fail on its unresolved symbol.
glue_file = source / "cmake/CMakeLists.txt"
glue = glue_file.read_text()
for lib in ("libincfs", "libselinux", "libsepol",
            "libpackagelistparser", "libprocessgroup"):
    old_include = "include(" + lib + ".cmake)"
    if old_include not in glue:
        raise RuntimeError("Missing upstream CMake include: " + old_include)
    glue = glue.replace(old_include,
        "if(NOT EMSCRIPTEN)\n    " + old_include + "\nendif()", 1)
glue_file.write_text(glue)
for lib in ("libincfs", "libselinux", "libsepol", "libpackagelistparser"):
    old_link = "    " + lib + "\n"
    if old_link not in text:
        raise RuntimeError("Missing upstream AAPT2 dependency: " + lib)
    text = text.replace(old_link, "", 1)

# Exclude kernel-only translation units, leaving actual AAPT2 source intact.
for name, suffixes in {
    "libcutils.cmake": (
        "/ashmem-dev.cpp", "/uevent.cpp", "/qtaguid.cpp",
        "/android_reboot.cpp", "/klog.cpp", "/trace-dev.cpp",
        "/partition_utils.cpp",
    ),
    "libutils.cmake": ("/Looper.cpp", "/Threads.cpp", "/Trace.cpp"),
    "libziparchive.cmake": ("/incfs_support/signal_handling.cpp",),
}.items():
    path = source / "cmake" / name
    contents = path.read_text()
    for suffix in suffixes:
        lines = [line for line in contents.splitlines(keepends=True)
                 if ("$" + "{SRC}") in line and suffix in line]
        if len(lines) != 1:
            raise RuntimeError("Unexpected native-only source " + suffix + " in " + name)
        contents = contents.replace(lines[0], "", 1)
    path.write_text(contents)

cmake.write_text(text)
print("Patched isolated AOSP AAPT2 sources for Emscripten, including Bionic configuration header.")
