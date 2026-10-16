import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import jdk.internal.org.objectweb.asm.*;

/** Patches Java NIO short write callsites inside obfuscated Google Maven R8.
 * The obfuscated class names vary, so match exact JDK API calls, fail closed.
 * The output must match the original byte-for-byte on native Java 17 CI.
 */
public final class PatchD8NioCalls implements Opcodes {
  private static final String HELPER="com/android/tools/r8/dex/ApkForgeNioShortCompat";
  public static void main(String[] args)throws Exception{
    if(args.length!=2)throw new IllegalArgumentException("Expected r8.jar patched.jar");
    Path orig=Path.of(args[0]),dest=Path.of(args[1]);
    int[] hits=new int[7];
    try(ZipFile zip=new ZipFile(orig.toFile());
        ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(dest))){
      for(Enumeration<? extends ZipEntry> e=zip.entries();e.hasMoreElements();){
        ZipEntry z=e.nextElement();
        if(z.getName().matches("(?i)META-INF/.*\\.(SF|RSA|DSA|EC)"))continue;
        byte[] data;
        try(InputStream input=zip.getInputStream(z)){data=input.readAllBytes();}
        if(z.getName().endsWith(".class")){
          ClassReader reader=new ClassReader(data);
          ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);
          reader.accept(new ClassVisitor(ASM8,writer){
            @Override public MethodVisitor visitMethod(int a,String n,String d,String signature,String[] exceptions){
              MethodVisitor original=super.visitMethod(a,n,d,signature,exceptions);
              return new MethodVisitor(ASM8,original){
                @Override public void visitMethodInsn(int op,String owner,String name,String desc,boolean itf){
                  String helper=null,rewritten=null;
                  if(owner.equals("java/nio/ByteBuffer")){
                    if(name.equals("putShort")&&desc.equals("(S)Ljava/nio/ByteBuffer;")){
                      helper="putShort";rewritten="(Ljava/nio/ByteBuffer;S)Ljava/nio/ByteBuffer;";hits[0]++;
                    }else if(name.equals("putShort")&&desc.equals("(IS)Ljava/nio/ByteBuffer;")){
                      helper="putShortAt";rewritten="(Ljava/nio/ByteBuffer;IS)Ljava/nio/ByteBuffer;";hits[1]++;
                    }else if(name.equals("asShortBuffer")&&desc.equals("()Ljava/nio/ShortBuffer;")){
                      helper="view";rewritten="(Ljava/nio/ByteBuffer;)Ljava/nio/ShortBuffer;";hits[2]++;
                    }
                  }else if(owner.equals("java/nio/ShortBuffer")&&name.equals("put")){
                    if(desc.equals("(S)Ljava/nio/ShortBuffer;")){
                      helper="put";rewritten="(Ljava/nio/ShortBuffer;S)Ljava/nio/ShortBuffer;";hits[3]++;
                    }else if(desc.equals("(IS)Ljava/nio/ShortBuffer;")){
                      helper="putAt";rewritten="(Ljava/nio/ShortBuffer;IS)Ljava/nio/ShortBuffer;";hits[4]++;
                    }else if(desc.equals("([S)Ljava/nio/ShortBuffer;")){
                      helper="putArray";rewritten="(Ljava/nio/ShortBuffer;[S)Ljava/nio/ShortBuffer;";hits[5]++;
                    }else if(desc.equals("([SII)Ljava/nio/ShortBuffer;")){
                      helper="putArrayRange";rewritten="(Ljava/nio/ShortBuffer;[SII)Ljava/nio/ShortBuffer;";hits[6]++;
                    }
                  }
                  if(helper!=null)super.visitMethodInsn(INVOKESTATIC,HELPER,helper,rewritten,false);
                  else super.visitMethodInsn(op,owner,name,desc,itf);
                }
              };
            }
          },0);
          data=writer.toByteArray();
        }
        ZipEntry entry=new ZipEntry(z.getName());
        out.putNextEntry(entry);
        if(!z.isDirectory())out.write(data);
        out.closeEntry();
      }
    }
    if(hits[0]<1||hits[2]<1||hits[3]<1)
      throw new IllegalStateException("R8 has changed required 16-bit calls: "+Arrays.toString(hits));
    System.out.println("PATCH R8 NIO calls: "+Arrays.toString(hits)+
      " (ByteBuffer short, ShortBuffer write). Native DEX equality tested separately.");
  }
}
