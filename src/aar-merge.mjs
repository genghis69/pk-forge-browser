/**
 * Real Android AAR input loader for Chrome. No user source or SDK secrets
 * leave the browser. Original public Maven AAR archives are downloaded from
 * GitHub Pages and checked against the CI-produced SHA-256 catalog.
 *
 * The only supported manifest modifications are explicit Android XML merges;
 * unknown placeholders, unsafe paths or conflicting application components
 * fail closed. Gradle/AGP's full manifest merger is NOT claimed.
 */
import {toolchainUrl} from './toolchain-paths.mjs';

const ANDROID='http://schemas.android.com/apk/res/android';
const TOOLS='http://schemas.android.com/tools';
const validNamespace=s=>typeof s==='string'&&/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(s);
const goodPath=p=>typeof p==='string'&&p.length<256&&!p.startsWith('/')&&
 !p.includes('\\')&&!p.split('/').some(s=>!s||s==='.'||s==='..');
const pathAllowed=p=>goodPath(p)&&
 (/^res\/[A-Za-z0-9_+.-]+\/[A-Za-z0-9_.+-]+$/.test(p)||
  /^assets\/[A-Za-z0-9_.+/-]+$/.test(p)||
  /^jni\/(?:armeabi-v7a|arm64-v8a|x86|x86_64)\/[A-Za-z0-9_.+-]+\.so$/.test(p));

