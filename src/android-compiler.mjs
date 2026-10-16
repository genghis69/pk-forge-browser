/** Prototype de compilation Kotlin Android en groupe, 100 % navigateur.
 * Aucune sortie APK ne peut être validée tant que AAPT2/ressources/manifest ne sont pas assemblés.
 */
import {compileProfile,generateCompileOnlyR,buildDiagnostic} from './android-sources.mjs';
import {mountJar,virtualJarPath} from './jvm-artifacts.mjs';
import {toolchainUrl} from './toolchain-paths.mjs';
import {validateCompilerArtifact} from './compiler-results.mjs';
import {getKotlinRuntime} from './kotlin-lab.mjs';
const el=id=>document.getElementById(id);
let locked=false,jarBlob=null,dexBlob=null;
const moduleUrl=import.meta.url;
const log=s=>{const n=el('androidCompileLog');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const status=(s,ok=false)=>{const n=el('androidCompileStatus');n.textContent=s;n.className='alert'+(ok?' good':'');};
async function readSource(project,path) {
 const file=project.files[path];if(!file)throw Error('Source introuvable : '+path);
 if(file._data?.uncompressedSize>2e6)throw Error('Fichier Kotlin trop volumineux : '+path);
 return file.async('string');
}
async function mountAndroidClasspath(catalog){
 const mounted=[];
 for(const item of catalog.artifacts){
  if(!item.name.endsWith('.jar'))throw Error('Artefact Android non JAR : '+item.name);
  const path=await mountJar({relative:'android/'+item.relative,filename:item.name,
   expectedSize:item.size,sha256:item.sha256,moduleUrl,
   fetchFn:fetch,addFn:cheerpOSAddStringFile,progress:log});
  mounted.push({...item,path});
 }
 return mounted;
}
async function buildGroup(project){
 const result=await fetch(toolchainUrl('android/manifest.json',moduleUrl),{cache:'no-store'});
 if(!result.ok)throw Error('Android SDK 36 non disponible (HTTP '+result.status+'). La publication GitHub n’est pas terminée.');
 const catalog=await result.json();
 const profile=compileProfile(project,catalog);
 log('Analyse des '+profile.paths.length+' fichiers Kotlin originaux, sans build/, APK ni DEX existant.');
 const sources=await Promise.all(profile.paths.map(p=>readSource(project,p)));
 const resourceFiles=[];
 for(const path of project.analysis.resourcePaths){
  const file=project.files[path];if(!file)continue;
  if(file._data?.uncompressedSize>1024*1024)throw Error('Ressource trop volumineuse : '+path);
  resourceFiles.push({path,text:/\.xml$/i.test(path)?await file.async('string'):''});
 }
 const r=generateCompileOnlyR({namespace:profile.namespace,resourceFiles,sourceTexts:sources});
 log('R.kt TEMPORAIRE généré à partir du ZIP : '+r.symbolCount+' symboles de ressources, '+r.sourceRefs+' références.');
 log('Ce R ne contient PAS les ID finaux d’Android et ne peut pas servir à assembler un APK.');
 const runtime=await getKotlinRuntime();
 log('Téléchargement des API Android 36 et dépendances Maven dans la RAM du navigateur...');
 const classpath=await mountAndroidClasspath(catalog);
 const jarRoot=classpath.find(a=>a.name==='android.jar');
 const tool=classpath.find(a=>a.name==='classes-tool.jar');
 if(!jarRoot||!tool)throw Error('Android SDK ou assembleur des fichiers .class manquant.');
 const compiled='/files/apkforge-kotlin/elm327-group';
 const paths=await runtime.library.java.nio.file.Paths;
 const files=await runtime.library.java.nio.file.Files;
 await files.createDirectories(await paths.get(compiled));
 const mountedSources=[];
 const usedNames=new Set();
 for(let i=0;i<profile.paths.length;i++){
  const name=profile.paths[i].split('/').at(-1);
  if(!/^[A-Za-z0-9_.-]+\.kt$/.test(name))throw Error('Nom de fichier Kotlin incorrect : '+name);
  if(usedNames.has(name))throw Error('Deux fichiers Kotlin ont le même nom ('+name+'). Cette limitation doit être corrigée avant compilation.');
  usedNames.add(name);
  const dest='/str/'+name;
  cheerpOSAddStringFile(dest,sources[i]);
  mountedSources.push(dest);
 }
 const rPath='/str/ApkForgeGeneratedR.kt';
 cheerpOSAddStringFile(rPath,r.code);mountedSources.push(rPath);
 const cp=[virtualJarPath('kotlin-stdlib-2.2.20.jar'),...classpath.filter(x=>x.kind==='platform'||x.kind==='dependency').map(x=>x.path)].join(':');
 log('Kotlin 2.2.20 : compilation groupée des '+profile.paths.length+' sources + R de diagnostic...');
 const t0=performance.now();
 const ret=await cheerpjRunMain('org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
  runtime.manifest.jars.map(virtualJarPath).join(':'),
  '-no-reflect','-no-stdlib','-jvm-target','17','-classpath',cp,'-d',compiled,
  ...mountedSources);
 if(ret!==0)throw Error('Kotlin a échoué (code '+ret+'). Consulte la console F12 pour les classes Android/dépendances manquantes.');
 log('Kotlin : code de retour '+ret+', '+((performance.now()-t0)/1000).toFixed(1)+' s. Vérification des classes...');
 const jarPath='/files/apkforge-kotlin/elm327-compiled.jar';
 const jarRet=await cheerpjRunMain('dev.apkforge.tools.BuildClassesJar',tool.path,compiled,jarPath);
 if(jarRet!==0)throw Error('Impossible de rassembler les .class Kotlin (code '+jarRet+').');
 const blob=await cjFileBlob(jarPath);
 if(!blob||blob.size<100||!window.JSZip)throw Error('Archive de classes JVM absente ou ZIP indisponible.');
 const archive=await JSZip.loadAsync(blob);
 const count=Object.keys(archive.files).filter(n=>n.endsWith('.class')).length;
 if(count<profile.paths.length)throw Error('Seulement '+count+' classes JVM pour '+profile.paths.length+' sources. Vérification à poursuivre.');
 log('SUCCÈS : '+count+' classes JVM produites depuis les sources du ZIP ('+(blob.size/1024).toFixed(1)+' Kio).');
 jarBlob=blob;
 el('androidJarDownload').disabled=false;
 status(profile.paths.length+' sources Kotlin compilées en '+count+' classes JVM. Assemblage APK toujours indisponible.',true);
 if(!runtime.manifest.d8Jar)throw Error('D8 n’est pas installé. Les classes JVM restent téléchargeables.');
 log('D8 '+runtime.manifest.d8Version+' : création du DEX du projet (diagnostic uniquement)...');
 const dexJar=await (async()=>{
  const r8Artifact={relative:'r8/'+runtime.manifest.d8Version+'/'+runtime.manifest.d8Jar,
   filename:runtime.manifest.d8Jar,expectedSize:runtime.manifest.d8Size,
   sha256:runtime.manifest.d8Sha256,moduleUrl,fetchFn:fetch,addFn:cheerpOSAddStringFile,progress:log};
  return mountJar(r8Artifact);
 })();
 const dexDirectory='/files/apkforge-kotlin/elm327-dex';
 await files.createDirectories(await paths.get(dexDirectory));
 const args=['--min-api','26','--lib',jarRoot.path];
 for(const item of classpath.filter(x=>x.kind==='dependency'))args.push('--classpath',item.path);
 args.push('--output',dexDirectory,jarPath);
 const dexCode=await cheerpjRunMain('com.android.tools.r8.D8',dexJar,...args);
 if(dexCode!==0)throw Error('D8 ne peut pas transformer les classes (code '+dexCode+').');
 dexBlob=await validateCompilerArtifact(await cjFileBlob(dexDirectory+'/classes.dex'),'dex');
 const d=buildDiagnostic(profile.paths.length,count,true);
 el('androidDexDownload').disabled=false;
 log('SUCCÈS : classes.dex '+(dexBlob.size/1024).toFixed(1)+' Kio, généré dans Chrome.');
 status('Kotlin '+d.sourceCount+' fichiers → '+d.classCount+' classes JVM → DEX créé. APK non assemblé.',true);
}
function download(blob,name){
 if(!blob)throw Error('Aucun fichier généré.');
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function attachAndroidCompiler(getProject){
 el('androidCompileAll').addEventListener('click',async()=>{
  if(locked)return;locked=true;jarBlob=null;dexBlob=null;
  el('androidCompileAll').disabled=true;
  el('androidJarDownload').disabled=true;el('androidDexDownload').disabled=true;
  status('Chargement des outils et compilation...');el('androidCompileLog').textContent='[APK FORGE ANDROID] Démarrage.';
  try{await buildGroup(getProject());}
  catch(e){log('ERREUR : '+e.message);status('Compilation de groupe interrompue : '+e.message);console.error('APK Forge Android compilation',e);}
  finally{locked=false;el('androidCompileAll').disabled=false;}
 });
 el('androidJarDownload').addEventListener('click',()=>download(jarBlob,'elm327-classes-diagnostic.jar'));
 el('androidDexDownload').addEventListener('click',()=>download(dexBlob,'elm327-classes-diagnostic.dex'));
}
