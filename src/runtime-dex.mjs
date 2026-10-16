/**
 * Choisit les bibliothèques JVM réellement nécessaires dans le DEX Android.
 *
 * Les JAR du compilateur Kotlin ne doivent JAMAIS devenir des dépendances runtime.
 * Le stdlib Kotlin du projet est remplacé par la version identique au compilateur
 * (2.2.20 ici) afin d'éviter les classes kotlin.* dupliquées.
 *
 * Ne compile ni AAPT2 ni les ressources, et ne crée pas un APK installable.
 */
export const KOTLIN_RUNTIME_VERSION='2.2.20';
export const KOTLIN_RUNTIME_JAR='kotlin-stdlib-2.2.20.jar';
export function planRuntimeJars(artifacts,stdlib=KOTLIN_RUNTIME_JAR){
 if(!Array.isArray(artifacts))throw Error('Catalogue Android absent.');
 if(!artifacts.some(a=>a.kind==='platform'&&a.name==='android.jar'))
  throw Error('Android SDK 36 manquant.');
 if(!/^[\w.-]+\.jar$/.test(stdlib))throw Error('Kotlin stdlib invalide.');
 const chosen=[],skipped=[],seen=new Set();
 for(const item of artifacts) {
  if(item.kind!=='dependency')continue;
  if(typeof item.name!=='string'||!item.name.endsWith('.jar')||!item.relative)throw Error('Dépendance JAR invalide.');
  if(/^org\.jetbrains\.kotlin-kotlin-stdlib(?:-(?:jdk7|jdk8|common))?-\d/.test(item.name)){
   skipped.push({name:item.name,reason:'Remplacée par Kotlin stdlib '+KOTLIN_RUNTIME_VERSION});
   continue;
  }
  if(seen.has(item.name))throw Error('Nom de bibliothèque dupliqué : '+item.name);
  seen.add(item.name);
  chosen.push(item);
 }
 if(!chosen.some(x=>x.name.includes('usb-serial-for-android')))throw Error('Bibliothèque USB Serial absente.');
 if(!chosen.some(x=>x.name.startsWith('androidx.core-core-')))throw Error('AndroidX Core absent.');
 if(!chosen.some(x=>x.name.includes('kotlinx-coroutines-core-jvm')))throw Error('Coroutines runtime absentes.');
 return {stdlib,dependencies:chosen,skipped,inputs:1+chosen.length};
}
export function dexFilename(index){
 if(!Number.isInteger(index)||index<1||index>40)throw Error('Index DEX invalide.');
 return index===1?'classes.dex':`classes${index}.dex`;
}
export function checkRuntimeInputs(plan,classesJar){
 if(!plan?.dependencies?.length||!classesJar)throw Error('La compilation Kotlin et les bibliothèques runtime sont requises.');
 return {totalPrograms:plan.dependencies.length+2,includesStdlib:true,apkReady:false};
}
