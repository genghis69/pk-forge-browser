/** Chargement local des JAR sans requêtes HTTP Range, pour CheerpJ 4.3.
 * Les JAR sont distribués statiquement, téléchargés en JS, validés puis montés
 * comme Uint8Array en /str/ : aucun projet n'est compilé à distance.
 */
import {toolchainUrl,kotlinJarRelative,d8JarRelative} from './toolchain-paths.mjs';
const retained=new Map();
export function virtualJarPath(filename){
 if(typeof filename!=='string'||!/^[A-Za-z0-9_.-]+\.jar$/.test(filename))
  throw Error('Nom de JAR invalide.');
 return '/str/'+filename;
}
async function integrityOf(bytes,expected){
 if(!expected)return;
 if(!/^[0-9a-f]{64}$/i.test(expected))throw Error('SHA-256 attendu invalide.');
 if(!globalThis.crypto?.subtle)throw Error('Web Crypto SHA-256 absent.');
 const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
 const actual=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==expected.toLowerCase())throw Error('Intégrité SHA-256 incorrecte : bibliothèque altérée.');
}
export async function mountJar({relative,filename,expectedSize,sha256,moduleUrl,fetchFn=fetch,addFn,progress=()=>{}}){
 const path=virtualJarPath(filename);
 if(retained.has(path))return path;
 if(typeof addFn!=='function')throw Error('Montage binaire CheerpJ indisponible.');
 const url=toolchainUrl(relative,moduleUrl);
 progress('Chargement complet du JAR '+filename+'...');
 const response=await fetchFn(url,{method:'GET',cache:'force-cache'});
 if(!response.ok)throw Error('JAR inaccessible : HTTP '+response.status+' '+url.href);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)
  throw Error('JAR non valide (réponse HTML ou ZIP corrompu) : '+filename);
 if(Number.isInteger(expectedSize)&&expectedSize!==bytes.byteLength)
  throw Error('Taille incorrecte : '+filename);
 await integrityOf(bytes,sha256);
 addFn(path,bytes);
 retained.set(path,bytes);
 progress('Chargé en mémoire : '+filename+' ('+(bytes.length/1048576).toFixed(1)+' Mio).');
 return path;
}
export async function mountKotlinJars(catalog,moduleUrl,fetchFn,addFn,progress){
 if(!Array.isArray(catalog?.jars)||!Array.isArray(catalog?.artifacts))
  throw Error('Catalogue Kotlin et SHA-256 incomplets.');
 for(const filename of catalog.jars){
  const a=catalog.artifacts.find(x=>x.filename===filename);
  if(!a?.sha256)throw Error('SHA-256 du JAR manquant : '+filename);
  await mountJar({relative:kotlinJarRelative(filename),filename,expectedSize:a.size,
   sha256:a.sha256,moduleUrl,fetchFn,addFn,progress});
 }
 return catalog.jars.map(virtualJarPath);
}
export async function mountD8(catalog,moduleUrl,fetchFn,addFn,progress){
 if(!catalog?.d8Jar)throw Error('D8 absent du catalogue de compilation.');
 return mountJar({
  relative:d8JarRelative(catalog.d8Version,catalog.d8Jar),
  filename:catalog.d8Jar,expectedSize:catalog.d8Size,sha256:catalog.d8Sha256,
  moduleUrl,fetchFn,addFn,progress
 });
}