function parseXml(text,source,parser=globalThis.DOMParser){
 if(typeof parser!=='function')throw Error('Analyse XML Android indisponible.');
 const doc=new parser().parseFromString(text,'application/xml');
 const error=doc.getElementsByTagName('parsererror')[0];
 if(error||doc.documentElement?.localName!=='manifest')
  throw Error('Manifeste AAR mal formé : '+source+' '+(error?.textContent||''));
 return doc;
}
const androidName=el=>el.getAttributeNS(ANDROID,'name')||el.getAttribute('android:name')||'';
const elementName=el=>el.localName;
function substitute(text,appId,source){
 const result=text.replace(/\$\{applicationId\}/g,appId);
 const unresolved=[...result.matchAll(/\$\{([^}]+)\}/g)].map(m=>m[1]);
 if(unresolved.length)throw Error('Manifest AAR : placeholders non résolus dans '+source+' : '+unresolved.join(', '));
 return result;
}
function rejectTools(el,source){
 const mode=el.getAttributeNS?.(TOOLS,'node')||el.getAttribute?.('tools:node');
 // Tools directive semantics require AGP manifest merger. Refuse rather than
 // silently ignoring a remove/replace operation.
 if(mode&&mode!=='merge')throw Error('Manifest AAR : tools:node='+mode+' nécessite le merger Android Gradle : '+source);
 for(const child of Array.from(el.childNodes||[]).filter(n=>n.nodeType===1))rejectTools(child,source);
}
const directChildren=node=>Array.from(node?.childNodes||[]).filter(n=>n.nodeType===1);
const byTag=(node,name)=>directChildren(node).filter(e=>elementName(e)===name);
const first=(node,name)=>byTag(node,name)[0]||null;
function stripTools(el){
 for(const attr of Array.from(el.attributes||[]))
  if(attr.namespaceURI===TOOLS||attr.name.startsWith('tools:'))
   el.removeAttributeNode(attr);
 for(const child of directChildren(el))stripTools(child);
}
function mergeAttrs(dest,source,sourceName){
 for(const attr of Array.from(source.attributes||[])){
  if(attr.name==='package'||attr.name==='xmlns:android'||attr.name==='xmlns:tools'||
     attr.namespaceURI===TOOLS||attr.name.startsWith('tools:'))continue;
  // The application manifest has higher priority. Library defaults fill only
  // missing attributes, never override the app's explicit choices.
  const ns=attr.namespaceURI,existing=ns?dest.getAttributeNS(ns,attr.localName):dest.getAttribute(attr.name);
  if(existing!==null)continue;
  if(ns)dest.setAttributeNS(ns,attr.name,attr.value);
  else dest.setAttribute(attr.name,attr.value);
 }
}
function sameKey(a,b){
 if(elementName(a)!==elementName(b))return false;
 const name=androidName(a),other=androidName(b);
 if(name||other)return !!name&&name===other;
 // Structural uniqueness for unnamed nodes. Avoid silently dropping data.
 return typeof a.isEqualNode==='function'&&a.isEqualNode(b);
}
function mergeChildren(dest,source,doc,sourceName){
 for(const element of directChildren(source)){
  if(elementName(element)==='uses-sdk')continue;
  if(elementName(element)==='application'){
   let app=first(dest,'application');
   if(!app){app=doc.importNode(element,false);dest.appendChild(app);}
   else mergeAttrs(app,element,sourceName);
   mergeChildren(app,element,doc,sourceName);
   continue;
  }
  if(elementName(element)==='queries'){
   let queries=first(dest,'queries');
   if(!queries){queries=doc.createElement('queries');dest.appendChild(queries);}
   mergeChildren(queries,element,doc,sourceName);
   continue;
  }
  const conflict=directChildren(dest).find(existing=>sameKey(existing,element));
  if(conflict){
   // Distinct library declarations with same Android name must be merged,
   // so keep app values and add missing permissions/intent filters/meta-data.
   mergeAttrs(conflict,element,sourceName);
   if(directChildren(element).length)mergeChildren(conflict,element,doc,sourceName);
   continue;
  }
  const imported=doc.importNode(element,true);
  // Strictly prevent directives requiring Gradle's full merger.
  rejectTools(imported,sourceName);
  stripTools(imported);
  dest.appendChild(imported);
 }
}
export function mergeAarManifests(appManifest,libraries,{applicationId,minSdk,parser=globalThis.DOMParser,serializer=globalThis.XMLSerializer}={}){
 if(!validNamespace(applicationId)||typeof serializer!=='function')
  throw Error('Manifest AAR : applicationId/serializer invalide.');
 const doc=parseXml(appManifest,'application',parser),root=doc.documentElement;
 const app=first(root,'application');
 if(!app)throw Error('Manifeste application sans <application>.');
 const packages=new Set(),names=new Set(),seen=new Set();
 for(const lib of libraries){
  const text=substitute(lib.manifest,applicationId,lib.name);
  const other=parseXml(text,lib.name,parser);
  const pkg=other.documentElement.getAttribute('package');
  if(!validNamespace(pkg))throw Error('Package/namespace AAR manquant : '+lib.name);
  if(pkg!==applicationId)packages.add(pkg);
  const sdk=first(other.documentElement,'uses-sdk');
  const min=Number(sdk?.getAttributeNS(ANDROID,'minSdkVersion')||
   sdk?.getAttribute('android:minSdkVersion')||0);
  if(min>minSdk)throw Error('AAR '+lib.name+' requiert minSdk '+min+' > '+minSdk);
  rejectTools(other.documentElement,lib.name);
  // Process children in declared dependency order; app nodes stay authoritative.
  mergeChildren(root,other.documentElement,doc,lib.name);
  names.add(lib.name);
 }
 const xml=new serializer().serializeToString(doc);
 if(/\$\{[^}]+\}/.test(xml))throw Error('Manifest fusionné contient des placeholders Gradle.');
 const identities=Array.from(root.getElementsByTagName('*'))
  .filter(el=>['activity','service','receiver','provider'].includes(elementName(el)))
  .map(el=>elementName(el)+':'+androidName(el));
 for(const id of identities){
  if(seen.has(id))throw Error('Composant manifest dupliqué : '+id);
  seen.add(id);
 }
 return {manifest:xml,packages:[...packages].sort(),libraryCount:names.size};
}
async function sha256(bytes){
 if(!globalThis.crypto?.subtle)throw Error('SHA-256 WebCrypto absent.');
 const hash=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
 return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateAarMetadata(catalog){
 if(!catalog||!Array.isArray(catalog.aarArtifacts)||catalog.aarArtifacts.length<2)
  throw Error('AAR Maven non catalogués.');
 const filenames=new Set();
 for(const a of catalog.aarArtifacts){
  if(!a||typeof a.file!=='string'||!a.file.endsWith('.aar')||
    a.relative!=='deps/trainmanager-ads-v1/archives/'+a.file||
    !/^[A-Za-z0-9_.-]+\.aar$/.test(a.file)||filenames.has(a.file)||
    !Number.isSafeInteger(a.size)||a.size<100||
    !/^[0-9a-f]{64}$/.test(a.sha256||''))
   throw Error('Inventaire AAR non vérifiable : '+String(a?.file));
  filenames.add(a.file);
 }
 return true;
}
export async function loadVerifiedAars(catalog,{fetchFn=fetch,moduleUrl=import.meta.url,Zip=globalThis.JSZip,progress=()=>{}}={}){
 validateAarMetadata(catalog);
 if(!Zip?.loadAsync)throw Error('JSZip requis pour les AAR authentiques.');
 const results=new Array(catalog.aarArtifacts.length);
 let next=0,total=0;
 const work=async()=>{
  while(next<results.length){
   const i=next++,a=catalog.aarArtifacts[i];
   const url=toolchainUrl('android/'+a.relative,moduleUrl);
   const response=await fetchFn(url,{cache:'no-store'});
   if(!response.ok)throw Error('AAR inaccessible : HTTP '+response.status+' '+a.file);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length!==a.size)throw Error('AAR incomplet : '+a.file);
   if(await sha256(bytes)!==a.sha256)throw Error('AAR SHA-256 incorrect : '+a.file);
   const zip=await Zip.loadAsync(bytes,{checkCRC32:true});
   const mf=zip.file('AndroidManifest.xml');
   if(!mf)throw Error('AndroidManifest.xml absent : '+a.file);
   const manifest=await mf.async('string');
   if(manifest.length>512000||!manifest.includes('<manifest'))
    throw Error('Manifest AAR invalide ou binaire : '+a.file);
   const resources=[],additional=[];
   for(const [path,item] of Object.entries(zip.files)){
    if(item.dir||path==='AndroidManifest.xml')continue;
    if(!goodPath(path))throw Error('Chemin d’archive Maven dangereux : '+path);
    if(!path.startsWith('res/')&&!path.startsWith('assets/')&&!path.startsWith('jni/'))continue;
    if(!pathAllowed(path))throw Error('Fichier AAR non pris en charge : '+a.file+'/'+path);
    const data=await item.async('uint8array');
    if(data.byteLength>32*1024*1024)throw Error('Fichier AAR trop volumineux : '+path);
    total+=data.byteLength;
    if(total>180*1024*1024)throw Error('AAR cumulés >180 Mio : ressources non chargées.');
    if(path.startsWith('res/'))resources.push({path,data});
    else additional.push({path:path.startsWith('jni/')?'lib/'+path.slice(4):path,data});
   }
   results[i]={name:a.file,manifest,resources,additional};
   progress('AAR vérifié : '+a.file+' ('+resources.length+' ressources, '+additional.length+' assets/JNI).');
  }
 };
 await Promise.all(Array.from({length:Math.min(3,results.length)},()=>work()));
 return results;
}
export function collectAarExtraFiles(libraries){
 const files=new Map();
 for(const lib of libraries)for(const item of lib.additional){
  if(!goodPath(item.path)||!(/^(assets|lib)\//.test(item.path)))
   throw Error('Fichier AAR à empaqueter invalide : '+item.path);
  const existing=files.get(item.path);
  if(existing){
   if(existing.length!==item.data.length||existing.some((b,i)=>b!==item.data[i]))
    throw Error('Deux AAR fournissent des fichiers différents au même emplacement : '+item.path);
  }else files.set(item.path,item.data);
 }
 return [...files].map(([path,data])=>({path,data}));
}
