/** Prototype de compilation Kotlin Android en groupe, 100 % navigateur.
 * Aucune sortie APK ne peut être validée tant que AAPT2/ressources/manifest ne sont pas assemblés.
 */
import {compileProfile,generateCompileOnlyR,buildDiagnostic} from './android-sources.mjs';
import {javaCompileProfile,realJavaR} from './java-sources.mjs';
import {extractGradleBuildSettings,createGradleBuildConfig} from './gradle-generated.mjs';
import {mountJar,virtualJarPath} from './jvm-artifacts.mjs';
import {toolchainUrl} from './toolchain-paths.mjs';
import {validateCompilerArtifact} from './compiler-results.mjs';
import {getKotlinRuntime} from './kotlin-lab.mjs';
import {planRuntimeJars,dexFilename,checkRuntimeInputs} from './runtime-dex.mjs';
import {createExecutionObserver,formatElapsed} from './compilation-observer.mjs';
import {d8ThreadFlags,d8ThreadDescription} from './d8-threading.mjs';
import {getResourceSession,linkedRCode,refreshApkButton} from './real-resources.mjs';
import {verifyDexIntegrity,dexMapDiagnostic} from './dex-integrity.mjs';
const el=id=>document.getElementById(id);
let locked=false,jarBlob=null,dexBlob=null,runtimeZip=null,lastCompilation=null,lastD8Diagnostic=null;
export function getLastD8Diagnostic(){return lastD8Diagnostic;}
const moduleUrl=import.meta.url;
const log=s=>{const n=el('androidCompileLog');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const status=(s,ok=false)=>{const n=el('androidCompileStatus');n.textContent=s;n.className='alert'+(ok?' good':'');};
function selectedD8ThreadMode(){
 const select=el('androidD8Threads');
 return select?.value || '1';
}

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
 const linkedSession=getResourceSession(project);
 const r=linkedSession
  ? {code:linkedRCode(profile.namespace,linkedSession.ids,sources),symbolCount:Object.keys(linkedSession.ids).length,sourceRefs:0}
  : generateCompileOnlyR({namespace:profile.namespace,resourceFiles,sourceTexts:sources});
 if(linkedSession){
  log('R.kt RÉEL : '+r.symbolCount+' identifiants de la table resources.arsc WebAssembly.');
  log('Cette compilation Kotlin utilisera les vrais IDs du même compilateur de ressources.');
 }else{
  log('R.kt TEMPORAIRE généré à partir du ZIP : '+r.symbolCount+' symboles de ressources, '+r.sourceRefs+' références.');
  log('Ce R ne contient PAS les ID finaux d’Android et ne peut pas servir à assembler un APK.');
 }
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
 log('Kotlin 2.2.20 : compilation groupée des '+profile.paths.length+' sources avec '+(linkedSession?'R réel AAPT2':'R temporaire de diagnostic')+'...');
 const t0=performance.now();
 const ret=await observedJavaExecution('Compilation Kotlin des '+profile.paths.length+' sources',()=>cheerpjRunMain('org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
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
 lastCompilation={jarPath,jarRoot,classpath,runtime,sourceCount:profile.paths.length,classCount:count,linkedResourceSession:linkedSession,sourceZip:project.zip,language:'kotlin',minSdk:Number(project.analysis.minSdk)||26};
 el('androidCompileDex').disabled=false;
 el('androidRuntimeDex').disabled=false;
 el('androidJarDownload').disabled=false;
 status(profile.paths.length+' sources Kotlin compilées en '+count+' classes JVM. Assemblage APK toujours indisponible.',true);
 log('ÉTAPE KOTLIN TERMINÉE : 49 classes JVM sont sauvegardées dans le JAR actuel.'.replace('49',String(count)));
 log('Tu peux télécharger les classes immédiatement. La conversion D8 est désormais une action indépendante.');
 status(profile.paths.length+' sources Kotlin compilées en '+count+' classes JVM. Le JAR est prêt. Étape D8 à lancer séparément.',true);
 const phase=el('androidCompilePhase');
 if(phase){phase.textContent='Compilation Kotlin terminée. JAR disponible, D8 non lancé.';phase.dataset.severity='complete';}

}
/**
 * Conversion facultative des .class de la session courante en DEX.
 * Ne bloque plus le succès de la compilation Kotlin.
 * D8 reçoit android.jar comme --lib et le JAR déjà généré, sans recopier
 * plus de vingt JAR comme --classpath. L'intégration du runtime a son bouton dédié.
 */
export function diagnosticD8Arguments({androidJar,outputDirectory,classesJar,minSdk=26}){
 const paths=[androidJar,outputDirectory,classesJar];
 if(paths.some(p=>typeof p!=='string'||!p.startsWith('/files/')&&!p.startsWith('/str/')))
  throw Error('Les chemins de compilation doivent rester locaux au navigateur.');
 if(!Number.isSafeInteger(minSdk)||minSdk<21||minSdk>36)throw Error('minSdk Android invalide.');
 return ['--min-api',String(minSdk),...d8ThreadFlags(selectedD8ThreadMode()),'--lib',androidJar,'--output',outputDirectory,classesJar];
}
async function compileStandaloneDex(){
 if(!lastCompilation||!jarBlob)
  throw Error('Aucun JAR Kotlin compilé dans la session. Termine d’abord la compilation des sources.');
 const {jarPath,jarRoot,runtime,sourceCount,classCount}=lastCompilation;
 if(!runtime.manifest.d8Jar)throw Error('D8 n’est pas disponible dans ce navigateur.');
 const jar=await mountJar({
  relative:'r8/'+runtime.manifest.d8Version+'/'+runtime.manifest.d8Jar,
  filename:runtime.manifest.d8Jar,
  expectedSize:runtime.manifest.d8Size,
  sha256:runtime.manifest.d8Sha256,
  moduleUrl,fetchFn:fetch,addFn:cheerpOSAddStringFile,progress:log
 });
 log('D8 téléchargé et vérifié. Préparation du dossier de sortie isolé...');
 const folder='/files/apkforge-kotlin/dex-standalone-'+Date.now().toString(36);
 const Paths=await runtime.library.java.nio.file.Paths;
 const Files=await runtime.library.java.nio.file.Files;
 await Files.createDirectories(await Paths.get(folder));
 log('Dossier D8 créé : '+folder);
 const argv=diagnosticD8Arguments({androidJar:jarRoot.path,outputDirectory:folder,classesJar:jarPath});
 log('D8 '+runtime.manifest.d8Version+' : lancement explicite de la conversion des '+classCount+' classes JVM.');
 log('Réglage D8 : '+d8ThreadDescription(selectedD8ThreadMode())+'.');
 log('Le chronomètre indiquera la durée réelle ; aucun pourcentage fictif.');
 const code=await observedJavaExecution('D8 des classes Kotlin',()=>cheerpjRunMain('com.android.tools.r8.D8',jar,...argv));
 if(code!==0)throw Error('D8 a renvoyé le code '+code+'. Vérifie F12 pour les détails.');
 dexBlob=await validateCompilerArtifact(await cjFileBlob(folder+'/classes.dex'),'dex');
 await verifyDexIntegrity(new Uint8Array(await dexBlob.arrayBuffer()));
 log('DEX de diagnostic : map_list, Adler32 et SHA-1 valides.');
 el('androidDexDownload').disabled=false;
 log('SUCCÈS : classes.dex '+(dexBlob.size/1024).toFixed(1)+' Kio, produit dans Chrome.');
 status('Kotlin '+sourceCount+' sources → '+classCount+' classes JVM → DEX '+(dexBlob.size/1024).toFixed(1)+' Kio. APK non assemblé.',true);
}
/**
 * D8 runtime pass. Includes compiled Kotlin sources, Kotlin stdlib 2.2.20 and
 * AndroidX / USB Serial runtime JARs (not just compilation classpath references).
 * Produces a ZIP containing classes.dex/classes2.dex..., never an APK.
 */
async function buildRuntimeDex(){
 lastD8Diagnostic=null;
 if(!lastCompilation)throw Error('Compile les sources Java ou Kotlin avant de générer les DEX avec les bibliothèques.');
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
 const outputDir='/files/apkforge-kotlin';
 const files=await runtime.library.java.nio.file.Files;
 const Paths=await runtime.library.java.nio.file.Paths;
 await files.createDirectories(await Paths.get(outputDir));
 // D8 can output a ZIP itself. This avoids the old CheerpJ individual-files
 // output path, which produced a malformed DEX with duplicate map type 0.
 const d8ArchivePath=outputDir+'/elm327-runtime-dex-'+Date.now().toString(36)+'.zip';
 const argv=['--min-api',String(lastCompilation.minSdk||26),...d8ThreadFlags(selectedD8ThreadMode()),'--lib',jarRoot.path,'--output',d8ArchivePath,
  jarPath,virtualJarPath(plan.stdlib),...plan.dependencies.map(x=>x.path)];
 log('D8 '+runtime.manifest.d8Version+' : '+(plan.dependencies.length+2)+' JAR d’entrée, minSdk 26.');
 log('Réglage D8 : '+d8ThreadDescription(selectedD8ThreadMode())+'.');
 log('Mode D8 natif : sortie ZIP (au lieu de fichiers DEX séparés).');
 log('Traitement complet des bibliothèques. Cette étape peut prendre plusieurs minutes.');
 const started=performance.now();
 const code=await observedJavaExecution('Fusion D8 des dépendances Android',()=>cheerpjRunMain('com.android.tools.r8.D8',dexJar,...argv));
 if(code!==0)throw Error('D8 runtime a échoué (code '+code+'). Regarde la console F12 pour les bibliothèques incompatibles.');
 if(!window.JSZip)throw Error('JSZip indisponible pour lire les DEX produits par D8.');
 const d8ArchiveBlob=await cjFileBlob(d8ArchivePath);
 if(!d8ArchiveBlob||d8ArchiveBlob.size<100)
  throw Error('D8 n’a pas produit l’archive ZIP attendue dans CheerpJ.');
 let d8Archive;
 try{d8Archive=await JSZip.loadAsync(d8ArchiveBlob,{checkCRC32:true});}
 catch(e){throw Error('ZIP D8 illisible ou CRC incorrect : '+e.message,{cause:e});}
 const d8Names=Object.keys(d8Archive.files)
  .filter(n=>/^classes(?:[2-9]|[1-9]\d+)?\.dex$/.test(n)&&!d8Archive.files[n].dir)
  .sort((a,b)=>(a==='classes.dex'?1:Number(a.slice(7,-4)))-
               (b==='classes.dex'?1:Number(b.slice(7,-4))));
 if(!d8Names.length||d8Names.length>40)
  throw Error('ZIP D8 : nombre incorrect de fichiers DEX ('+d8Names.length+').');
 if(Object.keys(d8Archive.files).some(n=>n.endsWith('.dex')&&!d8Names.includes(n)))
  throw Error('ZIP D8 : nom de fichier DEX inconnu.');
 const zip=new JSZip();
 let dexFiles=0,bytes=0;
 for(let i=0;i<d8Names.length;i++){
  const filename=dexFilename(i+1);
  if(d8Names[i]!==filename)throw Error('ZIP D8 : fichiers DEX non contigus : '+d8Names.join(', '));
  const buffer=await d8Archive.file(filename).async('uint8array');
  try{
   const integrity=await verifyDexIntegrity(buffer);
   log('DEX '+filename+' : '+integrity.sections+' sections vérifiées (map_list, Adler32 et SHA-1).');
  }catch(error){
   const view=buffer.byteLength>=56?new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength):null;
   const mapOff=view?.getUint32(0x34,true)??0;
   const count=view&&mapOff+4<=buffer.length?view.getUint32(mapOff,true):null;
   log('DIAGNOSTIC '+filename+' : '+buffer.length+' octets, map_off='+mapOff+
     ', sections='+String(count)+', D8 a produit un ZIP natif via CheerpJ.');
   const details=dexMapDiagnostic(buffer);
   log('MAP_LIST DEX : '+JSON.stringify(details.entries?.slice(0,25)??[]));
   // Keep the exact corrupt output for offline analysis. No silent DEX mutations.
   try{
    const report=new JSZip();
    report.file('classes.dex',buffer,{binary:true,compression:'STORE'});
    report.file('dex-map-diagnostic.json',JSON.stringify({
     generated:new Date().toISOString(),error:error.message,details,
     mode:'CheerpJ D8 direct ZIP',d8Version:runtime.manifest.d8Version,
     threadMode:selectedD8ThreadMode(),dependencyNames:plan.dependencies.map(x=>x.name)
    },null,2));
    const payload=await report.generateAsync({type:'blob',compression:'STORE'});
    lastD8Diagnostic=payload;
    const url=URL.createObjectURL(payload);
    const link=document.createElement('a');link.href=url;
    link.download='apkforge-d8-diagnostic.zip';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    log('Rapport automatique téléchargé : apkforge-d8-diagnostic.zip');
   }catch(reportError){log('Impossible de télécharger le rapport D8 : '+reportError.message);}
   const dexError=Error('DEX '+filename+' invalide même en mode ZIP : '+error.message+
    '. APK bloqué avant signature.',{cause:error});
   dexError.dexMapDiagnostic=details;
   throw dexError;
  }
  zip.file(filename,buffer,{binary:true,compression:'STORE'});
  dexFiles++;bytes+=buffer.length;
  log('Vérifié : '+filename+' ('+(buffer.length/1024).toFixed(1)+' Kio).');
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
 refreshApkButton(lastCompilation?.sourceZip,{runtimeZip,linkedResourceSession:lastCompilation.linkedResourceSession});
 el('androidRuntimeDownload').disabled=false;
 log('SUCCÈS : '+dexFiles+' DEX, '+(bytes/1024/1024).toFixed(2)+' Mio, '+((performance.now()-started)/1000).toFixed(1)+' secondes.');
 status('DEX du code + bibliothèques généré ('+dexFiles+' fichier(s)). '+(lastCompilation.linkedResourceSession?'Prêt pour assembler et signer l’APK.':'Compile les ressources AAPT2 avant assemblage.'),true);
}
function download(blob,name){
 if(!blob)throw Error('Aucun fichier généré.');
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
/**
 * Pipeline automatique : mêmes compilateurs Kotlin / D8 que les étapes manuelles.
 * Conserve le verrou pendant chaque phase pour empêcher les doubles JVM.
 */
/** Java-only Android compilation through real Eclipse ECJ running inside CheerpJ.
 * Fail closed for unsupported Maven coordinates and all incomplete sources.
 */
async function buildJavaGroup(project){
 const response=await fetch(toolchainUrl('android/manifest.json',moduleUrl),{cache:'no-store'});
 if(!response.ok)throw Error('Catalogue SDK Android indisponible : HTTP '+response.status);
 const catalog=await response.json();
 const profile=javaCompileProfile(project.analysis,catalog);
 const linkedSession=getResourceSession(project);
 if(!linkedSession||!linkedSession.ids||!Object.keys(linkedSession.ids).length)
  throw Error('AAPT2 réel doit préparer les ressources avant Java.');
 const javaCompiler=catalog.javaCompiler;
 const sources=await Promise.all(profile.paths.map(path=>readSource(project,path)));
 const runtime=await getKotlinRuntime();
 const classpath=await mountAndroidClasspath(catalog);
 const jarRoot=classpath.find(a=>a.name==='android.jar');
 const tool=classpath.find(a=>a.name==='classes-tool.jar');
 if(!jarRoot||!tool)throw Error('SDK Android 36 ou assembleur JVM absent.');
 const ecj=await mountJar({
  relative:javaCompiler.relative,filename:javaCompiler.name||'ecj.jar',
  expectedSize:javaCompiler.size,sha256:javaCompiler.sha256,moduleUrl,
  fetchFn:fetch,addFn:cheerpOSAddStringFile,progress:log
 });
 const runId=Date.now().toString(36);
 const compiled='/files/apkforge-java/classes-'+runId;
 const Paths=await runtime.library.java.nio.file.Paths;
 const Files=await runtime.library.java.nio.file.Files;
 await Files.createDirectories(await Paths.get(compiled));
 const mountedSources=[];
 for(let i=0;i<profile.paths.length;i++){
  const name=profile.paths[i].split('/').at(-1);
  const dest='/str/'+name;
  cheerpOSAddStringFile(dest,sources[i]);
  mountedSources.push(dest);
 }
 const rCode=realJavaR(profile.namespace,linkedSession.ids);
 cheerpOSAddStringFile('/str/R.java',rCode);
 mountedSources.push('/str/R.java');
 const appGradle=await project.files[project.analysis.appGradlePath]?.async('string');
 const generatedSettings=extractGradleBuildSettings(appGradle,project.analysis);
 const buildConfig=createGradleBuildConfig(project.analysis,generatedSettings);
 cheerpOSAddStringFile('/str/BuildConfig.java',buildConfig);
 mountedSources.push('/str/BuildConfig.java');
 log('BuildConfig Java 17 généré localement : identifiants MAX vides comme dans le ZIP sans local.properties.');
 const cp=classpath.filter(x=>x.kind==='platform'||x.kind==='dependency').map(x=>x.path).join(':');
 log('Compilation ECJ Java 17 de '+profile.paths.length+' sources avec '+Object.keys(linkedSession.ids).length+' IDs AAPT2 réels.');
 const ret=await observedJavaExecution('ECJ Java Android',()=>cheerpjRunMain(
  'org.eclipse.jdt.internal.compiler.batch.Main',ecj,
  '-17','-proc:none','-classpath',cp,'-d',compiled,...mountedSources));
 if(ret!==0)throw Error('ECJ Java a échoué (code '+ret+'). Vérifie les imports Android et les dépendances du projet dans F12.');
 const jarPath='/files/apkforge-java/java-compiled-'+runId+'.jar';
 const jarRet=await observedJavaExecution('Assemblage des classes Java',()=>cheerpjRunMain(
  'dev.apkforge.tools.BuildClassesJar',tool.path,compiled,jarPath));
 if(jarRet!==0)throw Error('ECJ n’a pas pu assembler les classes .class.');
 const blob=await cjFileBlob(jarPath);
 if(!blob||blob.size<100)throw Error('ECJ n’a généré aucune archive JVM.');
 const archive=await JSZip.loadAsync(blob,{checkCRC32:true});
 const count=Object.keys(archive.files).filter(name=>name.endsWith('.class')).length;
 if(count<profile.paths.length)throw Error('Compilation Java partielle ('+count+' classes / '+profile.paths.length+' sources).');
 jarBlob=blob;
 lastCompilation={jarPath,jarRoot,classpath,runtime,sourceCount:profile.paths.length,
  classCount:count,linkedResourceSession:linkedSession,sourceZip:project.zip,language:'java',minSdk:profile.minSdk};
 el('androidCompileDex').disabled=false;
 el('androidRuntimeDex').disabled=false;
 el('androidJarDownload').disabled=false;
 log('ECJ : '+count+' classes Java compilées. D8 utilisera les classes et bibliothèques Android.');
 status('ECJ Java compilé : '+count+' classes JVM prêtes pour D8.',true);
 return lastCompilation;
}
export async function compileJavaForApk(project){
 if(locked)throw Error('Une compilation JVM est déjà en cours.');
 if(!project?.zip||!getResourceSession(project))
  throw Error('AAPT2 doit compiler les ressources avant Java.');
 locked=true;jarBlob=null;dexBlob=null;runtimeZip=null;lastCompilation=null;
 refreshApkButton(null,null);
 resetProgress();
 for(const id of ['androidCompileAll','androidCompileDex','androidRuntimeDex','androidJarDownload',
                  'androidDexDownload','androidRuntimeDownload']){
  const node=el(id);if(node)node.disabled=true;
 }
 status('Compilation Java 17 automatique via ECJ...');
 el('androidCompileLog').textContent='[APK FORGE AUTO] Démarrage ECJ Java avec R.java réel.';
 try{return await buildJavaGroup(project);}
 finally{
  locked=false;
  el('androidCompileAll').disabled=false;
  el('androidCompileDex').disabled=!lastCompilation;
  el('androidRuntimeDex').disabled=!lastCompilation;
 }
}

export async function compileKotlinForApk(project){
 if(locked)throw Error('Une compilation Kotlin ou D8 est déjà en cours.');
 if(!project?.zip||!getResourceSession(project))throw Error('AAPT2 doit préparer les vrais identifiants R avant Kotlin.');
 locked=true;jarBlob=null;dexBlob=null;runtimeZip=null;lastCompilation=null;
 refreshApkButton(null,null);
 resetProgress();
 el('androidCompileAll').disabled=true;
 el('androidCompileDex').disabled=true;
 el('androidRuntimeDex').disabled=true;
 el('androidJarDownload').disabled=true;
 el('androidDexDownload').disabled=true;
 el('androidRuntimeDownload').disabled=true;
 status('Compilation Kotlin automatique en cours...');
 el('androidCompileLog').textContent='[APK FORGE AUTO] Compilation Kotlin avec vrais identifiants R.';
 try{
  await buildGroup(project);
  if(lastCompilation?.linkedResourceSession!==getResourceSession(project)||!jarBlob)
   throw Error('Kotlin n’a pas produit de JAR lié à la session AAPT2.');
  return lastCompilation;
 }finally{
  locked=false;
  el('androidCompileAll').disabled=false;
  el('androidCompileDex').disabled=!lastCompilation;
  el('androidRuntimeDex').disabled=!lastCompilation;
 }
}
export async function compileRuntimeDexForApk(project){
 if(locked)throw Error('Une compilation Kotlin ou D8 est déjà en cours.');
 if(!project?.zip||lastCompilation?.sourceZip!==project.zip||
    lastCompilation?.linkedResourceSession!==getResourceSession(project)||!jarBlob)
  throw Error('Le JAR Java ou Kotlin avec R réel doit être compilé pour ce ZIP avant D8.');
 locked=true;runtimeZip=null;resetProgress();
 el('androidCompileAll').disabled=true;
 el('androidCompileDex').disabled=true;
 el('androidRuntimeDex').disabled=true;
 el('androidRuntimeDownload').disabled=true;
 status('D8 automatique : création des DEX d’exécution et intégration des bibliothèques...');
 try{
  await buildRuntimeDex();
  const artifact=getRuntimeArtifacts();
  if(!artifact.runtimeZip||artifact.linkedResourceSession!==getResourceSession(project))
   throw Error('DEX générés, mais ils ne correspondent pas à la session AAPT2 du projet.');
  return artifact;
 }finally{
  locked=false;
  el('androidCompileAll').disabled=false;
  el('androidCompileDex').disabled=!lastCompilation;
  el('androidRuntimeDex').disabled=!lastCompilation;
 }
}
export function getRuntimeArtifacts(){
 return {runtimeZip,linkedResourceSession:lastCompilation?.linkedResourceSession||null,sourceZip:lastCompilation?.sourceZip||null};
}
export function attachAndroidCompiler(getProject){
 el('androidCompileDex').disabled=true;
 el('androidCompileDex').addEventListener('click',async()=>{
  if(locked)return;
  locked=true;el('androidCompileDex').disabled=true;el('androidRuntimeDex').disabled=true;el('androidCompileAll').disabled=true;
  resetProgress();dexBlob=null;el('androidDexDownload').disabled=true;
  status('D8 : conversion des classes Kotlin en cours. JAR déjà compilé et disponible...');
  try{await compileStandaloneDex();}
  catch(e){log('ERREUR D8 : '+e.message);status('La conversion D8 a échoué ou s’est interrompue : '+e.message+'. Le JAR JVM reste disponible.');console.error('APK Forge D8 standalone',e);}
  finally{locked=false;el('androidCompileDex').disabled=!lastCompilation;el('androidRuntimeDex').disabled=!lastCompilation;el('androidCompileAll').disabled=false;}
 });
 el('androidReloadCompiler')?.addEventListener('click',()=>{
  if(window.confirm('Recharger la page pour interrompre la JVM ? Réimporte le ZIP ensuite.'))window.location.reload();
 });
 el('androidRuntimeDex').addEventListener('click',async()=>{
  if(locked)return;
  locked=true;el('androidRuntimeDex').disabled=true;el('androidCompileDex').disabled=true;el('androidCompileAll').disabled=true;
  resetProgress();
  runtimeZip=null;el('androidRuntimeDownload').disabled=true;
  try{await buildRuntimeDex();}
  catch(e){log('ERREUR RUNTIME : '+e.message);status('Fusion runtime interrompue : '+e.message);console.error('APK Forge runtime D8',e);}
  finally{locked=false;el('androidRuntimeDex').disabled=!lastCompilation;el('androidCompileDex').disabled=!lastCompilation;el('androidCompileAll').disabled=false;}
 });
 el('androidCompileAll').addEventListener('click',async()=>{
  if(locked)return;locked=true;jarBlob=null;dexBlob=null;runtimeZip=null;lastCompilation=null;
  refreshApkButton(null,null);
  resetProgress();
  el('androidRuntimeDex').disabled=true;el('androidRuntimeDownload').disabled=true;
  el('androidCompileDex').disabled=true;
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
