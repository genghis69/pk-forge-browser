/**
 * Chargement local des JAR de compilation dans CheerpJ (sans HTTP Range).
 *
 * Depuis un site statique GitHub Pages, le manifeste JSON peut être plus récent
 * que le JAR gardé en cache pour la même URL. Nous séparons les versions par
 * empreinte SHA-256 dans l'URL, désactivons le cache navigateur pour la requête
 * et exigeons STRICTEMENT la correspondance avant tout montage JVM.
 *
 * Ni sources utilisateur ni ZIP ne sont envoyés à un serveur de compilation.
 */
import {toolchainUrl,kotlinJarRelative,d8JarRelative} from './toolchain-paths.mjs';
const retained=new Map();

export function virtualJarPath(filename){
 if(typeof filename!=='string'||!/^[A-Za-z0-9_.-]+\.jar$/.test(filename))
  throw Error('Nom de JAR invalide.');
 return '/str/'+filename;
}

export function fingerprintedJarUrl(relative,moduleUrl,sha256,attempt=0){
 const url=toolchainUrl(relative,moduleUrl);
 if(sha256!=null){
  if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/i.test(sha256))
   throw Error('Empreinte SHA-256 du catalogue invalide.');
  url.searchParams.set('sha256',sha256.toLowerCase());
 }
 if(attempt>0)url.searchParams.set('retry',String(attempt));
 return url;
}

export class JarIntegrityError extends Error{
 constructor(detail){
  super(detail);
  this.name='JarIntegrityError';
 }
}

async function verifyJar(bytes,{filename,expectedSize,sha256}){
 if(bytes.byteLength<4 || bytes[0]!==80 || bytes[1]!==75 ||
    bytes[2]!==3 || bytes[3]!==4)
  throw new JarIntegrityError('En-tête JAR invalide (réponse HTML ou archive corrompue) : '+filename);
 if(expectedSize!=null){
  if(!Number.isSafeInteger(expectedSize)||expectedSize<4)
   throw Error('Taille attendue invalide pour '+filename);
  if(bytes.byteLength!==expectedSize)
   throw new JarIntegrityError('Taille de '+filename+' : reçu '+bytes.byteLength+' octets, attendu '+expectedSize);
 }
 if(sha256!=null){
  if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/i.test(sha256))
   throw Error('Empreinte SHA-256 attendue invalide pour '+filename);
  if(!globalThis.crypto?.subtle?.digest)
   throw Error('Web Crypto SHA-256 indisponible. HTTPS ou localhost requis.');
  const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
  const actual=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==sha256.toLowerCase())
   throw new JarIntegrityError(
    'Intégrité SHA-256 incorrecte pour '+filename+
    ' (attendu '+sha256.slice(0,16)+'…, obtenu '+actual.slice(0,16)+'…).'
   );
 }
}

export async function mountJar({
 relative,filename,expectedSize,sha256,moduleUrl,fetchFn=fetch,addFn,
 progress=()=>{}
}){
 const path=virtualJarPath(filename),hash=sha256?.toLowerCase()??null;
 if(retained.has(path)){
  const existing=retained.get(path);
  if(existing.hash!==hash || (expectedSize!=null && existing.bytes.byteLength!==expectedSize))
   throw Error('Le JAR '+filename+' a changé depuis son montage en mémoire. Recharge la page avec Ctrl + F5 avant une nouvelle compilation.');
  return path;
 }
 if(typeof addFn!=='function')throw Error('Montage binaire CheerpJ indisponible.');

 // Empreinte dans l'URL : chaque déploiement modifié possède sa propre URL.
 // cache:no-store évite les réponses périmées au niveau du navigateur.
 for(let attempt=0;attempt<2;attempt++){
  const url=fingerprintedJarUrl(relative,moduleUrl,hash,attempt);
  progress((attempt?'Nouvelle tentative avec URL actualisée : ':'Chargement complet du JAR ')+filename+'...');
  const response=await fetchFn(url,{method:'GET',cache:'no-store'});
  if(!response.ok)throw Error('JAR inaccessible : HTTP '+response.status+' '+url.href);
  const bytes=new Uint8Array(await response.arrayBuffer());
  try{
   await verifyJar(bytes,{filename,expectedSize,sha256:hash});
  }catch(e){
   if(e instanceof JarIntegrityError && attempt===0){
    progress('Contenu de '+filename+' différent du catalogue. Nouvelle requête sans cache, sans désactiver la vérification SHA-256.');
    continue;
   }
   if(e instanceof JarIntegrityError)
    throw new Error(e.message+' Cache ou déploiement GitHub Pages désynchronisé possible. Attends la fin du déploiement, puis recharge la page avec Ctrl + F5.');
   throw e;
  }
  // Monter seulement APRÈS vérification du contenu réel.
  addFn(path,bytes);
  retained.set(path,{bytes,hash});
  progress('JAR vérifié et chargé : '+filename+' ('+(bytes.length/1048576).toFixed(1)+' Mio).');
  return path;
 }
 throw Error('Deux tentatives de téléchargement ont échoué pour '+filename);
}

export async function mountKotlinJars(catalog,moduleUrl,fetchFn,addFn,progress){
 if(!Array.isArray(catalog?.jars)||!Array.isArray(catalog?.artifacts))
  throw Error('Catalogue Kotlin et SHA-256 incomplets.');
 for(const filename of catalog.jars){
  const a=catalog.artifacts.find(x=>x.filename===filename);
  if(!a?.sha256)throw Error('SHA-256 du JAR manquant : '+filename);
  await mountJar({
   relative:kotlinJarRelative(filename),filename,expectedSize:a.size,
   sha256:a.sha256,moduleUrl,fetchFn,addFn,progress
  });
 }
 return catalog.jars.map(virtualJarPath);
}

export async function mountD8(catalog,moduleUrl,fetchFn,addFn,progress){
 if(!catalog?.d8Jar)throw Error('D8 absent du catalogue de compilation.');
 if(!catalog?.d8Sha256)throw Error('SHA-256 D8 absent du catalogue.');
 return mountJar({
  relative:d8JarRelative(catalog.d8Version,catalog.d8Jar),
  filename:catalog.d8Jar,expectedSize:catalog.d8Size,
  sha256:catalog.d8Sha256,moduleUrl,fetchFn,addFn,progress
 });
}
