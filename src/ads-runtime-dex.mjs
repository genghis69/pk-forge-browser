/**
 * D8 inputs for the authentic TrainManager Maven dependency graph.
 * No Android library is simulated: every path originates in the verified
 * Gradle-resolved AppLovin/Google catalog already mounted in CheerpJ.
 *
 * This is a DEX-only capability. AAR manifests/resources/assets/JNI and
 * library R classes MUST still be merged before APK packaging is allowed.
 */
export function planAdsRuntimeDex({language,adsClasspath,androidJar,appJar,minSdk}) {
 if(language!=='java') throw Error('D8 publicités réservé aux projets Java.');
 if(!Number.isInteger(minSdk)||minSdk<26||minSdk>36)
  throw Error('D8 publicités : minSdk Android invalide.');
 const validPath=p=>typeof p==='string'&&
  /^\/(?:str|files)\/[\w/.-]+\.jar$/.test(p)&&
  !p.split('/').some(x=>x==='.'||x==='..');
 if(!validPath(androidJar)||!androidJar.endsWith('/android.jar'))
  throw Error('SDK Android réel absent de D8.');
 if(!validPath(appJar))throw Error('Classes Java utilisateur absentes de D8.');
 if(!Array.isArray(adsClasspath)||adsClasspath.length<2)
  throw Error('Bibliothèques Maven AppLovin/Google absentes du D8.');
 const seen=new Set(),modules=new Set(),inputs=[];
 for(const item of adsClasspath){
  if(!item||!validPath(item.path)||typeof item.group!=='string'||typeof item.module!=='string')
   throw Error('Bibliothèque publicitaire non montée correctement.');
  if(seen.has(item.path))throw Error('D8 : bibliothèque dupliquée '+item.path);
  seen.add(item.path);
  modules.add(item.group+':'+item.module);
  inputs.push(item.path);
 }
 for(const needed of ['com.applovin:applovin-sdk','com.google.android.gms:play-services-ads-identifier'])
  if(!modules.has(needed))throw Error('D8 : SDK Maven absent : '+needed);
 if(seen.has(appJar)||seen.has(androidJar))throw Error('D8 : classpath circulaire.');
 return {
  programJars:[appJar,...inputs],
  libraryJar:androidJar,
  minSdk,
  dependencyCount:inputs.length,
  names:adsClasspath.map(x=>x.name),
  apkReady:false
 };
}
