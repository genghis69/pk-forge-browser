/*
 * Targeted compatibility fix for Kotlin 2.2.20 under CheerpJ:
 * Kotlin enables ThreadMXBean thread CPU measurement, unsupported by CheerpJ.
 * Replace exactly that INVOKEINTERFACE with POP2, keeping all other bytecode intact.
 *
 * Distributed Kotlin compiler is Apache-2.0. Patching occurs at build time only.
 * Uses the ASM classes already supplied by JDK 17, no external ASM dependency.
 */
import jdk.internal.org.objectweb.asm.*;
import java.io.*;
import java.nio.file.*;
import java.util.zip.*;

public final class PatchKotlinCpuTime {
  private static final String TARGET = "org/jetbrains/kotlin/util/PerformanceManager.class";
  private PatchKotlinCpuTime() {}
  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("Expected path to kotlin-compiler-embeddable-2.2.20.jar");
    Path jar = Paths.get(args[0]);
    Path tmp = Files.createTempFile(jar.getParent(), "kotlin-cheerpj-patch-", ".jar");
    int[] count = {0};
    boolean found = false;
    try {
      try (ZipInputStream input = new ZipInputStream(Files.newInputStream(jar));
           ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(tmp))) {
        ZipEntry entry;
        while ((entry = input.getNextEntry()) != null) {
          String name = entry.getName();
          if (name.equals(TARGET)) {
            found = true;
            ClassReader reader = new ClassReader(input.readAllBytes());
            ClassWriter writer = new ClassWriter(reader, 0);
            reader.accept(new ClassVisitor(Opcodes.ASM7, writer) {
              @Override public MethodVisitor visitMethod(int acc, String name, String desc, String sig, String[] exceptions) {
                MethodVisitor downstream = super.visitMethod(acc, name, desc, sig, exceptions);
                if (!name.equals("initializeCurrentThread") || !desc.equals("()V")) return downstream;
                return new MethodVisitor(Opcodes.ASM7, downstream) {
                  @Override public void visitMethodInsn(int opcode, String owner, String method, String descriptor, boolean itf) {
                    if (opcode == Opcodes.INVOKEINTERFACE &&
                        owner.equals("java/lang/management/ThreadMXBean") &&
                        method.equals("setThreadCpuTimeEnabled") &&
                        descriptor.equals("(Z)V")) {
                      super.visitInsn(Opcodes.POP2); // discard bean and boolean, same stack effect as method call
                      count[0]++;
                    } else super.visitMethodInsn(opcode, owner, method, descriptor, itf);
                  }
                };
              }
            }, 0);
            output.putNextEntry(new ZipEntry(name));
            output.write(writer.toByteArray());
          } else if (name.matches("META-INF/[^/]+\\.(SF|RSA|DSA)")) {
            // A modified archive must not retain potentially invalid signatures.
          } else {
            output.putNextEntry(new ZipEntry(name));
            input.transferTo(output);
          }
          if (!name.matches("META-INF/[^/]+\\.(SF|RSA|DSA)")) output.closeEntry();
          input.closeEntry();
        }
      }
      if (!found || count[0] != 1)
        throw new IllegalStateException("Aborting patch: PerformanceManager found="+found+", CPU calls="+count[0]+", expected exactly 1");
      Files.move(tmp,jar,StandardCopyOption.REPLACE_EXISTING);
      System.out.println("Kotlin 2.2.20 CheerpJ patch applied: skipped ThreadMXBean.setThreadCpuTimeEnabled(true).");
    } finally {
      Files.deleteIfExists(tmp);
    }
  }
}
