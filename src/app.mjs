import {developmentPem,to64,from64} from './crypto.mjs';
const $=id=>document.getElementById(id);
let state={zip:null,files:null,manifest:null,resourceList:[],file:null,analysis:null,engine:null,objectUrl:null};
const log=s=>{let n=$('logs');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const fact=(name,value)=>{let x=document.createElement('div');x.className='fact';let t=document.createElement('small');t.textContent=name;let v=document.createElement('b');v.textContent=String(value??'Non détecté');x.append(t,v);return x;};
const show=i=>{for(const el of document.querySelectorAll('[data-panel]'))el.classList.toggle('active',+el.dataset.panel===i);for(const el of document.querySelectorAll('[data-step]'))el.classList.toggle('on',+el.dataset.step===i);};
function projectInfo(paths,texts){
 const text=Object.values(texts).join('\n');
 const m=texts[paths.find(p=>p.endsWith('AndroidManifest.xml'))]||'';
 const src=paths.filter(p=>/\.(java|kt)$/.test(p));
 const code=src.length>0 || /android:hasCode\s*=\s*["']true["']/.test(m);
 const resources=paths.filter(p=>/(?:^|\/)res\/[^/]+\/[^/]+$/.test(p));
 const wrapper=texts[paths.find(p=>p.endsWith('gradle-wrapper.properties'))]||'';
 const find=(src,re)=>src.match(re)?.[1]||'Non précisé';
 const parsed={
    manifestPath:paths.find(p=>p.endsWith('AndroidManifest.xml')),
    packageName:find(m,/\bpackage\s*=\s*["']([^"']+)/),
    name:find(m,/android:label\s*=\s*["']([^"']+)/),
    version:find(text,/\bversionName\s*(?:=|\s)\s*["']([^"']+)/),
    gradle:find(wrapper,/gradle-([\d.]+)-(?:bin|all)\.zip/),
    sdk:find(text,/\bcompileSdk\s*(?:=|\()\s*(\d+)/),
    java:src.filter(p=>p.endsWith('.java')).length,
    kotlin:src.filter(p=>p.endsWith('.kt')).length,
    resources:resources.length,
    files:paths.length,
    compatible:!!m&&!code&&/android:hasCode\s*=\s*["']false["']/.test(m)&&resources.length>0,
    resourcePaths:resources,
 };
 return parsed;
}
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
    for(const p of paths.filter(p=>/AndroidManifest\.xml$|gradle-wrapper\.properties$|(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/.test(p))){
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
function audit(){
  const a=state.analysis;if(!a)return;
  $('facts').replaceChildren(
    fact('Nom',a.name),fact('Package',a.packageName),fact('Version',a.version),
    fact('Gradle',a.gradle),fact('SDK',a.sdk),fact('Java / Kotlin',a.java+' / '+a.kotlin),
    fact('Ressources',a.resources),fact('Fichiers dans ZIP',a.files)
  );
  $('audit').className='alert '+(a.compatible?'good':'');
  $('audit').textContent=a.compatible?'Projet sans code détecté. Google Pack peut tenter de compiler ses ressources.':
    'Projet incompatible avec ce moteur : Java/Kotlin présent, manifeste manquant, déclaration android:hasCode="false" absente, ou aucune ressource. Ce moteur ne remplace pas javac, Kotlin, Gradle ni D8.';
}
async function prepare(){
  const ready=await checkEngine();
  const a=state.analysis;
  $('compatibility').className='alert '+(ready&&a.compatible?'good':'');
  $('compatibility').textContent=!ready?'Le module WASM n’est pas disponible. Vérifie GitHub Actions et la présence de wasm/pack/pack_wasm_bg.wasm.':
    !a.compatible?'Ce ZIP nécessite d’autres compilateurs. Pour le moment seuls les projets sans code natif sont acceptés.':
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
