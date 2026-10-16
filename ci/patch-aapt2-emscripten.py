from pathlib import Path
import sys

source = Path(sys.argv[1])
top = source / 'CMakeLists.txt'
text = top.read_text()
old = 'if(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "armeabi-v7a")'
if old not in text:
    raise RuntimeError('Upstream ABI selection has changed')
text = text.replace(old, 'if(EMSCRIPTEN)\n    message(STATUS "AAPT2 WebAssembly experimental")\nelseif(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "armeabi-v7a")', 1)
text = text.replace('set(CMAKE_EXE_LINKER_FLAGS "-static")', 'if(NOT EMSCRIPTEN)\n    set(CMAKE_EXE_LINKER_FLAGS "-static")\nendif()', 1)
top.write_text(text)

cmake = source / 'cmake' / 'aapt2.cmake'
text = cmake.read_text()
text = text.replace('    c++_static\n', '')
text = text.replace(
    'set_target_properties(aapt2 PROPERTIES OUTPUT_NAME "aapt2-${CMAKE_ANDROID_ARCH_ABI}")',
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
endif()""")
text = text.replace(
    'target_link_options(aapt2 PRIVATE "-Wl,-z,max-page-size=16384")',
    'if(NOT EMSCRIPTEN)\n    target_link_options(aapt2 PRIVATE "-Wl,-z,max-page-size=16384")\nendif()')
cmake.write_text(text)
print('Patched isolated AOSP CMake recipe for Emscripten.')
