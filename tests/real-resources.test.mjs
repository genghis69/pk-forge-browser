import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resourceBlockers,linkedRCode,normalizedManifest} from '../src/real-resources.mjs';
test('ELM327 layouts, XML drawable and styles are not silently treated as AAPT2 output',()=>{
 const errs=resourceBlockers({resourcePaths:[
 'ELM327/app/src/main/res/layout/activity_main.xml',
 'ELM327/app/src/main/res/drawable/bg_field.xml',
 'ELM327/app/src/main/res/values/themes.xml',
 'ELM327/app/src/main/res/values/colors.xml',
 'ELM327/app/src/main/res/values/strings.xml',
 ],manifest:'<manifest><application android:theme="@style/AppTheme"/></manifest>',sourceTexts:['setContentView(R.layout.activity_main); findViewById(R.id.thing)']});
 assert.ok(errs.some(x=>x.includes('activity_main')));
 assert.ok(errs.some(x=>x.includes('themes.xml')));
 assert.ok(errs.some(x=>x.includes('AAPT2')));
});
test('Real R.kt uses assigned IDs, never sequential guessed placeholders',()=>{
 const code=linkedRCode('dev.example.app',{'string/app_name':0x7f030004,'drawable/logo':0x7f020002},['val n=R.string.app_name']);
 assert.match(code,/0x7f030004/);
 assert.match(code,/0x7f020002/);
 assert.throws(()=>linkedRCode('dev.example.app',{'string/app_name':0x7f030004},['R.layout.activity_main']),/absents/);
});
test('Gradle package, min/target SDK and version are embedded in the clean XML',()=>{
 const xml='<?xml version="1.0"?><manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Hello"/></manifest>';
 const out=normalizedManifest(xml,{packageName:'dev.example.app',minSdk:'26',targetSdk:'36',versionCode:'5',version:'4.0.1'});
 assert.match(out,/package="dev.example.app"/);
 assert.match(out,/android:versionCode="5"/);
 assert.match(out,/android:versionName="4.0.1"/);
 assert.match(out,/android:minSdkVersion="26"/);
 assert.match(out,/android:targetSdkVersion="36"/);
});
test('Compatible resource subset excludes unsupported theme, layout and qualifiers',()=>{
 const errs=resourceBlockers({resourcePaths:['x/app/src/main/res/values/strings.xml','x/app/src/main/res/drawable/logo.png','x/app/src/main/res/xml/wear.xml'],
 manifest:'<manifest><application android:label="@string/app_name"/></manifest>',sourceTexts:['R.string.app_name']});
 assert.deepEqual(errs,[]);
});

test('Bouton final contrôlé par la provenance exacte du ZIP et du R',()=>{
 const source=readFileSync('src/real-resources.mjs','utf8');
 assert.match(source,/export function refreshApkButton/);
 assert.match(source,/artifact\?\.linkedResourceSession===session/);
});
