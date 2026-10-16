import java.nio.file.Files;
import java.nio.file.Path;
import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

/**
 * Fail-closed bytecode adapter for the pinned R8 8.13.17 DEX writer.
 * Rewrites ONLY DexOutputBuffer.putShort / putInstructions.
 * No Android instructions or user sources are patched.
 */
public final class PatchD8BrowserShorts implements Opcodes {
  static final String OWNER = "com/android/tools/r8/dex/DexOutputBuffer";
  static final String BUFFER = "com/android/tools/r8/dex/CompatByteBuffer";
  static final String CODE = "com/android/tools/r8/graph/DexWritableCode";
  static final String HELPER = "com/android/tools/r8/dex/ApkForgeShortWriter";
  static final String BUF_DESC = "L" + BUFFER + ";";

  public static void main(String[] args) throws Exception {
    if (args.length != 2) throw new IllegalArgumentException("Usage: source.class output.class");
    byte[] input = Files.readAllBytes(Path.of(args[0]));
    ClassReader reader = new ClassReader(input);
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
    final int[] methods = {0, 0}, callSites = {0, 0};
    ClassVisitor adapter = new ClassVisitor(ASM8, writer) {
      @Override
      public MethodVisitor visitMethod(int access, String name, String desc, String signature,
                                       String[] exceptions) {
        if (name.equals("putShort") && desc.equals("(S)V")) {
          methods[0]++;
          MethodVisitor m = super.visitMethod(access, name, desc, signature, exceptions);
          m.visitCode();
          m.visitVarInsn(ALOAD, 0);
          m.visitInsn(ICONST_2);
          m.visitMethodInsn(INVOKESPECIAL, OWNER, "ensureSpaceFor", "(I)V", false);
          m.visitVarInsn(ALOAD, 0);
          m.visitFieldInsn(GETFIELD, OWNER, "byteBuffer", BUF_DESC);
          m.visitVarInsn(ILOAD, 1);
          m.visitMethodInsn(INVOKESTATIC, HELPER, "putShort", "(" + BUF_DESC + "S)V", false);
          m.visitInsn(RETURN);
          m.visitMaxs(0, 0);
          m.visitEnd();
          return null;
        }
        MethodVisitor m = super.visitMethod(access, name, desc, signature, exceptions);
        if (!name.equals("putInstructions")) return m;
        methods[1]++;
        return new MethodVisitor(ASM8, m) {
          boolean waitStore = false;
          int shortBufferLocal = -1;
          @Override
          public void visitVarInsn(int opcode, int var) {
            if (waitStore) {
              if (opcode != ASTORE) throw new IllegalStateException("Unexpected ShortBuffer local assignment");
              shortBufferLocal = var;
              waitStore = false;
            }
            super.visitVarInsn(opcode, var);
          }
          @Override
          public void visitMethodInsn(int opcode, String owner, String method, String descriptor,
                                      boolean itf) {
            if (owner.equals(BUFFER) && method.equals("asShortBuffer")) {
              if (!descriptor.equals("()Ljava/nio/ShortBuffer;"))
                throw new IllegalStateException("R8 ShortBuffer API changed");
              super.visitVarInsn(ALOAD, 2); // DexWritableCode parameter
              super.visitMethodInsn(INVOKESTATIC, HELPER, "newBuffer",
                  "(" + BUF_DESC + "L" + CODE + ";)Ljava/nio/ShortBuffer;", false);
              callSites[0]++;
              waitStore = true;
              return;
            }
            super.visitMethodInsn(opcode, owner, method, descriptor, itf);
            if (owner.equals(CODE) && method.equals("writeDex")) {
              if (shortBufferLocal < 0)
                throw new IllegalStateException("DEX ShortBuffer local not found");
              super.visitVarInsn(ALOAD, 0);
              super.visitFieldInsn(GETFIELD, OWNER, "byteBuffer", BUF_DESC);
              super.visitVarInsn(ALOAD, shortBufferLocal);
              super.visitMethodInsn(INVOKESTATIC, HELPER, "flush",
                  "(" + BUF_DESC + "Ljava/nio/ShortBuffer;)V", false);
              callSites[1]++;
            }
          }
        };
      }
    };
    reader.accept(adapter, 0);
    if (methods[0] != 1 || methods[1] != 1 || callSites[0] != 1 || callSites[1] != 1)
      throw new IllegalStateException("R8 binary no longer matches tested patch: " +
          java.util.Arrays.toString(methods) + " / " + java.util.Arrays.toString(callSites));
    Path target = Path.of(args[1]);
    Files.createDirectories(target.getParent());
    Files.write(target, writer.toByteArray());
    System.out.println("PATCH R8 DEX: ByteBuffer.putShort and ShortBuffer instruction writes adapted.");
  }
}
