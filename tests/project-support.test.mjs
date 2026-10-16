import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAndroidProject} from '../src/project-support.mjs';
const base={manifestPath:'app/src/main/AndroidManifest.xml',kotlin:0,java:0,
 resources:4,aarFiles:0,nativeLibs:0,manifestHasCodeFalse:false,compatible:false,
 kotlinPlugin:'Non précisé',sdk:'Non précisé'};
test('Un projet Java seul utilise le profil Java expérimental',()=>{
 const v=classifyAndroidProject({...base,java:2,javaPaths:[
  'app/src/main/java/a/MainActivity.java','app/src/main/java/a/Util.java'
 ],namespace:'a.example',sdk:'35',minSdk:'23'});
 assert.equal(v.mode,'java');
 assert.match(v.reason,/ECJ Java/);
});
test('Un projet Java/Kotlin mixte est expliqué précisément',()=>{
 const v=classifyAndroidProject({...base,java:2,kotlin:3});
 assert.equal(v.mode,'unsupported');assert.match(v.reason,/mixte/);
});
test('Une application sans code prise en charge utilise la voie ressources',()=>{
 const v=classifyAndroidProject({...base,manifestHasCodeFalse:true,compatible:true});
 assert.equal(v.mode,'resources');
});
test('Un ZIP sans sources ni hasCode=false est refusé sans modifier son manifeste',()=>{
 const v=classifyAndroidProject(base);
 assert.equal(v.mode,'unsupported');assert.match(v.reason,/hasCode/);
});
test('Un projet Kotlin compatible entre dans le pipeline réel',()=>{
 const v=classifyAndroidProject({...base,kotlin:2,kotlinPaths:[
  'MyApp/app/src/main/java/com/a/Main.kt','MyApp/app/src/main/kotlin/com/a/Extra.kt'
 ],kotlinPlugin:'2.2.20',sdk:'36'});
 assert.equal(v.mode,'kotlin');
});
test('Un Kotlin 2.0 ancien reçoit une cause précise',()=>{
 const v=classifyAndroidProject({...base,kotlin:1,kotlinPaths:['app/src/main/java/X.kt'],kotlinPlugin:'2.0.20',sdk:'36'});
 assert.equal(v.mode,'unsupported');assert.match(v.reason,/2.0.20/);
});
test('Sources Kotlin hors du module application identifiées',()=>{
 const v=classifyAndroidProject({...base,kotlin:1,kotlinPaths:['sources/Main.kt'],kotlinPlugin:'2.2.20',sdk:'36'});
 assert.equal(v.mode,'unsupported');assert.match(v.reason,/src\/main/);
});
test('Ressources natives et AAR exclues, sans APK fictif',()=>{
 assert.match(classifyAndroidProject({...base,nativeLibs:1}).reason,/natives/);
 assert.match(classifyAndroidProject({...base,aarFiles:2}).reason,/aar/);
});
