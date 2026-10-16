/** Prototype de compilation Kotlin Android en groupe, 100 % navigateur.
 * Aucune sortie APK ne peut être validée tant que AAPT2/ressources/manifest ne sont pas assemblés.
 */
import {compileProfile,generateCompileOnlyR,buildDiagnostic} from './android-sources.mjs';
import {mountJar,virtualJarPath} from './jvm-artifacts.mjs';
import {toolchainUrl} from './toolchain-paths.mjs';
import {validateCompilerArtifact} from './compiler-results.mjs';
import {getKotlinRuntime} from './kotlin-lab.mjs';
import {planRuntimeJars,dexFilename,checkRuntimeInputs} from './runtime-dex.mjs';
import {createExecutionObserver,formatElapsed} from './compilation-observer.mjs';
const el=id=>document.getElementById(id);
let locked=false,jarBlob=null,dexBlob=null,runtimeZip=null,lastCompilation=null;
const moduleUrl=import.meta.url;
const log=s=>{const n=el('androidCompileLog');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const status=(s,ok=false)=>{const n=el('androidCompileStatus');n.textContent=s;n.className='alert'+(ok?' good':'');};
/** Observable execution: time is real, internal Kotlin progress is unknown. */
async function observedJavaExecution(label,callback){
 const phase=el('androidCompilePhase'),reload=el('androidReloadCompiler');
 const observer=createExecutionObserver({
  label,
  onTick:current=>{
   if(phase){
    phase.textContent=label+' • '+current.text+' • '+current.message;
    phase.dataset.severity=current.severity;
   }
   if(reload&&current.elapsed>=120000)reload.hidden=false;
  },
  onNotice:message=>log('DURÉE : '+message)
 });
 observer.start();
 try{
  const result=await callback(),elapsed=observer.stop();
  log('FIN '+label+' : '+formatElapsed(elapsed)+'.');
  if(phase){phase.textContent=label+' terminé en '+formatElapsed(elapsed);phase.dataset.severity='complete';}
  if(reload)reload.hidden=true;
  return result;
 }catch(error){
  const elapsed=observer.stop();
  log('ERREUR '+label+' après '+formatElapsed(elapsed)+': '+(error?.message||String(error)));
  if(reload)reload.hidden=false;
  throw error;
 }
}
function resetProgress(){
 const phase=el('androidCompilePhase');
 if(phase)phase.textContent='Préparation des outils, puis compilation JVM.';
 const reload=el('androidReloadCompiler');if(reload)reload.hidden=true;
}
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
 const runId=Date.now().toString(36); // Dossier neuf : aucune classe issue d’une tentative antérieure.
 const compiled='/files/apkforge-kotlin/elm327-group-'+runId;
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
 const ret=await observedJavaExecution('Compilation Kotlin des 16 sources',()=>cheerpjRunMain('org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
  runtime.manifest.jars.map(virtualJarPath).join(':'),
  '-no-reflect','-no-stdlib','-jvm-target','17','-classpath',cp,'-d',compiled,
  ...mountedSources));
 if(ret!==0)throw Error('Kotlin a échoué (code '+ret+'). Consulte la console F12 pour les classes Android/dépendances manquantes.');
 log('Kotlin : code de retour '+ret+', '+((performance.now()-t0)/1000).toFixed(1)+' s. Vérification des classes...');
 const jarPath='/files/apkforge-kotlin/elm327-compiled-'+runId+'.jar';
 const jarRet=await observedJavaExecution('Assemblage des classes JVM',()=>cheerpjRunMain('dev.apkforge.tools.BuildClassesJar',tool.path,compiled,jarPath));
 if(jarRet!==0)throw Error('Impossible de rassembler les .class Kotlin (code '+jarRet+').');
 const blob=await cjFileBlob(jarPath);
 if(!blob||blob.size<100||!window.JSZip)throw Error('Archive de classes JVM absente ou ZIP indisponible.');
 const archive=await JSZip.loadAsync(blob);
 const count=Object.keys(archive.files).filter(n=>n.endsWith('.class')).length;
 if(count<profile.paths.length)throw Error('Seulement '+count+' classes JVM pour '+profile.paths.length+' sources. Vérification à poursuivre.');
 log('SUCCÈS : '+count+' classes JVM produites depuis les sources du ZIP ('+(blob.size/1024).toFixed(1)+' Kio).');
 jarBlob=blob;
 lastCompilation={jarPath,jarRoot,classpath,runtime,sourceCount:profile.paths.length,classCount:count};
 el('androidRuntimeDex').disabled=false;
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
 const dexDirectory='/files/apkforge-kotlin/elm327-dex-'+runId;
 await files.createDirectories(await paths.get(dexDirectory));
 const args=['--min-api','26','--lib',jarRoot.path];
 for(const item of classpath.filter(x=>x.kind==='dependency'))args.push('--classpath',item.path);
 args.push('--output',dexDirectory,jarPath);
 const dexCode=await observedJavaExecution('D8 du code Kotlin',()=>cheerpjRunMain('com.android.tools.r8.D8',dexJar,...args));
 if(dexCode!==0)throw Error('D8 ne peut pas transformer les classes (code '+dexCode+').');
 dexBlob=await validateCompilerArtifact(await cjFileBlob(dexDirectory+'/classes.dex'),'dex');
 const d=buildDiagnostic(profile.paths.length,count,true);
 el('androidDexDownload').disabled=false;
 log('SUCCÈS : classes.dex '+(dexBlob.size/1024).toFixed(1)+' Kio, généré dans Chrome.');
 status('Kotlin '+d.sourceCount+' fichiers → '+d.classCount+' classes JVM → DEX créé. APK non assemblé.',true);
}
/**
 * D8 runtime pass. Includes compiled Kotlin sources, Kotlin stdlib 2.2.20 and
 * AndroidX / USB Serial runtime JARs (not just compilation classpath references).
 * Produces a ZIP containing classes.dex/classes2.dex..., never an APK.
 */
