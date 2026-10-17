/**
 * ECJ is executed on CheerpJ Java 17, whose java.home (/lt/17) is a
 * virtual runtime, NOT a standard host JDK image with jrt:/ modules.
 * Never ask ECJ to discover that virtual directory as system libraries.
 *
 * Android.jar is the real API/Java stubs supplied by the Android SDK.
 * Keep Java language/bytecode level 17; do not silently downgrade to 8.
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
 return [
  '-17',
  '-proc:none',
  '--system','none',
  '-encoding','UTF-8',
  '-classpath',classpath.join(':'),
  '-d',outputDir,
  ...sources
 ];
}
