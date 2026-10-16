package dev.apkforge.tools;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.jar.*;
import java.util.stream.*;
public final class BuildClassesJar {
  private BuildClassesJar(){}
  public static void main(String[] args) throws Exception {
    if(args.length!=2)throw new IllegalArgumentException("Usage: BuildClassesJar <classes-directory> <output-jar>");
    Path classes=Paths.get(args[0]).toAbsolutePath().normalize(),out=Paths.get(args[1]).toAbsolutePath().normalize();
    if(!Files.isDirectory(classes))throw new IOException("Kotlin class folder missing: "+classes);
    Files.createDirectories(out.getParent());
    List<Path> paths;
    try(Stream<Path> walk=Files.walk(classes)){
      paths=walk.filter(p->Files.isRegularFile(p) && p.toString().endsWith(".class"))
        .sorted().collect(Collectors.toList());
    }
    if(paths.isEmpty())throw new IOException("No .class created by Kotlin, refusing fake jar");
    if(paths.size()>12000)throw new IOException("Too many compiled classes");
    try(JarOutputStream zip=new JarOutputStream(Files.newOutputStream(out))) {
      for(Path file:paths){
        String name=classes.relativize(file).toString().replace('\\','/');
        if(name.startsWith("/") || name.contains("../"))throw new IOException("Invalid output class path: "+name);
        zip.putNextEntry(new JarEntry(name));
        Files.copy(file,zip);
        zip.closeEntry();
      }
    }
    if(Files.size(out)<50)throw new IOException("Output jar missing or empty");
    System.out.println("[APK FORGE] "+paths.size()+" JVM classes, "+Files.size(out)+" bytes");
  }
}
