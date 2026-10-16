import {developmentPem,to64,from64} from './crypto.mjs';
import {createSampleZip} from './sample.mjs';
import {projectInfo,isGeneratedPath} from './analyzer.mjs';
import {attachKotlinLab,refreshKotlinSources} from './kotlin-lab.mjs';
import {attachAndroidCompiler} from './android-compiler.mjs';
const $=id=>document.getElementById(id);
let state={zip:null,files:null,manifest:null,resourceList:[],file:null,analysis:null,engine:null,objectUrl:null};
const log=s=>{let n=$('logs');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const fact=(name,value)=>{let x=document.createElement('div');x.className='fact';let t=document.createElement('small');t.textContent=name;let v=document.createElement('b');v.textContent=String(value??'Non détecté');x.append(t,v);return x;};
const show=i=>{for(const el of document.querySelectorAll('[data-panel]'))el.classList.toggle('active',+el.dataset.panel===i);for(const el of document.querySelectorAll('[data-step]'))el.classList.toggle('on',+el.dataset.step===i);};
async function analyze(file){
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
  }catch(e){state.zip=null;$('next0').disabled=true;$('uploadStatus').className='alert';$('uploadStatus').textContent='Erreur : '+e.message;}
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
 const lines=[];
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
  engine:'Google Pack WebAssembly',engineSupports:'APK de ressources sans code Java/Kotlin',
  buildPossibleWithCurrentEngine:a.compatible,project:a,
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
async function compile(){
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
 }catch(e){log('Erreur : '+e.message);$('compatibility').textContent='Échec de compilation : '+e.message;$('compatibility').className='alert';}
 finally{$('compile').disabled=!(state.analysis?.compatible&&!!state.engine);}
}
$('zip').addEventListener('change',e=>analyze(e.target.files?.[0]));
$('sample').addEventListener('click',loadSample);
$('sample2').addEventListener('click',loadSample);
$('report').addEventListener('click',downloadReport);
$('drop').addEventListener('click',()=>$('zip').click());
for(const event of ['dragover','dragenter'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('over');});
$('drop').addEventListener('dragleave',e=>{e.preventDefault();$('drop').classList.remove('over');});
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('over');analyze(e.dataTransfer.files?.[0]);});
$('next0').addEventListener('click',()=>{audit();show(1);});
$('next1').addEventListener('click',()=>{show(2);prepare();});
$('compile').addEventListener('click',compile);
$('again').addEventListener('click',()=>{state.zip=null;state.files=null;state.analysis=null;$('zip').value='';$('next0').disabled=true;$('uploadStatus').className='hidden';show(0);});
document.querySelectorAll('[data-back]').forEach(el=>el.addEventListener('click',()=>show(Number(el.dataset.back))));
checkEngine();
attachKotlinLab(()=>state);
attachAndroidCompiler(()=>state);
