/**
 * APK structural validator. No cryptographic claims are made here.
 * GitHub Actions verifies the APK signature with the official apksigner.
 */
const decoder=new TextDecoder();
const MAGIC='APK Sig Block 42';
const U32=0xffffffff;
const requireBytes=(b,o,n)=>{if(o<0||!Number.isSafeInteger(o)||o+n>b.length)throw Error('APK tronqué ou structure ZIP invalide.');};
export function inspectSignedApk(raw){
 const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16=o=>{requireBytes(bytes,o,2);return view.getUint16(o,true);};
 const u32=o=>{requireBytes(bytes,o,4);return view.getUint32(o,true);};
 const u64=o=>{requireBytes(bytes,o,8);const n=view.getBigUint64(o,true);
  if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('APK ZIP64/sizes non pris en charge.');
  return Number(n);
 };
 const magic=o=>decoder.decode(bytes.subarray(o,o+16));
 let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){eocd=i;break;}
 }
 if(eocd<0)throw Error('Fin ZIP (EOCD) introuvable.');
 if(u16(eocd+4)!==0||u16(eocd+6)!==0)throw Error('APK ZIP multi-volume interdit.');
 const count=u16(eocd+10),size=u32(eocd+12),offset=u32(eocd+16);
 if(count===0||count===0xffff||size===U32||offset===U32)
  throw Error('ZIP64/vide non pris en charge pour APK Forge.');
 if(offset+size!==eocd)throw Error('Table centrale ZIP invalide.');
 if(offset<24||magic(offset-16)!==MAGIC)throw Error('Bloc signature APK v2/v3 absent.');
 const sigSize=u64(offset-24);
 if(sigSize<24||sigSize>offset-8)throw Error('Taille de signature APK incorrecte.');
 const start=offset-sigSize-8;
 if(u64(start)!==sigSize)throw Error('Encadrement du bloc signature APK incorrect.');
 let p=start+8,v2=false,v3=false,pairs=0;
 while(p<offset-24){
  const n=u64(p);p+=8;
  if(n<5||p+n>offset-24)throw Error('Paire APK Signing Block invalide.');
  const id=u32(p);p+=n;
  v2 ||= id===0x7109871a;
  v3 ||= id===0xf05368c0||id===0x1b93ad61;
  pairs++;
 }
 if(p!==offset-24||!pairs||!(v2||v3))
  throw Error('Aucun schéma de signature APK v2/v3 identifié.');
 const entries=new Set();
 let c=offset,stored=0;
 for(let i=0;i<count;i++){
  if(u32(c)!==0x02014b50)throw Error('Entrée centrale ZIP invalide.');
  const method=u16(c+10),filenameLength=u16(c+28),extra=u16(c+30),comment=u16(c+32);
  const localOffset=u32(c+42);
  requireBytes(bytes,c+46,filenameLength+extra+comment);
  const filename=decoder.decode(bytes.subarray(c+46,c+46+filenameLength));
  if(!filename||entries.has(filename))throw Error('Nom d’entrée APK vide ou dupliqué.');
  entries.add(filename);
  if(u32(localOffset)!==0x04034b50)throw Error('En-tête local ZIP manquant : '+filename);
  const dataOffset=localOffset+30+u16(localOffset+26)+u16(localOffset+28);
  if(method===0){
   stored++;
   if(dataOffset%4!==0)throw Error('Alignement ZIP 4 octets incorrect : '+filename);
  }
  c+=46+filenameLength+extra+comment;
 }
 if(c!==eocd||!entries.has('AndroidManifest.xml')||!entries.has('resources.arsc')||!entries.has('classes.dex'))
  throw Error('APK incomplet : table ZIP, manifeste, resources.arsc ou classes.dex absent.');
 return {entries:entries.size,storedEntries:stored,hasV2:v2,hasV3:v3,aligned:true,signatureVerifiedCryptographically:false};
}