async function buildRuntimeDex(){
 if(!lastCompilation)throw Error('Compile les sources Kotlin avant de générer le DEX avec les bibliothèques.');
 const {jarPath,jarRoot,classpath,runtime,sourceCount,classCount}=lastCompilation;
 const plan=planRuntimeJars(classpath);
 checkRuntimeInputs(plan,jarBlob);
 if(!runtime.manifest?.jars?.includes(plan.stdlib))throw Error('Kotlin stdlib '+plan.stdlib+' non chargée.');
 log('D8 runtime : '+plan.dependencies.length+' dépendances Android plus Kotlin '+runtime.manifest.version+'.');
 for(const skipped of plan.skipped)log('Exclusion du doublon : '+skipped.name+' ('+skipped.reason+').');
 const dexJar=await mountJar({
   relative:'r8/'+runtime.manifest.d8Version+'/'+runtime.manifest.d8Jar,
   filename:runtime.manifest.d8Jar,expectedSize:runtime.manifest.d8Size,
   sha256:runtime.manifest.d8Sha256,moduleUrl,fetchFn:fetch,
   addFn:cheerpOSAddStringFile,progress:log
 });
 const path='/files/apkforge-kotlin/elm327-runtime-dex-'+Date.now().toString(36);
 const files=await runtime.library.java.nio.file.Files;
 const Paths=await runtime.library.java.nio.file.Paths;
 await files.createDirectories(await Paths.get(path));
 const argv=['--min-api','26','--lib',jarRoot.path,'--output',path,
  jarPath,virtualJarPath(plan.stdlib),...plan.dependencies.map(x=>x.path)];
 log('D8 '+runtime.manifest.d8Version+' : '+(plan.dependencies.length+2)+' JAR d’entrée, minSdk 26.');
 log('Traitement complet des bibliothèques. Cette étape peut prendre plusieurs minutes.');
 const started=performance.now();
 const code=await observedJavaExecution('Fusion D8 des dépendances Android',()=>cheerpjRunMain('com.android.tools.r8.D8',dexJar,...argv));
 if(code!==0)throw Error('D8 runtime a échoué (code '+code+'). Regarde la console F12 pour les bibliothèques incompatibles.');
 if(!window.JSZip)throw Error('JSZip indisponible pour regrouper les sorties DEX.');
 const zip=new JSZip();
 let dexFiles=0,bytes=0;
 for(let i=1;i<=40;i++){
  const filename=dexFilename(i),blob=await cjFileBlob(path+'/'+filename);
  if(!blob){if(i===1)throw Error('D8 a terminé sans produire de classes.dex.');break;}
  await validateCompilerArtifact(blob,'dex');
  zip.file(filename,blob,{compression:'STORE'});
  dexFiles++;bytes+=blob.size;
  log('Vérifié : '+filename+' ('+(blob.size/1024).toFixed(1)+' Kio).');
 }
 const receipt={
  kind:'ANDROID_RUNTIME_DEX_DIAGNOSTIC',
  sourcesKotlin:sourceCount,
  classFilesJVM:classCount,
  runtimeDependencies:plan.dependencies.map(d=>d.name),
  excluded:plan.skipped,
  containsAppAndDependencies:true,
  resourceIdsLinked:false,
  aapt2Completed:false,
  androidManifestCompiled:false,
  apkInstallable:false,
  warning:'Fichiers DEX de diagnostic issus des sources Kotlin, R provisoire, sans APK signé.'
 };
 zip.file('COMPILATION_DIAGNOSTIC.json',JSON.stringify(receipt,null,2));
 runtimeZip=await zip.generateAsync({type:'blob',compression:'STORE'});
 el('androidRuntimeDownload').disabled=false;
 log('SUCCÈS : '+dexFiles+' DEX, '+(bytes/1024/1024).toFixed(2)+' Mio, '+((performance.now()-started)/1000).toFixed(1)+' secondes.');
 status('DEX du code + bibliothèques généré ('+dexFiles+' fichier(s)). AAPT2 et assemblage APK restent manquants.',true);
}
function download(blob,name){
 if(!blob)throw Error('Aucun fichier généré.');
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function attachAndroidCompiler(getProject){
 el('androidReloadCompiler')?.addEventListener('click',()=>{
  if(window.confirm('Recharger la page pour interrompre la JVM ? Réimporte le ZIP ensuite.'))window.location.reload();
 });
 el('androidRuntimeDex').addEventListener('click',async()=>{
  if(locked)return;
  locked=true;el('androidRuntimeDex').disabled=true;el('androidCompileAll').disabled=true;
  resetProgress();
  runtimeZip=null;el('androidRuntimeDownload').disabled=true;
  try{await buildRuntimeDex();}
  catch(e){log('ERREUR RUNTIME : '+e.message);status('Fusion runtime interrompue : '+e.message);console.error('APK Forge runtime D8',e);}
  finally{locked=false;el('androidRuntimeDex').disabled=!lastCompilation;el('androidCompileAll').disabled=false;}
 });
 el('androidCompileAll').addEventListener('click',async()=>{
  if(locked)return;locked=true;jarBlob=null;dexBlob=null;runtimeZip=null;lastCompilation=null;
  resetProgress();
  el('androidRuntimeDex').disabled=true;el('androidRuntimeDownload').disabled=true;
  el('androidCompileAll').disabled=true;
  el('androidJarDownload').disabled=true;el('androidDexDownload').disabled=true;
  status('Chargement des outils et compilation...');el('androidCompileLog').textContent='[APK FORGE ANDROID] Démarrage.';
  try{await buildGroup(getProject());}
  catch(e){log('ERREUR : '+e.message);status('Compilation de groupe interrompue : '+e.message);console.error('APK Forge Android compilation',e);}
  finally{locked=false;el('androidCompileAll').disabled=false;}
 });
 el('androidJarDownload').addEventListener('click',()=>download(jarBlob,'elm327-classes-diagnostic.jar'));
 el('androidDexDownload').addEventListener('click',()=>download(dexBlob,'elm327-classes-diagnostic.dex'));
 el('androidRuntimeDownload').addEventListener('click',()=>download(runtimeZip,'elm327-runtime-dex-diagnostic.zip'));
}
