/** DEX verification aligned with Android ART's map_list requirements. */
const u16=(v,n)=>v.getUint16(n,true),u32=(v,n)=>v.getUint32(n,true);
const hex=n=>'0x'+n.toString(16).padStart(4,'0');
export function inspectDexMap(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<112 ||
  bytes[0]!==100||bytes[1]!==101||bytes[2]!==120||bytes[3]!==10)
  throw Error('DEX : en-tête ou signature magique absent.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const fileSize=u32(view,0x20),headerSize=u32(view,0x24),endian=u32(view,0x28),mapOff=u32(view,0x34);
 if(fileSize!==bytes.byteLength||headerSize!==112||endian!==0x12345678)
  throw Error('DEX : taille, en-tête ou ordre des octets invalide.');
 if(!mapOff||mapOff%4||mapOff<112||mapOff+4>fileSize)
  throw Error('DEX : section map_list absente ou hors limites.');
 const count=u32(view,mapOff);
 if(count<2||count>300||count*12>fileSize-mapOff-4)
  throw Error('DEX : taille de la map_list invalide.');
 const types=new Set();let header=false,map=false;
 for(let i=0;i<count;i++){
  const at=mapOff+4+i*12,type=u16(view,at),unused=u16(view,at+2);
  const size=u32(view,at+4),offset=u32(view,at+8);
  if(unused||size===0||offset>=fileSize)throw Error('DEX : élément map_list #'+i+' invalide.');
  if(types.has(type))throw Error('DEX : section map_list dupliquée de type '+hex(type)+
   '. Android rejetterait ce DEX au lancement.');
  types.add(type);
  if(type===0){if(size!==1||offset!==0)throw Error('DEX : header_item invalide.');header=true;}
  if(type===0x1000){if(size!==1||offset!==mapOff)throw Error('DEX : map_list invalide.');map=true;}
 }
 if(!header||!map)throw Error('DEX : map_list incomplète.');
 return {sections:count,fileSize,mapOff};
}
function adler32(bytes,start){
 let a=1,b=0;
 for(let i=start;i<bytes.length;){
  const end=Math.min(bytes.length,i+5552);
  for(;i<end;i++){a+=bytes[i];b+=a;}
  a%=65521;b%=65521;
 }
 return ((b<<16)|a)>>>0;
}
export async function verifyDexIntegrity(bytes){
 const info=inspectDexMap(bytes),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(u32(view,8)!==adler32(bytes,12))
  throw Error('DEX : checksum Adler32 incorrect (fichier modifié ou tronqué).');
 if(!globalThis.crypto?.subtle?.digest)
  throw Error('DEX : WebCrypto nécessaire pour vérifier SHA-1.');
 const sha=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1',bytes.subarray(32)));
 if(!sha.every((x,i)=>x===bytes[12+i]))
  throw Error('DEX : empreinte SHA-1 interne incorrecte.');
 return info;
}
export function declaredManifestProviderClasses(manifest,packageName){
 if(typeof manifest!=='string'||typeof packageName!=='string')throw Error('Manifeste Android invalide.');
 const names=[];
 for(const [,attrs] of manifest.matchAll(/<provider\b([^>]*)\/?\s*>/gi)){
  const m=attrs.match(/(?:^|\s)android:name\s*=\s*(["'])([^"']+)\1/);
  if(!m)throw Error('ContentProvider sans android:name.');
  const n=m[2].startsWith('.')?packageName+m[2]:m[2].includes('.')?m[2]:packageName+'.'+m[2];
  if(/\$\{/.test(n))throw Error('Nom de ContentProvider non résolu : '+n);
  names.push(n);
 }
 return [...new Set(names)];
}
export function assertManifestProvidersPresent({manifest,packageName,definedClasses}){
 const names=declaredManifestProviderClasses(manifest,packageName);
 for(const name of names)if(!definedClasses.has('L'+name.replace(/\./g,'/')+';'))
  throw Error('ContentProvider Android absent des DEX : '+name+
   '. L’APK se fermerait au démarrage (ClassNotFoundException).');
 return names;
}

export function dexMapDiagnostic(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<112)return {error:'En-tête DEX absent',size:bytes?.length??0};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),off=view.getUint32(0x34,true);
 if(off<112||off+4>bytes.length)return {size:bytes.length,mapOff:off,error:'Offset map invalide'};
 const count=view.getUint32(off,true),entries=[];
 for(let i=0;i<Math.min(count,60);i++){
  const at=off+4+i*12;if(at+12>bytes.length)break;
  entries.push({index:i,type:'0x'+view.getUint16(at,true).toString(16).padStart(4,'0'),
   unused:view.getUint16(at+2,true),size:view.getUint32(at+4,true),offset:view.getUint32(at+8,true)});
 }
 return {size:bytes.length,headerSize:view.getUint32(0x24,true),mapOff:off,count,entries};
}
