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

# Asset.cpp genuinely uses IncFsFileMap to access ordinary mapped APK
# resources. Preserve the upstream implementation for the non-Android path,
# instead of disabling unresolved symbols or inventing fake methods.
# The Linux kernel incfs device service remains omitted.
glue += """
if(EMSCRIPTEN)
    add_library(libincfs STATIC
        ${SRC}/incremental_delivery/incfs/util/map_ptr.cpp
    )
    target_include_directories(libincfs PRIVATE
        ${SRC}/incremental_delivery/incfs/include
        ${SRC}/incremental_delivery/incfs/util/include
        ${SRC}/libbase/include
        ${SRC}/core/libutils/include
        ${SRC}/logging/liblog/include
    )
endif()
"""
glue_file.write_text(glue)
for lib in ("libselinux", "libsepol", "libpackagelistparser"):
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
        "/fs_config.cpp", "/canned_fs_config.cpp",
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


# Portable POSIX retry helper for Android logging sources under musl.
# Normal host libc may define this, but browser-compiled musl does not.
compat_header = source / "ci-aapt2-compat.h"
compat_header.write_text(
    "#pragma once\n"
    "#if defined(__EMSCRIPTEN__)\n"
    "#include <errno.h>\n"
    "#ifndef TEMP_FAILURE_RETRY\n"
    "#define TEMP_FAILURE_RETRY(expr) ({ __typeof__(expr) _aapt2_ret; "
    "do { _aapt2_ret = (expr); } "
    "while (_aapt2_ret == -1 && errno == EINTR); _aapt2_ret; })\n"
    "#endif\n"
    "#endif\n"
)

# This AOSP branch sometimes assumes that std::string_view::iterator is
# exactly const char*. The libc++ used by Emscripten correctly wraps it in
# __wrap_iter. Patch *only* the known incompatible expressions, preserving
# sizes and original parsing algorithms; std::to_address gives the real ptr.
aapt2_src = source / "submodules/base/tools/aapt2"
string_iterator_patches = {
    "configuration/ConfigurationParser.cpp": [
        ("std::string{apk_name.begin(), end_index}",
         "std::string{apk_name.data(), end_index}"),
    ],
    "link/ManifestFixer.cpp": [
        ("const char* startChar = attr_value.begin();",
         "const char* startChar = attr_value.data();"),
    ],
    "text/Printer.cpp": [
        ("StringPiece str_to_copy(remaining_str_begin, new_line_iter - remaining_str_begin)",
         "StringPiece str_to_copy(std::to_address(remaining_str_begin), new_line_iter - remaining_str_begin)"),
    ],
    "util/Files.cpp": [
        ("const char* start = path.begin();", "const char* start = path.data();"),
        ("const char* end = path.end();", "const char* end = path.data() + path.size();"),
        ("const char* last_dir_sep = path.begin();",
         "const char* last_dir_sep = path.data();"),
        ("for (const char* c = path.begin();", "for (const char* c = path.data();"),
        ("const char* const end = filename.end();",
         "const char* const end = filename.data() + filename.size();"),
        ("std::find(filename.begin(), end, '.')", "std::find(filename.data(), end, '.')"),
    ],
    "util/Util.cpp": [
        ("const char* c = str.begin();", "const char* c = str.data();"),
        ("const char* const end = str.end();",
         "const char* const end = str.data() + str.size();"),
        ("const char* start = token_.end();",
         "const char* start = token_.data() + token_.size();"),
        ("const char* end = str_.end();",
         "const char* end = str_.data() + str_.size();"),
        ("StringPiece(token_.end(), 0)",
         "StringPiece(token_.data() + token_.size(), 0)"),
        ("StringPiece(str.begin() - 1, 0)",
         "StringPiece(str.data() - 1, 0)"),
        ("StringPiece(str.end(), 0)",
         "StringPiece(str.data() + str.size(), 0)"),
        ("StringPiece(iter, path.end() - iter)",
         "StringPiece(std::to_address(iter), path.end() - iter)"),
        ("StringPiece(last_occurence + 1, iter - last_occurence - 1)",
         "StringPiece(std::to_address(last_occurence + 1), iter - last_occurence - 1)"),
        ("StringPiece(path.begin(), last_occurence - path.begin() + 1)",
         "StringPiece(path.data(), last_occurence - path.begin() + 1)"),
    ],
    "Resource.cpp": [
        ("android::StringPiece(s.begin(), dot - s.begin())",
         "android::StringPiece(s.data(), dot - s.begin())"),
    ],
    "ResourceUtils.cpp": [
        ("StringPiece(begin, codename_end - begin)",
         "StringPiece(std::to_address(begin), codename_end - begin)"),
    ],
}
string_iterator_patches["__androidfw__/Util.cpp"] = [
    ("StringPiece(start, current - start)",
     "StringPiece(std::to_address(start), current - start)"),
]
for relative, replacements in string_iterator_patches.items():
    path = (
        source / "submodules/base/libs/androidfw/Util.cpp"
        if relative.startswith("__androidfw__/")
        else aapt2_src / relative
    )
    contents = path.read_text()
    for old, new in replacements:
        count = contents.count(old)
        if count < 1:
            raise RuntimeError(f"Missing precise iterator fix ({old}) in {relative}")
        # Only repeated exact statement is expected for 'const char* end = path.end()'
        # and must be handled on all occurrences with the same type.
        if count != 1 and old != "const char* end = path.end();":
            raise RuntimeError(f"Ambiguous iterator fix ({old}) in {relative}: {count}")
        contents = contents.replace(old, new)
    if "std::to_address(" in contents and "#include <memory>" not in contents:
        contents = "#include <memory>\n" + contents
    path.write_text(contents)
