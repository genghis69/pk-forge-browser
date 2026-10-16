// APK Forge Browser : laboratoire JVM 17, Kotlin 2.2.20 et D8 (expérimental).
// Les entrées et les fichiers compilés ne quittent pas le navigateur.
const el=id=>document.getElementById(id);
const demo='class ForgeProof {\n fun answer(): Int = 42\n fun message(): String = "Kotlin fonctionne"\n}\n';
let env=null, library=null, busy=false, compilerReady=false, demoCompiled=false, d8Ready=false;
const say=(s)=>{const n=el('kotlinLabLog');n.textContent+='\n['+new Date().toLocaleTimeString('fr-FR')+'] '+s;n.scrollTop=n.scrollHeight;};
const state=(s,ok=false)=>{el('kotlinLabStatus').className='alert'+(ok?' good':'');el('kotlinLabStatus').textContent=s;};
async function installLoader(){
 if(typeof globalThis.cheerpjInit==='function')return;
 await new Promise((yes,no)=>{
  const s=document.createElement('script');s.async=true;s.src='https://cjrtnc.leaningtech.com/4.3/loader.js';
  s.onload=yes;s.onerror=()=>no(Error('Impossible de charger CheerpJ depuis son site officiel.'));
  document.head.append(s);
 });
}
const jarFolder='/app/toolchains/kotlin/2.2.20/jars/';
async function init(){
 if(compilerReady)return;
 say('Récupération du catalogue Kotlin 2.2.20...');
 const response=await fetch('./toolchains/kotlin/2.2.20/manifest.json',{cache:'no-store'});
 if(!response.ok)throw Error('Catalogue Kotlin indisponible (HTTP '+response.status+'). Le workflow doit terminer la publication.');
 env=await response.json();
 if(env.version!=='2.2.20'||!env.jars?.includes('kotlin-compiler-embeddable-2.2.20.jar'))throw Error('Composants Kotlin incomplets.');
 say(env.jars.length+' bibliothèques JVM répertoriées ('+(env.totalBytes/1048576).toFixed(1)+' Mio).');
 await installLoader();
 say('Démarrage Java 17 dans Chrome. Ce premier lancement peut prendre du temps.');
 await cheerpjInit({version:17,status:'none'});
 library=await cheerpjRunLibrary('');
 compilerReady=true;
 state('JVM Java 17 initialisée. Lance un essai de compilation Kotlin.',true);
 say('JVM Java 17 prête. Aucun ZIP n’a été envoyé vers un serveur de compilation.');
}
async function mkdir(path){
 const Paths=await library.java.nio.file.Paths;
 const Files=await library.java.nio.file.Files;
 await Files.createDirectories(await Paths.get(path));
}
async function compile(source,filename,isDemo){
 await init();
 const name=filename.replace(/[^A-Za-z0-9_.-]/g,'_');
 if(!name.endsWith('.kt'))throw Error('Seuls les fichiers Kotlin .kt sont acceptés.');
 const output='/files/apkforge-kotlin/'+(isDemo?'demo':'project');
 const input='/str/'+name;
 await mkdir(output);
 cheerpOSAddStringFile(input,source);
 const cp=env.jars.map(n=>jarFolder+n).join(':');
 say('Compilation Kotlin/JVM 2.2.20 de '+name+' (Java 17).');
 say('Les messages détaillés de Kotlin sont aussi visibles dans la console Chrome F12.');
 let code;
 try{
  code=await cheerpjRunMain('org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',cp,
   '-no-reflect','-jvm-target','17','-classpath',jarFolder+'kotlin-stdlib-2.2.20.jar',
   '-d',output,input);
 }finally{
  if(typeof cheerpOSRemoveStringFile==='function')cheerpOSRemoveStringFile(input);
 }
 say('Code de retour Kotlin : '+code);
 if(code!==0)throw Error('Compilation Kotlin interrompue (code '+code+'). Un fichier Android réel requiert android.jar et les dépendances Maven.');
 if(isDemo){
  const blob=await cjFileBlob(output+'/ForgeProof.class');
  const magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if(Array.from(magic).join(',')!=='202,254,186,190')throw Error('Sortie invalide : signature de classe Java absente.');
  demoCompiled=true;
  el('kotlinDownloadClass').disabled=false;
  say('✔ Bytecode JVM créé dans le navigateur : ForgeProof.class ('+blob.size+' octets).');
  state('Kotlin → .class a réussi dans le navigateur. Le DEX et l’APK sont des étapes distinctes.',true);
 }else{
  say('✔ Le compilateur a terminé, sans validation de toutes les classes ni assemblage APK.');
  state('Compilation du fichier sélectionné terminée, sans création d’APK.',true);
 }
}
async function dex(){
 if(!demoCompiled)throw Error('Commence par compiler l’exemple Kotlin.');
 if(!env?.d8Jar)throw Error('D8 absent du catalogue : téléchargement non disponible.');
 const output='/files/apkforge-kotlin/dex';
 await mkdir(output);
 say('D8 '+env.d8Version+' : conversion de ForgeProof.class en classes.dex...');
 const code=await cheerpjRunMain('com.android.tools.r8.D8','/app/toolchains/r8/'+env.d8Version+'/'+env.d8Jar,
  '--min-api','26','--output',output,'/files/apkforge-kotlin/demo/ForgeProof.class');
 if(code!==0)throw Error('D8 a échoué avec le code '+code+'.');
 const blob=await cjFileBlob(output+'/classes.dex');
 const magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());
 if(Array.from(magic).join(',')!=='100,101,120,10')throw Error('Le DEX généré ne possède pas la signature dex.');
 d8Ready=true;
 el('kotlinDownloadDex').disabled=false;
 say('✔ classes.dex créé dans Chrome ('+blob.size+' octets).');
 state('Kotlin → class → DEX exécutés dans Chrome. L’assemblage APK Kotlin reste non disponible.',true);
}
async function task(fn){
 if(busy)return;busy=true;
 const ids=['kotlinInit','kotlinDemo','kotlinFromZip','kotlinD8'];
 for(const id of ids)el(id).disabled=true;
 try{await fn();}
 catch(e){state('Échec : '+e.message);say('✘ '+e.message);console.error('APK Forge Kotlin',e);}
 finally{busy=false;for(const id of ids)el(id).disabled=false;el('kotlinFromZip').disabled=!el('kotlinSource').options.length;}
}
async function download(path,filename){
 const blob=await cjFileBlob(path);
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function attachKotlinLab(getProject){
 el('kotlinInit').addEventListener('click',()=>task(init));
 el('kotlinDemo').addEventListener('click',()=>task(()=>compile(demo,'ForgeProof.kt',true)));
 el('kotlinD8').addEventListener('click',()=>task(dex));
 el('kotlinFromZip').addEventListener('click',()=>task(async()=>{
  const s=getProject(),name=el('kotlinSource').value;
  if(!s?.files?.[name])throw Error('Aucun fichier Kotlin sélectionné.');
  const content=await s.files[name].async('string');
  if(content.length>1024*1024)throw Error('Source Kotlin de plus de 1 Mio.');
  await compile(content,name.split('/').at(-1),false);
 }));
 el('kotlinDownloadClass').addEventListener('click',()=>task(()=>download('/files/apkforge-kotlin/demo/ForgeProof.class','ForgeProof.class')));
 el('kotlinDownloadDex').addEventListener('click',()=>task(()=>download('/files/apkforge-kotlin/dex/classes.dex','classes.dex')));
}
export function refreshKotlinSources(project){
 const s=el('kotlinSource');
 const paths=project?.analysis?.sourceSamples?.filter(p=>p.endsWith('.kt'))??[];
 s.replaceChildren();
 for(const name of paths){const option=document.createElement('option');option.value=name;option.textContent=name.split('/').slice(-2).join('/');s.append(option);}
 el('kotlinFromZip').disabled=!paths.length;
}
