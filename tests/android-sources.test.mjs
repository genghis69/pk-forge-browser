import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProfile,generateCompileOnlyR,buildDiagnostic} from '../src/android-sources.mjs';
const root='ELM327_Universal_OBD2_v4';
const paths=Array.from({length:16},(_,i)=>root+'/app/src/main/java/com/meziane/elm327obd/obd/File'+i+'.kt');
const dependencies=['androidx.core:core:1.13.1','com.github.mik3y:usb-serial-for-android:3.11.0'];
const data={analysis:{kotlinPlugin:'2.2.20',sdk:'36',java:0,kotlin:16,sourceSamples:paths,namespace:'com.meziane.elm327obd',dependencies}};
const catalog={compileSdk:36,artifacts:[{name:'android.jar'}],requiredCoordinates:dependencies};
test('16 original Kotlin sources selected together',()=>{
 const out=compileProfile(data,catalog);assert.equal(out.paths.length,16);assert.equal(out.namespace,'com.meziane.elm327obd');
});
test('rejects unknown deps and partial Kotlin source sets',()=>{
 assert.throws(()=>compileProfile({...data,analysis:{...data.analysis,kotlin:15}},catalog),/partielle/);
 assert.throws(()=>compileProfile({...data,analysis:{...data.analysis,dependencies:['unsupported:artifact:1']}},catalog),/non préparées/);
});
test('R.kt compile placeholders based only on actual XML',()=>{
 const out=generateCompileOnlyR({namespace:'com.meziane.elm327obd',resourceFiles:[
  {path:root+'/app/src/main/res/layout/activity_main.xml',text:'<Button android:id="@+id/btnScanVehicle"/>'},
  {path:root+'/app/src/main/res/values/strings.xml',text:'<string name="app_name">ELM</string>'}
 ],sourceTexts:['findViewById(R.id.btnScanVehicle); setContentView(R.layout.activity_main)']});
 assert.match(out.code,/const val btnScanVehicle/);assert.equal(out.symbolCount,3);assert.equal(out.sourceRefs,2);
});
test('R.kt does not invent undeclared symbols',()=>{
 assert.throws(()=>generateCompileOnlyR({namespace:'com.x',resourceFiles:[],sourceTexts:['R.id.missing']}),/absentes/);
});
test('DEX proof does not imply installable APK',()=>{assert.equal(buildDiagnostic(16,31,true).apkReady,false);});