print("Patched", len(string_iterator_patches), "C++ sources for libc++ string_view iterators.")


# Emscripten libc does not declare the POSIX strerror_r() expected by
# this Android libbase source. Use the actual strerror() message and copy
# it into the caller's buffer with POSIX-style error reporting.
strerror_source = source / "submodules/libbase/posix_strerror_r.cpp"
contents = strerror_source.read_text()
strerror_line = "return strerror_r(errnum, buf, buflen);"
if contents.count(strerror_line) != 1:
    raise RuntimeError("Upstream libbase posix_strerror_r has changed")
replacement = """#if defined(__EMSCRIPTEN__)
  if (buflen == 0) {
    return ERANGE;
  }
  const char* message = strerror(errnum);
  if (message == nullptr) {
    buf[0] = '\\0';
    return EINVAL;
  }
  const size_t actual_length = strlen(message);
  const size_t copy_length = actual_length < buflen ? actual_length : buflen - 1;
  memcpy(buf, message, copy_length);
  buf[copy_length] = '\\0';
  return actual_length >= buflen ? ERANGE : 0;
#else
  return strerror_r(errnum, buf, buflen);
#endif"""
contents = (
    "#include <errno.h>\n#include <string.h>\n"
    + contents.replace(strerror_line, replacement, 1)
)
strerror_source.write_text(contents)
print("Ported Android libbase errno-to-message conversion for wasm32.")

# Android tracing is a profiler, not part of AAPT2 resource semantics.
# Browser builds have no Android tracing daemon, so explicitly disable it.
tracing_file = source / "ci-aapt2-no-android-tracing.c"
tracing_file.write_text("""
#include <stdint.h>
uint64_t atrace_get_enabled_tags(void) { return UINT64_C(0); }
void atrace_begin_body(const char* name) { (void)name; }
void atrace_end_body(void) {}
""")
text += """
if(EMSCRIPTEN)
    target_sources(aapt2 PRIVATE "${CMAKE_SOURCE_DIR}/ci-aapt2-no-android-tracing.c")
endif()
"""
cmake.write_text(text)
print("Patched isolated AOSP AAPT2 sources for Emscripten, including Bionic configuration header.")
