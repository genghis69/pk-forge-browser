import test from 'node:test';
import assert from 'node:assert/strict';
import {planAdsRuntimeDex} from '../src/ads-runtime-dex.mjs';

const base={language:'java',minSdk:26,appJar:'/files/apkforge-java/app.jar',androidJar:'/str/android.jar',
 adsClasspath:[
  {group:'com.applovin',module:'applovin-sdk',name:'app.jar',path:'/str/applovin.jar'},
  {group:'com.google.android.gms',module:'play-services-ads-identifier',name:'google.jar',path:'/str/google.jar'}
 ]};
test('D8 reçoit le bytecode du projet et les vrais JAR publicitaires, jamais les classes du JDK',()=>{
 const result=planAdsRuntimeDex(base);
 assert.deepEqual(result.programJars,['/files/apkforge-java/app.jar','/str/applovin.jar','/str/google.jar']);
 assert.equal(result.libraryJar,'/str/android.jar');
 assert.equal(result.apkReady,false);
 assert.equal(result.dependencyCount,2);
 assert.ok(!result.programJars.some(x=>x.includes('java-base-compile')));
});
test('D8 publicitaire refuse catalogues partiels et doublons',()=>{
 assert.throws(()=>planAdsRuntimeDex({...base,adsClasspath:[base.adsClasspath[0]]}),/absentes/);
 assert.throws(()=>planAdsRuntimeDex({...base,adsClasspath:[base.adsClasspath[0],base.adsClasspath[0]]}),/dupliquée/);
 assert.throws(()=>planAdsRuntimeDex({...base,minSdk:20}),/minSdk/);
 assert.throws(()=>planAdsRuntimeDex({...base,language:'kotlin'}),/Java/);
});
