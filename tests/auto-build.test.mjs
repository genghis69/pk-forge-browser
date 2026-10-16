import test from 'node:test';
import assert from 'node:assert/strict';
import {runAutomaticApkBuild} from '../src/auto-build.mjs';
const project={zip:{},files:{},analysis:{packageName:'dev.example.app'}};
test('AAPT2, Kotlin, D8, signature s’exécutent dans cet ordre automatiquement',async()=>{
 const events=[],stages=[];
 const resource={ids:{'layout/main':0x7f010001}};
 const apk=new Blob([new Uint8Array(256)]);
 const result=await runAutomaticApkBuild({
  project,
  prepareResources:async()=>{events.push('aapt2');return resource;},
  compileKotlin:async()=>{events.push('kotlin');},
  compileDex:async()=>{events.push('d8');return {runtimeZip:new Blob(['dex']),linkedResourceSession:resource,sourceZip:project.zip};},
  assembleApk:async()=>{events.push('signature');return apk;},
  onPhase:e=>stages.push(e)
 });
 assert.equal(result,apk);
 assert.deepEqual(events,['aapt2','kotlin','d8','signature']);
 assert.deepEqual(stages.filter(e=>e.status==='done').map(e=>e.phase),[1,2,3,4]);
});
test('Arrêt sur un échec Kotlin, sans D8 ni APK fictif',async()=>{
 const called=[];
 await assert.rejects(()=>runAutomaticApkBuild({
  project,prepareResources:async()=>({ids:{'string/app':0x7f010001}}),
  compileKotlin:async()=>{called.push('kotlin');throw Error('Dépendance Kotlin manquante');},
  compileDex:async()=>called.push('d8'),
  assembleApk:async()=>called.push('apk')
 }),/Dépendance Kotlin manquante/);
 assert.deepEqual(called,['kotlin']);
});
test('Refuse les anciens DEX de diagnostic avec R temporaire',async()=>{
 const resources={ids:{'string/app':0x7f010001}};
 let assembled=false;
 await assert.rejects(()=>runAutomaticApkBuild({
  project,prepareResources:async()=>resources,compileKotlin:async()=>{},
  compileDex:async()=>({runtimeZip:new Blob(['dex']),linkedResourceSession:null,sourceZip:project.zip}),
  assembleApk:async()=>{assembled=true;}
 }),/DEX ne correspondent/);
 assert.equal(assembled,false);
});
