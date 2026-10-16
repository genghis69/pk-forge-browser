/**
 * AAPT2 WebAssembly adapter. No native tools and no user files leave Chrome.
 * Requires an actual Emscripten-built AAPT2 binary at wasm/aapt2/aapt2.js.
 * If the binary is absent, returns null; never pretends Google Pack is AAPT2.
 * Build contract: MODULARIZE, EXPORT_ES6, EXIT_RUNTIME=0 and exported FS/callMain.
 */
import {toolchainUrl} from './toolchain-paths.mjs';
import {isGeneratedPath} from './analyzer.mjs';
let modulePromise;
export function parseAapt2Symbols(text) {
 if(typeof text!=='string'||!text.trim())throw Error('AAPT2 n’a pas produit R.txt.');
 const ids=Object.create(null);
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;
  const match=line.trim().match(/^int\s+([a-zA-Z_]\w*)\s+([a-zA-Z_]\w*)\s+(0x[0-9a-fA-F]{8})$/);
  if(!match){
   if(/^int(?:\[\])?\s+styleable\b/.test(line.trim()))
    throw Error('R.styleable requiert la génération complète de R.kt (tableaux non encore pris en charge).');
   throw Error('Ligne R.txt AAPT2 inattendue : '+line.slice(0,140));
  }
  const key=match[1]+'/'+match[2],id=Number.parseInt(match[3],16);
  if(id<0x7f000000||Object.hasOwn(ids,key))throw Error('ID AAPT2 invalide/dupliqué : '+key);
  ids[key]=id;
 }
 if(!Object.keys(ids).length)throw Error('R.txt ne contient aucun identifiant.');
 return ids;
}
export function assertAapt2Runtime(instance) {
 if(!instance||typeof instance.callMain!=='function'||!instance.FS||
    typeof instance.FS.writeFile!=='function'||typeof instance.FS.readFile!=='function'||
    typeof instance.FS.mkdir!=='function')
  throw Error('Port AAPT2 WASM incompatible : export FS/callMain manquant.');
 return instance;
}
function writeDirectories(FS,path){
 const dirs=path.split('/').slice(0,-1);
 let current='';
 for(const dir of dirs){if(!dir)continue;current+='/'+dir;
  try{FS.mkdir(current);}catch(e){if(!/exist/i.test(String(e?.message||e)))throw e;}
 }
}
export function runAapt2(instance,args){
 assertAapt2Runtime(instance);
 try{
  const result=instance.callMain(args);
  if(typeof result==='number'&&result!==0)throw Error('Code de sortie '+result);
 }catch(e){throw Error('AAPT2 '+args[0]+' a échoué : '+String(e?.message||e));}
}
async function availableModule(moduleUrl,fetchFn){
 if(modulePromise)return modulePromise;
 const url=new URL('../wasm/aapt2/aapt2.js',moduleUrl);
 const response=await fetchFn(url,{method:'HEAD',cache:'no-store'});
 if(response.status===404)return null;
 if(!response.ok)throw Error('Chargement AAPT2 WASM impossible (HTTP '+response.status+').');
 modulePromise=import(url.href).then(m=>{
  if(typeof m.default!=='function')throw Error('AAPT2 WASM doit exporter une factory Emscripten.');
  return m.default({locateFile:(p)=>new URL(p,url).href});
 }).then(assertAapt2Runtime);
 return modulePromise;
}
export async function compileAapt2Wasm({project,manifest,resourcePaths,moduleUrl=import.meta.url,fetchFn=fetch,moduleFactory=null}){
 const instance=moduleFactory?assertAapt2Runtime(await moduleFactory()):await availableModule(moduleUrl,fetchFn);
 if(!instance)return null;
 if(!project?.files||typeof manifest!=='string'||!resourcePaths?.length)
  throw Error('Sources et manifeste obligatoires pour AAPT2.');
 const FS=instance.FS;
 const root='/apkforge-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const manifestPath=root+'/AndroidManifest.xml',compiled=root+'/resources.zip';
 const linked=root+'/linked.apk',symbols=root+'/R.txt',sdk=root+'/android.jar';
 writeDirectories(FS,manifestPath);
 FS.writeFile(manifestPath,new TextEncoder().encode(manifest));
 const androidResponse=await fetchFn(toolchainUrl('android/sdk/36/android.jar',moduleUrl),{cache:'no-store'});
 if(!androidResponse.ok)throw Error('android.jar API 36 indisponible pour AAPT2.');
 const androidJar=new Uint8Array(await androidResponse.arrayBuffer());
 if(androidJar.length<1_000_000)throw Error('android.jar tronqué.');
 FS.writeFile(sdk,androidJar);
 let total=0;
 for(const path of resourcePaths){
  if(isGeneratedPath(path))throw Error('Ressource générée interdite : '+path);
  const match=path.match(/(?:^|\/)res\/([a-zA-Z0-9_+-]+)\/([a-zA-Z0-9_.+-]+)$/);
  if(!match||!project.files[path])throw Error('Ressource Android invalide : '+path);
  const bytes=new Uint8Array(await project.files[path].async('uint8array'));
  total+=bytes.byteLength;
  if(total>64*1024*1024)throw Error('Ressources trop volumineuses pour le port AAPT2 WASM (64 Mio).');
  const dest=root+'/res/'+match[1]+'/'+match[2];
  writeDirectories(FS,dest);
  FS.writeFile(dest,bytes);
 }
 // Real AAPT2 compile and link. Both stages must produce physical files in the WASM FS.
 runAapt2(instance,['compile','--dir',root+'/res','-o',compiled]);
 const intermediate=FS.readFile(compiled);
 if(intermediate.length<4||intermediate[0]!==0x50||intermediate[1]!==0x4b)
  throw Error('AAPT2 compile n’a pas produit une archive .flat valide.');
 runAapt2(instance,['link','-o',linked,'-I',sdk,'--manifest',manifestPath,
  '--output-text-symbols',symbols,'--auto-add-overlay','-R',compiled]);
 const apk=new Uint8Array(FS.readFile(linked));
 const rText=new TextDecoder().decode(FS.readFile(symbols));
 const ids=parseAapt2Symbols(rText);
 if(apk.length<100||apk[0]!==0x50||apk[1]!==0x4b)
  throw Error('AAPT2 link n’a pas produit le ZIP des ressources.');
 return {apk,ids,compiler:'AAPT2 WebAssembly',rText};
}