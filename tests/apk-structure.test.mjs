import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSignedApk} from '../src/apk-structure.mjs';
test('Fichier ZIP absent ou faux APK systématiquement refusé',()=>{
 for(const bytes of [new Uint8Array(),Uint8Array.of(80,75,3,4),new Uint8Array(100)]){
  assert.throws(()=>inspectSignedApk(bytes),/EOCD/);
 }
});
test('ZIP contenant uniquement une fin d’archive ne peut pas être présenté comme APK signé',()=>{
 const bytes=new Uint8Array(22),view=new DataView(bytes.buffer);
 view.setUint32(0,0x06054b50,true);
 assert.throws(()=>inspectSignedApk(bytes),/ZIP64\/vide/);
});
test('ZIP avec table centrale fictive est rejeté avant lecture hors limites',()=>{
 const bytes=new Uint8Array(50),view=new DataView(bytes.buffer);
 view.setUint32(28,0x06054b50,true);
 view.setUint16(28+10,1,true);
 assert.throws(()=>inspectSignedApk(bytes),/Table centrale ZIP/);
});
