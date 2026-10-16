import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {inspectDexMap,verifyDexIntegrity,declaredManifestProviderClasses,assertManifestProvidersPresent} from '../src/dex-integrity.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
function dex(duplicate=false){
 const b=new Uint8Array(256),v=new DataView(b.buffer),mapOff=112;
 b.set(new TextEncoder().encode('dex\n035\0'));
 v.setUint32(0x20,b.length,true);v.setUint32(0x24,112,true);
 v.setUint32(0x28,0x12345678,true);v.setUint32(0x34,mapOff,true);
 v.setUint32(mapOff,duplicate?3:2,true);
 const item=(i,type,size,offset)=>{
  const at=mapOff+4+i*12;v.setUint16(at,type,true);v.setUint32(at+4,size,true);v.setUint32(at+8,offset,true);
 };
 item(0,0,1,0);item(1,0x1000,1,mapOff);
 if(duplicate)item(2,0,1,0);
 b.set(createHash('sha1').update(b.subarray(32)).digest(),12);
 let a=1,c=0;for(const x of b.subarray(12)){a=(a+x)%65521;c=(c+a)%65521;}
 v.setUint32(8,((c<<16)|a)>>>0,true);
 return b;
}
test('DEX valide : map_list, Adler32 et SHA-1 corrects',async()=>{
 assert.equal(inspectDexMap(dex()).sections,2);
 assert.equal((await verifyDexIntegrity(dex())).fileSize,256);
});
test('Régression crash réel : Duplicate map section of type 0',async()=>{
 const invalid=dex(true);
 assert.throws(()=>inspectDexMap(invalid),/dupliquée de type 0x0000/);
 await assert.rejects(verifyDexIntegrity(invalid),/dupliquée/);
});
test('Bloque un DEX dont le checksum ou SHA-1 est corrompu',async()=>{
 const invalid=dex();invalid[180]^=1;
 await assert.rejects(verifyDexIntegrity(invalid),/Adler32/);
 const sha=dex();sha[12]^=1;
 let a=1,c=0;for(const x of sha.subarray(12)){a=(a+x)%65521;c=(c+a)%65521;}
 new DataView(sha.buffer).setUint32(8,((c<<16)|a)>>>0,true);
 await assert.rejects(verifyDexIntegrity(sha),/SHA-1/);
});
test('ContentProvider AndroidX doit être réellement dans les DEX',()=>{
 const manifest='<manifest><application><provider android:name="androidx.core.content.FileProvider" android:authorities="com.example.files"/></application></manifest>';
 assert.deepEqual(declaredManifestProviderClasses(manifest,'com.example'),['androidx.core.content.FileProvider']);
 assert.throws(()=>assertManifestProvidersPresent({manifest,packageName:'com.example',definedClasses:new Set()}),/FileProvider/);
 assert.deepEqual(assertManifestProvidersPresent({manifest,packageName:'com.example',definedClasses:new Set(['Landroidx/core/content/FileProvider;'])}),['androidx.core.content.FileProvider']);
});
