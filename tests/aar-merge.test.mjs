import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {validateAarMetadata,mergeAarManifests,collectAarExtraFiles} from '../src/aar-merge.mjs';
import {assertNoUnmergedAdsApk} from '../src/ads-dependencies.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const app='<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.example"><uses-permission android:name="android.permission.INTERNET"/><application android:allowBackup="false" android:label="Example"><activity android:name=".MainActivity" android:exported="true"/></application></manifest>';
const library=(name,body)=>({name,manifest:'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="'+name+'"><application>'+body+'</application></manifest>'});
const opts={applicationId:'dev.apkforge.example',minSdk:26,parser:DOMParser,serializer:XMLSerializer};
test('Les manifestes AAR ajoutent les vraies métadonnées, services et providers sans écraser l’app',()=>{
 const sdk=library('com.applovin.sdk','<meta-data android:name="applovin.sdk.key" android:value="key"/><provider android:name="com.applovin.Provider" android:authorities="${applicationId}.sdk"/>');
 const google=library('com.google.android.gms.ads.identifier','<service android:name="com.google.android.gms.Service" android:exported="false"/>');
 const m=mergeAarManifests(app,[sdk,google],opts);
 assert.equal(m.libraryCount,2);
 assert.deepEqual(m.packages,['com.applovin.sdk','com.google.android.gms.ads.identifier']);
 assert.match(m.manifest,/applovin\.sdk\.key/);
 assert.match(m.manifest,/dev\.apkforge\.example\.sdk/);
 assert.match(m.manifest,/com\.google\.android\.gms\.Service/);
 assert.match(m.manifest,/android:allowBackup="false"/);
 assert.match(m.manifest,/android\.permission\.INTERNET/);
});
test('Fusion AAR rejette les placeholders inconnus et les opérations tools:node dangereuses',()=>{
 assert.throws(()=>mergeAarManifests(app,[library('dev.lib','<provider android:name="Lib" android:authorities="${secret}"/>')],opts),/placeholders/);
 const withTools={name:'app.aar',manifest:'<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools" package="dev.lib"><application><service android:name="S" tools:node="remove"/></application></manifest>'};
 assert.throws(()=>mergeAarManifests(app,[withTools],opts),/tools:node/);
});
test('Le catalogue AAR doit annoncer 2+ archives réelles avec SHA256 et sans doublons',()=>{
 const a={name:'a',file:'com.applovin-sdk.aar',relative:'deps/trainmanager-ads-v1/archives/com.applovin-sdk.aar',size:1234,sha256:'a'.repeat(64)};
 assert.equal(validateAarMetadata({aarArtifacts:[a,{...a,file:'google-ads.aar',relative:'deps/trainmanager-ads-v1/archives/google-ads.aar'}]}),true);
 assert.throws(()=>validateAarMetadata({aarArtifacts:[a,a]}),/non vérifiable/);
 assert.throws(()=>validateAarMetadata({aarArtifacts:[a,{...a,file:'x.aar',relative:'../x.aar'}]}),/non vérifiable/);
});
test('Les assets/JNI AAR sont conservés, toute collision divergente est bloquée',()=>{
 const data=new Uint8Array([1,2,3]);
 const libs=[{additional:[{path:'assets/a.txt',data}]},{additional:[{path:'assets/a.txt',data:new Uint8Array(data)}]}];
 assert.equal(collectAarExtraFiles(libs).length,1);
 assert.throws(()=>collectAarExtraFiles([...libs,{additional:[{path:'assets/a.txt',data:new Uint8Array([7])}]}]),/même emplacement/);
});
test('Les SDK publicitaires restent bloqués tant que R et AAPT2 ne sont pas complets',()=>{
 const a={dependencies:['com.applovin:applovin-sdk:+']};
 assert.throws(()=>assertNoUnmergedAdsApk(a),/refusé/);
 const complete={engine:'aapt2-wasm',aarState:{aarReady:true,aarRCompiled:true,libs:[{},{}],packages:['com.lib'],extraFiles:[]}};
 assert.equal(assertNoUnmergedAdsApk(a,complete),true);
 assert.throws(()=>assertNoUnmergedAdsApk(a,{...complete,aarState:{...complete.aarState,aarRCompiled:false}}),/refusé/);
});
