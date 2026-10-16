package com.android.tools.r8.dex;

import com.android.tools.r8.graph.DexWritableCode;
import java.nio.ShortBuffer;

/**
 * Emscripten-independent workaround for browser Java NIO short-buffer writes.
 * Only the on-disk 16-bit writer is replaced; D8 still produces all instructions.
 * This class is compiled into the pinned, SHA-256 catalogued R8 jar in CI.
 */
public final class ApkForgeShortWriter {
  private ApkForgeShortWriter() {}

  public static void putShort(CompatByteBuffer dest, short value) {
    dest.put((byte) (value & 0xff));
    dest.put((byte) ((value >>> 8) & 0xff));
  }

  public static ShortBuffer newBuffer(CompatByteBuffer dest, DexWritableCode code) {
    int count = code.codeSizeInBytes();
    if (count < 0 || count > dest.remaining() / 2) {
      throw new IllegalStateException("DEX code size exceeds output buffer: " + count);
    }
    return ShortBuffer.allocate(count);
  }

  public static void flush(CompatByteBuffer dest, ShortBuffer shorts) {
    byte[] target = dest.array();
    int offset = dest.arrayOffset() + dest.position();
    int count = shorts.position();
    if (count < 0 || offset < 0 || ((long) offset + count * 2L) > target.length) {
      throw new IllegalStateException("DEX instruction output out of bounds");
    }
    for (int i = 0; i < count; i++) {
      int value = shorts.get(i) & 0xffff;
      target[offset + i * 2] = (byte) value;
      target[offset + i * 2 + 1] = (byte) (value >>> 8);
    }
  }
}
