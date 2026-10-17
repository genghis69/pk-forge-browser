/**
 * Real Maven AAR inspect/merge smoke test, using PUBLIC SDK dependencies only.
 * This never processes uploaded user projects or proprietary ad credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {mergeAarManifests} from '../src/aar-merge.mjs';

const base='dist/toolchains/android/deps/trainmanager-ads-v1';
const inventory=JSON.parse(fs.readFileSync(path.join(base,'resolved.json'),'utf8'));
const aars=inventory.artifacts.filter(x=>x.extension==='aar');
if(aars.length<2)throw Error('No authentic AAR library graph to inspect');
const libraries=aars.map(item=>{
 const input=path.join(base,'archives',item.file);
 const names=execFileSync('unzip',['-Z','-1',input],{encoding:'utf8',maxBuffer:12*1024*1024});
 if(!names.split(/\r?\n/).includes('AndroidManifest.xml'))
  throw Error('Original AAR missing AndroidManifest.xml: '+item.file);
 const manifest=execFileSync('unzip',['-p',input,'AndroidManifest.xml'],{encoding:'utf8',maxBuffer:2*1024*1024});
 if(!manifest.includes('<manifest'))throw Error('Binary or missing original AAR manifest: '+item.file);
 return {name:item.file,manifest};
});
const app='<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.ci.publicdemo"><uses-permission android:name="android.permission.INTERNET"/><application android:label="APK Forge AAR Smoke"><activity android:name=".Activity" android:exported="true"/></application></manifest>';
const result=mergeAarManifests(app,libraries,{
 applicationId:'dev.apkforge.ci.publicdemo',minSdk:26,
 parser:DOMParser,serializer:XMLSerializer
});
if(result.libraryCount!==aars.length)throw Error('Not all AAR manifests merged');
if(result.manifest.includes('${'))throw Error('Unresolved variable in merged Android manifest');
if(!result.manifest.includes('dev.apkforge.ci.publicdemo'))throw Error('ApplicationId changed');
const output='ci/build/aar-real-manifest.xml';
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,result.manifest);
console.log('Real Maven AAR manifests merged:',aars.length,
 'namespaces:',result.packages.length,
 'characters:',result.manifest.length);
console.log('Packages:',result.packages.join(', '));
