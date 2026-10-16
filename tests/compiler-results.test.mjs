import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompilerArtifact} from '../src/compiler-results.mjs';
test('Bloque un fichier class inexistant même si Java a renvoyé code 0',async()=>{
 await assert.rejects(()=>validateCompilerArtifact(null,'class'),/aucun fichier .class/);
});
test('Bloque un DEX inexistant et incomplet',async()=>{
 await assert.rejects(()=>validateCompilerArtifact(null,'dex'),/aucun fichier classes.dex/);
 await assert.rejects(()=>validateCompilerArtifact(new Blob([new Uint8Array([100,101,120,10])]),'dex'),/incomplet/);
});
test('Vérifie la magie JVM et DEX, refuse un zip renommé',async()=>{
 const classFile=new Blob([new Uint8Array([0xca,0xfe,0xba,0xbe,0,0,0,61])]);
 const dexFile=new Blob([new Uint8Array([100,101,120,10,48,51,57,0])]);
 assert.equal(await validateCompilerArtifact(classFile,'class'),classFile);
 assert.equal(await validateCompilerArtifact(dexFile,'dex'),dexFile);
 await assert.rejects(()=>validateCompilerArtifact(new Blob([new Uint8Array([80,75,3,4,0,0,0,0])]),'class'),/signature/);
});
