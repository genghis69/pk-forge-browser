/** Contrôle structurel de l'entrée Android. N'identifie pas les exceptions Java à l'exécution. */
const u32=(v,n)=>{if(n<0||n+4>v.byteLength)throw Error('DEX tronqué');return v.getUint32(n,true)};
export function definedDexClasses(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<112||String.fromCharCode(...bytes.subarray(0,4))!=='dex\n')
  throw Error('DEX invalide ou absent');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const size=u32(view,0x20),ss=u32(view,0x38),so=u32(view,0x3c),ts=u32(view,0x40),to=u32(view,0x44),cs=u32(view,0x60),co=u32(view,0x64);
 if(size>bytes.length||size<112||ss>2000000||ts>2000000||cs>2000000||
  so+ss*4>bytes.length||to+ts*4>bytes.length||co+cs*32>bytes.length)
  throw Error('DEX : tables de classes invalides');
 const result=new Set();
 for(let i=0;i<cs;i++){
  const ci=u32(view,co+i*32);if(ci>=ts)throw Error('DEX : index de classe invalide');
  const si=u32(view,to+ci*4);if(si>=ss)throw Error('DEX : index de chaîne invalide');
  let pos=u32(view,so+si*4),count=0;
  while(true){if(pos>=bytes.length||++count>5)throw Error('DEX : ULEB128 invalide');if(!(bytes[pos++]&128))break}
  const begin=pos;while(pos<bytes.length&&bytes[pos])pos++;
  if(pos>=bytes.length)throw Error('DEX : chaîne non terminée');
  result.add(new TextDecoder().decode(bytes.subarray(begin,pos)));
 }
 return result;
}
const attribute=(attrs,key)=>attrs.match(new RegExp('(?:^|\\s)android:'+key+'\\s*=\\s*(["\\x27])([^"\\x27]*)\\1'))?.[2]||'';
const qualified=(name,packageName)=>!name?'':name.startsWith('.')?packageName+name:name.includes('.')?name:packageName+'.'+name;
export function manifestStartupClasses(xml,packageName){
 if(!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)||typeof xml!=='string')
  throw Error('Manifeste ou package Android invalide');
 const app=xml.match(/<application\b([^>]*)>/i);
 if(!app)throw Error('Balise application absente');
 if(attribute(app[1],'hasCode')==='false')
  throw Error('android:hasCode=false interdit pour un APK contenant des classes Kotlin');
 const required=[],appClass=qualified(attribute(app[1],'name'),packageName);
 if(appClass)required.push({name:appClass,kind:'Application'});
 for(const [,tag,attrs,inner] of xml.matchAll(/<(activity|activity-alias)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)){
  const launcher=[...inner.matchAll(/<intent-filter\b[^>]*>([\s\S]*?)<\/intent-filter\s*>/gi)].some(([,s])=>
   /<action\b[^>]*android:name\s*=\s*["']android\.intent\.action\.MAIN["']/.test(s)&&
   /<category\b[^>]*android:name\s*=\s*["']android\.intent\.category\.LAUNCHER["']/.test(s));
  if(!launcher)continue;
  const name=qualified(attribute(attrs,tag==='activity-alias'?'targetActivity':'name'),packageName);
  if(!name)throw Error('Activity du lanceur sans classe Android');
  required.push({name,kind:'Activity de lancement'});
 }
 if(!required.some(r=>r.kind==='Activity de lancement'))
  throw Error('Le manifeste ne déclare aucune Activity MAIN/LAUNCHER');
 return required;
}
export function assertApkLaunchClasses({manifest,packageName,dexBuffers}){
 if(!Array.isArray(dexBuffers)||!dexBuffers.length)throw Error('Aucun DEX');
 const required=manifestStartupClasses(manifest,packageName),found=new Set();
 for(const bytes of dexBuffers)for(const type of definedDexClasses(bytes))found.add(type);
 for(const entry of required)if(!found.has('L'+entry.name.replace(/\./g,'/')+';'))
  throw Error(entry.kind+' absente de classes.dex : '+entry.name+'. La signature est annulée pour éviter un APK dont le lanceur est introuvable.');
 return {checked:required.map(x=>x.name),classCount:found.size};
}
