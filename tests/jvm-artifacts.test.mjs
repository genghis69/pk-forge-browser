import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mountJar,mountKotlinJars,mountD8,virtualJarPath} from '../src/jvm-artifacts.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://genghis69.github.io/pk-forge-browser/src/kotlin-lab.mjs';
const jar=new Uint8Array([80,75,3,4,1,2,3,4,5,6]);
test('JAR accessible dans /str/ avec GET complet sans HTTP Range',async()=>{
 const calls=[],mounts=[];
 const path=await mountJar({relative:'kotlin/2.2.20/jars/a.jar',filename:'a.jar',
  expectedSize:jar.length,moduleUrl:origin,
  fetchFn:async(url,options)=>{calls.push({url,options});return {ok:true,arrayBuffer:async()=>jar.buffer};},
  addFn:(...args)=>mounts.push(args)});
 assert.equal(path,'/str/a.jar');
 assert.equal(mounts[0][1][0],80);
 assert.equal(calls[0].options.method,'GET');
 assert.ok(!('Range' in calls[0].options));
 assert.match(calls[0].url.pathname,/pk-forge-browser\/toolchains\//);
});
test('Refuse un JAR HTML, une taille incorrecte et une empreinte incorrecte',async()=>{
 const fetchJar=async()=>({ok:true,arrayBuffer:async()=>jar.buffer});
 const bad=async name=>mountJar({relative:'kotlin/2.2.20/jars/'+name,filename:name,moduleUrl:origin,
  fetchFn:fetchJar,addFn:()=>{throw Error('Pas de montage');},sha256:'f'.repeat(64)});
 await assert.rejects(bad('hash-fail.jar'),/SHA-256/);
 await assert.rejects(()=>mountJar({relative:'kotlin/2.2.20/jars/size-fail.jar',filename:'size-fail.jar',moduleUrl:origin,
  expectedSize:100,fetchFn:fetchJar,addFn:()=>{}}),/Taille/);
 await assert.rejects(()=>mountJar({relative:'kotlin/2.2.20/jars/html-fail.jar',filename:'html-fail.jar',moduleUrl:origin,
  fetchFn:async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('<html>Not Found</html>').buffer}),addFn:()=>{}}),/non valide/);
});
test('Kotlin monte deux bibliothèques distinctes et vérifie leur SHA-256',async()=>{
 const files=[jar,new Uint8Array([80,75,3,4,8,9,10,11])];
 const names=['example1.jar','example2.jar'];
 const artifacts=await Promise.all(files.map(async(data,i)=>{
  const sum=new Uint8Array(await webcrypto.subtle.digest('SHA-256',data));
  return {filename:names[i],size:data.length,sha256:Array.from(sum,x=>x.toString(16).padStart(2,'0')).join('')};
 }));
 const mounted=[];
 const paths=await mountKotlinJars({jars:names,artifacts},origin,
  async u=>({ok:true,arrayBuffer:async()=>files[u.pathname.includes('example1')?0:1].buffer}),
  (p)=>mounted.push(p),()=>{});
 assert.deepEqual(paths,['/str/example1.jar','/str/example2.jar']);
 assert.deepEqual(mounted,paths);
});
test('D8 : chemin virtuel local sans requête Range',async()=>{
 const mounted=[];
 const p=await mountD8({d8Version:'8.13.17',d8Jar:'r8-8.13.17.jar',d8Size:jar.length},origin,
  async()=>({ok:true,arrayBuffer:async()=>jar.buffer}),(p)=>mounted.push(p),()=>{});
 assert.equal(p,'/str/r8-8.13.17.jar');
 assert.equal(mounted.length,1);
});
test('Interdire les JAR de traversée de chemin',()=>assert.throws(()=>virtualJarPath('../../evil.jar')));
