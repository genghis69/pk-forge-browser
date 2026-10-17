package dev.apkforge.tools;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import org.eclipse.jdt.core.compiler.IProblem;
import org.eclipse.jdt.internal.compiler.ClassFile;
import org.eclipse.jdt.internal.compiler.CompilationResult;
import org.eclipse.jdt.internal.compiler.Compiler;
import org.eclipse.jdt.internal.compiler.DefaultErrorHandlingPolicies;
import org.eclipse.jdt.internal.compiler.ICompilerRequestor;
import org.eclipse.jdt.internal.compiler.batch.CompilationUnit;
import org.eclipse.jdt.internal.compiler.batch.FileSystem;
import org.eclipse.jdt.internal.compiler.env.ICompilationUnit;
import org.eclipse.jdt.internal.compiler.impl.CompilerOptions;
import org.eclipse.jdt.internal.compiler.classfmt.ClassFileConstants;
import org.eclipse.jdt.internal.compiler.problem.DefaultProblemFactory;

/**
 * Runs genuine Eclipse ECJ 3.43.0 without the batch launcher's implicit JDK
 * module discovery. CheerpJ's /lt/17 is a virtual runtime, not a normal JDK
 * image. All compiler references are supplied by VERIFIED Android/Maven JARs.
 *
 * Usage: ApkForgeEcjCompiler <outputDir> <colon-separated-JARs> <file.java>...
 *
 * Never synthesizes missing APIs. Errors prevent all class-file output from
 * being accepted by APK Forge. Requires real Java 17 ECJ and SDK stubs.
 */
public final class ApkForgeEcjCompiler {
    private ApkForgeEcjCompiler() {}

    public static void main(String[] args) throws Exception {
        if (args.length < 3) throw new IllegalArgumentException(
                "Usage: <outputDir> <classpathJars> <sources...>");

        Path output = Path.of(args[0]).toAbsolutePath().normalize();
        if (!output.toString().contains("apkforge-") &&
            !output.toString().contains("java-ecj-no-system")) {
            throw new IllegalArgumentException("Output directory outside isolated build: " + output);
        }
        String[] jars = args[1].split(":", -1);
        if (jars.length == 0 || Arrays.stream(jars).anyMatch(String::isBlank)) {
            throw new IllegalArgumentException("Invalid ECJ classpath");
        }
        for (String jar : jars) {
            Path jarPath = Path.of(jar);
            if (!jar.endsWith(".jar") || !Files.isRegularFile(jarPath)) {
                throw new IOException("Unreachable verified classpath JAR: " + jar);
            }
        }
        if (!Arrays.stream(jars).anyMatch(s -> s.endsWith("/android.jar") ||
                s.equals("android.jar") || s.endsWith("\\android.jar"))) {
            throw new IOException("Missing real Android SDK android.jar");
        }

        String[] sourcePaths = Arrays.copyOfRange(args, 2, args.length);
        ICompilationUnit[] sources = new ICompilationUnit[sourcePaths.length];
        for (int i = 0; i < sourcePaths.length; i++) {
            Path sourcePath = Path.of(sourcePaths[i]);
            if (!sourcePath.toString().endsWith(".java") ||
                !Files.isRegularFile(sourcePath)) {
                throw new IOException("Missing Java source: " + sourcePath);
            }
            char[] body = Files.readString(sourcePath, StandardCharsets.UTF_8).toCharArray();
            sources[i] = new CompilationUnit(body, sourcePath.toString(), "UTF-8");
        }

        CompilerOptions options = new CompilerOptions();
        options.sourceLevel = ClassFileConstants.JDK17;
        options.complianceLevel = ClassFileConstants.JDK17;
        options.targetJDK = ClassFileConstants.JDK17;
        options.produceReferenceInfo = false;

        // Unlike batch.Main, this constructor only processes supplied classpath
        // entries. It does not locate java.home/lib/modules or /lt/17.
        AtomicInteger errors = new AtomicInteger();
        AtomicInteger classFiles = new AtomicInteger();
        FileSystem environment = new FileSystem(jars, sourcePaths, "UTF-8");
        try {
            ICompilerRequestor receiver = (CompilationResult result) -> {
                IProblem[] problems = result.getProblems();
                if (problems != null) {
                    for (IProblem problem : problems) {
                        String severity = problem.isError() ? "ERREUR" : "AVERTISSEMENT";
                        String file = new String(problem.getOriginatingFileName());
                        System.err.println("[ECJ " + severity + "] " + file + ":" +
                                problem.getSourceLineNumber() + " " + problem.getMessage());
                        if (problem.isError()) errors.incrementAndGet();
                    }
                }
                if (result.hasErrors()) {
                    if (problems == null) errors.incrementAndGet();
                    return;
                }
                for (ClassFile file : result.getClassFiles()) {
                    String relativeName = new String(file.fileName()).replace('\\', '/') + ".class";
                    Path destination = output.resolve(relativeName).normalize();
                    if (!destination.startsWith(output)) {
                        throw new IllegalStateException("Invalid ECJ output: " + relativeName);
                    }
                    try {
                        Files.createDirectories(destination.getParent());
                        Files.write(destination, file.getBytes());
                        classFiles.incrementAndGet();
                    } catch (IOException ex) {
                        throw new IllegalStateException("Cannot write Java class: " + destination, ex);
                    }
                }
            };
            Compiler compiler = new Compiler(environment,
                    DefaultErrorHandlingPolicies.proceedWithAllProblems(),
                    options, receiver, new DefaultProblemFactory(Locale.ROOT));
            compiler.compile(sources);
        } finally {
            environment.cleanup();
        }
        if (errors.get() != 0 || classFiles.get() == 0) {
            throw new IllegalStateException("ECJ Java 17 failed: " + errors.get() +
                    " errors, " + classFiles.get() + " compiled classes");
        }
        System.out.println("[APK FORGE ECJ] Java 17: " + sourcePaths.length +
                " sources, " + classFiles.get() + " classes, no system JDK modules.");
    }
}
