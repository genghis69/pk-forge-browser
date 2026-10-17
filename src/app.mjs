import {developmentPem,to64,from64} from './crypto.mjs';
import {createSampleZip} from './sample.mjs';
import {projectInfo,isGeneratedPath} from './analyzer.mjs';
import {classifyAndroidProject} from './project-support.mjs';
import {attachKotlinLab,refreshKotlinSources} from './kotlin-lab.mjs';
import {attachAndroidCompiler,getRuntimeArtifacts,compileKotlinForApk,compileJavaForApk,compileRuntimeDexForApk,getLastD8Diagnostic} from './android-compiler.mjs';
import {attachRealResourceCompiler,prepareRealResources,assembleRealApk} from './real-resources.mjs';
import {runAutomaticApkBuild} from './auto-build.mjs';
import {assessAapt2,aapt2Report} from './aapt2-diagnostics.mjs';
const $=id=>document.getElementById(id);
let state={zip:null,files:null,manifest:null,resourceList:[],file:null,analysis:null,engine:null,objectUrl:null};
let autoBusy=false,autoDiagnosticUrl=null;
const autoStatus=(message,good=false)=>{
 const el=$('autoBuildStatus');if(el){el.textContent=message;el.className='alert'+(good?' good':'');}
};
const autoLog=message=>{
 const el=$('autoBuildLog');if(el){el.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+message;el.scrollTop=el.scrollHeight;}
};
async function startAutomaticBuild(){
 if(autoBusy){autoLog('Compilation déjà en cours.');return;}
 if(!state.zip||!state.analysis)return;
 autoBusy=true;
 const snapshot=state.zip;
 const start=$('autoBuild'),progress=$('autoBuildProgress');
 if(start)start.disabled=true;
 if(progress)progress.value=0;
 const reportLink=$('autoD8Report');
 if(reportLink){reportLink.style.display='none';reportLink.removeAttribute('href');}
 if(autoDiagnosticUrl){URL.revokeObjectURL(autoDiagnosticUrl);autoDiagnosticUrl=null;}
 if($('autoBuildLog'))$('autoBuildLog').textContent='[APK FORGE AUTO] Démarrage de la compilation automatique.';
 show(2);
 audit();
 const selection=classifyAndroidProject(state.analysis);
 autoLog('ANALYSE : '+selection.description);
 autoLog('PROFIL : '+selection.reason);
 const compatibility=$('compatibility');
 if(compatibility){
  compatibility.className='alert'+(selection.mode==='unsupported'?'':' good');
  compatibility.textContent=selection.reason;
 }
 autoStatus('Préparation du projet Android dans le navigateur...');
 const onPhase=({phase,total,name,status,error})=>{
  if(progress&&status==='done')progress.value=phase;
  if(status==='running'){autoStatus('Étape '+phase+'/'+total+' : '+name+'...');autoLog('DÉBUT : '+name);}
  if(status==='done')autoLog('VALIDÉ : '+name);
  if(status==='error')autoLog('ÉCHEC étape '+phase+'/'+total+' : '+name+' • '+String(error?.message||error));
 };
 try{
  if(selection.mode==='unsupported')throw Error(selection.reason);
  if(selection.mode==='resources'){
   const title='Google Pack : ressources Android et signature APK sans code';
   onPhase({phase:1,total:1,name:title,status:'running'});
   try{
    autoStatus('Compilation de l’application sans code...');
    await compile({throwOnError:true});
    if(state.zip!==snapshot)throw Error('ZIP changé pendant la compilation : APK non associé au projet.');
    if(!$('download').href||!state.objectUrl)throw Error('Aucun APK créé.');
    if(progress)progress.value=4;
    onPhase({phase:1,total:1,name:title,status:'done'});
    autoStatus('APK sans code compilé et signé. Téléchargement prêt.',true);
    $('download').click();
   }catch(error){
    onPhase({phase:1,total:1,name:title,status:'error',error});
    throw error;
   }
   return;
  }
  const apk=await runAutomaticApkBuild({
   project:state,prepareResources:prepareRealResources,language:selection.mode,
   compileKotlin:selection.mode==='java'?compileJavaForApk:compileKotlinForApk,compileDex:compileRuntimeDexForApk,
   assembleApk:assembleRealApk,onPhase
  });
  if(state.zip!==snapshot)throw Error('ZIP modifié pendant la compilation : APK non associé au projet.');
  if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
  state.objectUrl=URL.createObjectURL(apk);
  const base=(state.analysis.name||'android-app').replace(/[^a-z0-9._-]+/gi,'-').slice(0,70);
  const version=(state.analysis.version||'1').replace(/[^a-z0-9._-]+/gi,'-');
  const link=$('download');
  link.href=state.objectUrl;
  link.download=base+'-'+version+'-browser-debug.apk';
  $('result').textContent='APK compilé et signé automatiquement';
  $('resultMeta').textContent=link.download+' • '+(apk.size/1024/1024).toFixed(2)+' Mio • '+state.analysis.packageName;
  autoStatus('Compilation terminée. APK signé prêt à être téléchargé.',true);
  autoLog('SUCCÈS : '+link.download+' ('+apk.size+' octets).');
  show(3);
  // Certains navigateurs bloquent un téléchargement déclenché longtemps
  // après le clic. Le lien reste systématiquement visible comme secours.
  link.click();
 }catch(error){
  autoStatus('Compilation interrompue : '+String(error?.message||error));
  autoLog('ERREUR : '+String(error?.stack||error));
  if(error?.dexMapDiagnostic){
   autoLog('MAP_LIST du DEX défectueux : '+JSON.stringify(error.dexMapDiagnostic.entries?.slice(0,25)??[]));
  }
  const diagnostic=getLastD8Diagnostic();
  const report=$('autoD8Report');
  const validDex=getRuntimeArtifacts().runtimeZip;
  // If D8 actually succeeded but the AAR integration prevented signing,
  // offer the genuine DEX artifact; NEVER present it as an installable APK.
  if(validDex&&report&&/AAR|publicitaire refusé|publicitaires/i.test(String(error?.message||''))){
   autoDiagnosticUrl=URL.createObjectURL(validDex);
   report.href=autoDiagnosticUrl;
   report.download='trainmanager-dex-reels-non-installables.zip';
   report.textContent='⬇ Télécharger les véritables DEX (APK non assemblé)';
   report.style.display='inline-block';
   autoLog('D8 réussi : les classes.dex du projet et des SDK Maven sont disponibles. Aucun APK n’a été signé, car les archives AAR doivent être fusionnées.');
  }else if(diagnostic&&report){
   autoDiagnosticUrl=URL.createObjectURL(diagnostic);
   report.href=autoDiagnosticUrl;
   report.download='apkforge-d8-diagnostic.zip';
   report.textContent='⬇ Télécharger le diagnostic D8';
   report.style.display='inline-block';
   autoLog('RAPPORT PRÊT : clique sur « Télécharger le diagnostic D8 » ci-dessous. Aucune recompilation nécessaire.');
  }
  console.error('APK Forge automatique',error);
  show(2);
 }finally{
  autoBusy=false;
  if(start)start.disabled=false;
 }
}
const log=s=>{let n=$('logs');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const fact=(name,value)=>{let x=document.createElement('div');x.className='fact';let t=document.createElement('small');t.textContent=name;let v=document.createElement('b');v.textContent=String(value??'Non détecté');x.append(t,v);return x;};
const show=i=>{for(const el of document.querySelectorAll('[data-panel]'))el.classList.toggle('active',+el.dataset.panel===i);for(const el of document.querySelectorAll('[data-step]'))el.classList.toggle('on',+el.dataset.step===i);};
async function analyze(file){
  if(autoBusy){autoStatus('Une compilation est déjà en cours. Attends sa fin avant de changer de ZIP.');return false;}
  try{
    if(!file||!file.name.toLowerCase().endsWith('.zip'))throw Error('Sélectionne un projet au format ZIP.');
    if(file.size>150*1024*1024)throw Error('Le ZIP dépasse 150 Mo.');
    if(!window.JSZip)throw Error('JSZip indisponible : vérifie le chargement depuis jsDelivr.');
    const zip=await JSZip.loadAsync(file,{checkCRC32:true}),paths=Object.keys(zip.files).filter(p=>!zip.files[p].dir);
    if(paths.length>15000)throw Error('Nombre maximal de fichiers dépassé (15000).');
    let total=0;
    for(const p of paths){
      if(p.startsWith('/')||p.split('/').includes('..')||p.includes('\\'))throw Error('Chemin d’archive non autorisé : '+p);
      total+=zip.files[p]._data?.uncompressedSize||0;
      if(total>500*1024*1024)throw Error('Archive décompressée supérieure à 500 Mo.');
    }
    const texts={};
    for(const p of paths.filter(p=>!isGeneratedPath(p) && /AndroidManifest\.xml$|gradle-wrapper\.properties$|(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/.test(p))){
      if((zip.files[p]._data?.uncompressedSize||0)<1024*1024)texts[p]=await zip.files[p].async('string');
    }
    const a=projectInfo(paths,texts);
    state={...state,zip,files:zip.files,file,analysis:a,manifest:a.manifestPath,resourceList:a.resourcePaths};
    $('uploadStatus').className='alert good';$('uploadStatus').textContent='ZIP analysé : '+file.name+' ('+paths.length+' fichiers)';
    $('next0').disabled=false;
    return true;
  }catch(e){state.zip=null;$('next0').disabled=true;$('uploadStatus').className='alert';$('uploadStatus').textContent='Erreur : '+e.message;return false;}
}
async function engine(){
  if(state.engine)return state.engine;
  const mod=await import('../wasm/pack/pack_wasm.js');
  await mod.default();
  if(typeof mod.build!=='function')throw Error('Google Pack ne fournit pas sa fonction de compilation.');
  state.engine=mod;
  return mod;
}
async function checkEngine(){
  try{
    await engine();
    $('engine').textContent='● Google Pack WASM opérationnel';$('engine').dataset.ready='yes';
    return true;
  }catch(e){$('engine').textContent='○ Moteur WASM indisponible';$('engine').dataset.ready='no';log('Moteur indisponible : '+e.message);return false;}
}
function diagnostic(a){
 const selected=classifyAndroidProject(a);
 const lines=[selected.reason,'Profil : '+selected.description];
 if(selected.mode==='kotlin')return lines;
 if(selected.mode==='resources')return lines;
 if(!a.manifestPath)lines.push('• AndroidManifest.xml : absent ou non reconnu.');
 if(a.kotlin)lines.push('• '+a.kotlin+' fichier(s) Kotlin : compilateur Kotlin/JVM nécessaire, NON INTÉGRÉ.');
 if(a.kotlinPlugin!=='Non précisé')lines.push('• Kotlin Plugin '+a.kotlinPlugin+' (cible JVM '+a.kotlinJvmTarget+') : JVM et compilateur Kotlin requis.');
 if(a.agp!=='Non précisé')lines.push('• Android Gradle Plugin '+a.agp+' : chaîne AGP / AAPT2 absente.');
 if(a.dependencies.length)lines.push('• Bibliothèques externes à résoudre : '+a.dependencies.join(', ')+'.');
 if(a.repositoryHints.length)lines.push('• Dépôt supplémentaire : '+a.repositoryHints.join(', ')+'.');
 if(a.ignoredGenerated)lines.push('• '+a.ignoredGenerated+' fichiers générés ignorés lors de l’analyse (build/, .gradle/, etc.).');
 if(a.java)lines.push('• '+a.java+' fichier(s) Java : compilateur Java nécessaire, NON INTÉGRÉ.');
 if(a.java || a.kotlin)lines.push('• D8 : transformation du bytecode JVM en classes.dex, NON INTÉGRÉ.');
 if(a.gradle!=='Non précisé')lines.push('• Gradle '+a.gradle+' : le moteur Gradle et Android Gradle Plugin ne sont PAS disponibles dans ce navigateur.');
 if(a.nativeLibs)lines.push('• '+a.nativeLibs+' bibliothèques natives .so détectées : support Android NDK/ABI requis.');
 if(a.aarFiles)lines.push('• '+a.aarFiles+' dépendances locales .aar : fusion des ressources et classes nécessaire.');
 if(!a.resources)lines.push('• Aucune ressource res/ reconnue.');
 if(!a.kotlin&&!a.java&&!a.manifestPath)lines.push('• Manifeste absent.');
 if(!a.kotlin&&!a.java&&a.manifestPath&&!a.compatible)lines.push('• Google Pack attend une application sans code déclarée avec android:hasCode="false" et des ressources compatibles.');
 lines.push('');
 lines.push('Le ZIP a bien été lu. Le blocage est une limite du moteur de compilation actuel, pas une erreur de ton projet.');
 lines.push('Ne change PAS android:hasCode pour contourner cette limite : cela ne compilerait pas les sources.');
 return lines;
}
function downloadReport(){
 const a=state.analysis;if(!a)return;
 const report={
  createdAt:new Date().toISOString(),sourceFile:state.file?.name||null,
  engine:'APK Forge Browser / AAPT2 / Kotlin / D8 / Google Pack',
  engineSupports:'Kotlin 2.2.20 / SDK 36 pour le profil existant, ou ressources sans code',
  buildPossibleWithCurrentEngine:classifyAndroidProject(a).mode!=='unsupported',
  buildMode:classifyAndroidProject(a).mode,project:a,
  diagnostics:a.compatible?['Projet sans code détecté; compilation à valider.']:diagnostic(a),
  requiredComponents:a.java||a.kotlin?
   ['Compilateur Java/Kotlin dans le navigateur','Android API android.jar','D8/R8 compatible navigateur','Gestion des dépendances','Assemblage APK avec classes.dex']:[],
  privacy:'Aucune source ZIP envoyée au serveur'
 };
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='apk-forge-rapport-compatibilite.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function loadSample(){
 try {
  const sample=await createSampleZip();await analyze(sample);
  if(state.zip){show(1);audit();log('Exemple Google Pack chargé : '+sample.name);}
 } catch(e){$('uploadStatus').className='alert';$('uploadStatus').textContent='Impossible de créer l’exemple : '+e.message;show(0);}
}
function audit(){
 refreshKotlinSources(state);
  const a=state.analysis;if(!a)return;
  $('facts').replaceChildren(
    fact('Nom',a.name),fact('Application ID',a.packageName),fact('Version',a.version+' (code '+a.versionCode+')'),
    fact('Gradle',a.gradle),fact('Android Gradle Plugin',a.agp),fact('Kotlin Plugin',a.kotlinPlugin),
    fact('SDK cible / minimum',a.targetSdk+' / '+a.minSdk),fact('SDK compilation',a.sdk),fact('Java / Kotlin',a.java+' / '+a.kotlin),
    fact('Java / JVM cible',a.javaTarget+' / '+a.kotlinJvmTarget),fact('Dépendances Maven',a.dependencies.join(' | ')||'Aucune détectée'),
    fact('Ressources',a.resources),fact('Sources utiles',a.sourceFiles),fact('Fichiers générés exclus',a.ignoredGenerated),
    fact('Fichiers ZIP total',a.files)
  );
  $('audit').className='alert '+(a.compatible?'good':'');
  $('audit').textContent=a.compatible
    ? 'Compatible avec le moteur de ressources Google Pack. Un APK sans classes.dex peut être généré. Il reste à tester le résultat sur un appareil adapté.'
    : diagnostic(a).join('\n');
}
async function prepare(){
  const ready=await checkEngine();
  const a=state.analysis;
  $('compatibility').className='alert '+(ready&&a.compatible?'good':'');
  $('compatibility').textContent=!ready?'Le module WASM n’est pas disponible. Vérifie GitHub Actions et la présence de wasm/pack/pack_wasm_bg.wasm.':
    !a.compatible?diagnostic(a).join('\n'):
    'Moteur opérationnel. Compilation locale possible pour ce type de ressources.';
  $('compile').disabled=!(ready&&a.compatible);
}
async function compile({throwOnError=false}={}){
 try{
  $('compile').disabled=true;log('Compilation locale des ressources...');
  const a=state.analysis,prefix=a.manifestPath.replace(/(?:app\/src\/main\/)?AndroidManifest\.xml$/,'');
  const manifest=state.files[a.manifestPath];
  if(!manifest)throw Error('AndroidManifest.xml non trouvé.');
  const r=[];
  for(const p of a.resourcePaths){
    const match=p.match(/(?:^|\/)res\/([^/]+)\/([^/]+)$/);if(!match)continue;
    const buf=new Uint8Array(await state.files[p].async('uint8array'));
    r.push({subdirectory:match[1],name:match[2],contents_b64:to64(buf)});
  }
  if(!r.length)throw Error('Aucune ressource compatible trouvée.');
  log('Signature RSA éphémère : génération locale...');
  const pem=await developmentPem();
  const mod=await engine();
  log('Compilation Google Pack WebAssembly : '+r.length+' ressources');
  const apk=from64(mod.build({
    manifest_b64:to64(new Uint8Array(await manifest.async('uint8array'))),
    resources:r,combined_pem_string:pem,generate_aab:false
  }));
  if(apk.length<100||apk[0]!==80||apk[1]!==75)throw Error('Google Pack a renvoyé un résultat qui n’est pas un fichier APK/ZIP.');
  if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
  state.objectUrl=URL.createObjectURL(new Blob([apk],{type:'application/vnd.android.package-archive'}));
  const name=(a.name==='Non précisé'?'APK-Forge':a.name).replace(/[^a-zA-Z0-9-_ ]/g,'').trim().replace(/\s+/g,'-').slice(0,48)||'APK-Forge';
  $('download').href=state.objectUrl;$('download').download=name+'-debug.apk';
  $('result').textContent=name+' : APK créé et signé';
  $('resultMeta').textContent='Taille : '+(apk.length/1024).toFixed(1)+' Kio · '+a.packageName+' · '+a.version;
  log('Terminé. APK généré : '+apk.length+' octets.');
  show(3);
  return new Blob([apk],{type:'application/vnd.android.package-archive'});
 }catch(e){log('Erreur : '+e.message);$('compatibility').textContent='Échec de compilation : '+e.message;$('compatibility').className='alert';if(throwOnError)throw e;}
 finally{$('compile').disabled=!(state.analysis?.compatible&&!!state.engine);}
}
$('zip').addEventListener('change',async e=>{if(await analyze(e.target.files?.[0]))await startAutomaticBuild();});
$('sample').addEventListener('click',loadSample);
$('sample2').addEventListener('click',loadSample);
$('report').addEventListener('click',downloadReport);
$('autoProjectReport').addEventListener('click',downloadReport);
$('drop').addEventListener('click',()=>$('zip').click());
for(const event of ['dragover','dragenter'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('over');});
$('drop').addEventListener('dragleave',e=>{e.preventDefault();$('drop').classList.remove('over');});
$('drop').addEventListener('drop',async e=>{e.preventDefault();$('drop').classList.remove('over');if(await analyze(e.dataTransfer.files?.[0]))await startAutomaticBuild();});
$('next0').addEventListener('click',()=>{audit();show(1);}); 
$('autoBuild').addEventListener('click',startAutomaticBuild);
$('next1').addEventListener('click',()=>{show(2);prepare();});
$('compile').addEventListener('click',compile);
$('again').addEventListener('click',()=>{if(autoBusy)return;state.zip=null;state.files=null;state.analysis=null;$('zip').value='';$('next0').disabled=true;$('uploadStatus').className='hidden';show(0);});
document.querySelectorAll('[data-back]').forEach(el=>el.addEventListener('click',()=>show(Number(el.dataset.back))));
checkEngine();
attachKotlinLab(()=>state);
attachAndroidCompiler(()=>state);
attachRealResourceCompiler(()=>state,()=>getRuntimeArtifacts());

const aapt2Btn=document.getElementById('aapt2Inspect');
const aapt2Download=document.getElementById('aapt2Download');
aapt2Btn?.addEventListener('click',()=>{
 const out=document.getElementById('aapt2Result');
 try{
  const a=assessAapt2(state.analysis);
  out.textContent='Ressources : '+a.resourceCount+'\nLimitations du compilateur Web : '+a.blockers.length+'\n\n'+
    a.blockers.map(x=>'• '+x.path+'\n  '+x.reason).join('\n')+
    '\n\nAPK installable : NON\nLa chaîne AAPT2 doit produire les vraies ressources avant recompilation Kotlin et signature.';
  aapt2Download.disabled=false;
 }catch(e){out.textContent=e.message;aapt2Download.disabled=true;}
});
aapt2Download?.addEventListener('click',()=>{
 try{
  const blob=new Blob([aapt2Report(state.analysis)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='rapport-aapt2-elm327.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(e){document.getElementById('aapt2Result').textContent=e.message;}
});
