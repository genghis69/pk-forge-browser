import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {mountJar,mountKotlinJars,mountD8,virtualJarPath,fingerprintedJarUrl} from '../src/jvm-artifacts.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://genghis69.github.io/pk-forge-browser/src/kotlin-lab.mjs';
const jar=new Uint8Array([80,75,3,4,1,2,3,4,5,6]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const response=bytes=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});

test('Montage via URL unique par SHA-256 avec cache navigateur désactivé et sans Range',async()=>{
 const calls=[],mounted=[];
 const path=await mountJar({
  relative:'kotlin/2.2.20/jars/verified.jar',filename:'verified.jar',
  expectedSize:jar.length,sha256:hash(jar),moduleUrl:origin,
  fetchFn:async(url,opts)=>{calls.push({url,opts});return response(jar);},
  addFn:(...args)=>mounted.push(args)
 });
 assert.equal(path,'/str/verified.jar');
 assert.equal(mounted[0][1][0],80);
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.cache,'no-store');
 assert.equal(calls[0].opts.headers?.Range,undefined);
 assert.equal(calls[0].url.searchParams.get('sha256'),hash(jar));
 assert.match(calls[0].url.pathname,/pk-forge-browser\/toolchains\//);
});

test('Cache périmé : premier JAR refusé, seconde requête reçoit le bon, SHA obligatoire',async()=>{
 const stale=new Uint8Array([80,75,3,4,8,9,10,11,12,13]);
 const fresh=new Uint8Array([80,75,3,4,21,22,23,24,25,26]);
 const requests=[],mounted=[];
 const result=await mountJar({
  relative:'android/helpers/1/cache-busted.jar',filename:'cache-busted.jar',
  expectedSize:fresh.length,sha256:hash(fresh),moduleUrl:origin,
  fetchFn:async(url,opts)=>{requests.push({url,opts});return response(requests.length===1?stale:fresh);},
  addFn:(...args)=>mounted.push(args)
 });
 assert.equal(result,'/str/cache-busted.jar');
 assert.equal(requests.length,2);
 assert.equal(requests[0].url.searchParams.get('retry'),null);
 assert.equal(requests[1].url.searchParams.get('retry'),'1');
 assert.equal(requests[0].opts.cache,'no-store');
 assert.equal(requests[1].opts.cache,'no-store');
 assert.equal(mounted.length,1);
 assert.deepEqual(mounted[0][1],fresh);
});

test('Deux mauvaises réponses : échec sécurisé, aucune bibliothèque corrompue montée',async()=>{
 const wrong=new Uint8Array([80,75,3,4,0,0,0,0,0,0]);
 let called=0,installed=false;
 await assert.rejects(
  ()=>mountJar({
   relative:'android/helpers/1/always-stale.jar',filename:'always-stale.jar',
   expectedSize:jar.length,sha256:hash(jar),moduleUrl:origin,
   fetchFn:async()=>{called++;return response(wrong);},
   addFn:()=>{installed=true;}
  }),
  /Intégrité SHA-256 incorrecte.*cache ou déploiement|Intégrité SHA-256 incorrecte.*Cache ou déploiement/
 );
 assert.equal(called,2);
 assert.equal(installed,false);
});

test('Refuse JAR HTML et taille incorrecte malgré les tentatives',async()=>{
 await assert.rejects(
  ()=>mountJar({relative:'kotlin/2.2.20/jars/not-a-jar.jar',filename:'not-a-jar.jar',
   moduleUrl:origin,fetchFn:async()=>response(new TextEncoder().encode('<html>not found</html>')),addFn:()=>{}}),
  /En-tête JAR invalide/
 );
 await assert.rejects(
  ()=>mountJar({relative:'kotlin/2.2.20/jars/size-wrong.jar',filename:'size-wrong.jar',
   moduleUrl:origin,expectedSize:100,fetchFn:async()=>response(jar),addFn:()=>{}}),
  /Taille de/
 );
});

test('Monte Kotlin, vérifie l’empreinte de chaque dépendance et D8',async()=>{
 const a=jar.slice(),b=new Uint8Array([80,75,3,4,8,9,10,11]);
 const names=['unique-lib-one.jar','unique-lib-two.jar'];
 const artifacts=[{filename:names[0],size:a.length,sha256:hash(a)},{filename:names[1],size:b.length,sha256:hash(b)}];
 const observed=[];
 const result=await mountKotlinJars({jars:names,artifacts},origin,
  async url=>response(url.pathname.includes(names[0])?a:b),(path)=>observed.push(path),()=>{});
 assert.deepEqual(result,names.map(virtualJarPath));
 assert.deepEqual(observed,result);
 const dr=await mountD8({d8Version:'8.13.17',d8Jar:'unique-r8-8.13.17.jar',
  d8Size:jar.length,d8Sha256:hash(jar)},origin,
  async()=>response(jar),()=>{},()=>{});
 assert.equal(dr,'/str/unique-r8-8.13.17.jar');
});

test('URL SHA invalides et chemins dangereux rejetés',()=>{
 assert.throws(()=>virtualJarPath('../../evil.jar'));
 assert.throws(()=>fingerprintedJarUrl('kotlin/test.jar',origin,'INVALID'));
});
