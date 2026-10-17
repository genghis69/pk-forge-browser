/**
 * Inputs to the real Eclipse JDT Compiler API adapter, NOT ECJ batch.Main.
 * ECJ batch.Main probes CheerpJ java.home (/lt/17) for JDK system modules,
 * but that location is a virtual runtime, not a JDK installation.
 *
 * The adapter uses ECJ 3.43.0 Compiler + FileSystem directly and is pinned to
 * Java 17. The supplied Android and Maven JARs are never replaced by stubs.
 */
export function ecjAndroidArguments({androidJar,classpath,outputDir,sources}){
 const allowed=p=>typeof p==='string'&&/^(?:\/str\/|\/files\/)[^\s:]+$/.test(p)&&!p.split('/').includes('..');
 if(!allowed(androidJar)||!androidJar.endsWith('.jar'))
  throw Error('ECJ : chemin du SDK Android incorrect.');
 if(!Array.isArray(classpath)||!classpath.length||!classpath.every(p=>allowed(p)&&p.endsWith('.jar')))
  throw Error('ECJ : classpath Java invalide.');
 if(!classpath.includes(androidJar))
  throw Error('ECJ : android.jar doit fournir les API Java et Android.');
 if(!allowed(outputDir))throw Error('ECJ : répertoire de sortie invalide.');
 if(!Array.isArray(sources)||!sources.length||!sources.every(s=>allowed(s)&&s.endsWith('.java')))
  throw Error('ECJ : fichiers Java invalides ou absents.');
 if(new Set(sources).size!==sources.length)throw Error('ECJ : fichiers source dupliqués.');
 return [outputDir,classpath.join(':'),...sources];
}
