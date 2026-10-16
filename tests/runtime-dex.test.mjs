import test from 'node:test';
import assert from 'node:assert/strict';
import {planRuntimeJars,dexFilename,checkRuntimeInputs} from '../src/runtime-dex.mjs';
const artifacts=[
 {kind:'platform',name:'android.jar'},
 {kind:'dependency',name:'androidx.core-core-1.13.1.jar',relative:'deps/x'},
 {kind:'dependency',name:'com.github.mik3y-usb-serial-for-android-3.11.0.jar',relative:'deps/y'},
 {kind:'dependency',name:'org.jetbrains.kotlin-kotlin-stdlib-2.2.10.jar',relative:'deps/z'},
 {kind:'dependency',name:'org.jetbrains.kotlinx-kotlinx-coroutines-core-jvm-1.6.4.jar',relative:'deps/c'},
 {kind:'dependency',name:'androidx.lifecycle-lifecycle-common-2.6.2.jar',relative:'deps/l'}
];
test('AndroidX, USB, coroutines included and duplicate Kotlin stdlib removed',()=>{
 const plan=planRuntimeJars(artifacts);
 assert.equal(plan.stdlib,'kotlin-stdlib-2.2.20.jar');
 assert.equal(plan.dependencies.length,4);
 assert.equal(plan.skipped.length,1);
 assert.ok(!plan.dependencies.some(x=>x.name.includes('kotlin-stdlib')));
 assert.equal(checkRuntimeInputs(plan,{}).apkReady,false);
});
test('Reject missing runtime dependency and missing Android platform',()=>{
 assert.throws(()=>planRuntimeJars(artifacts.slice(1)),/SDK 36/);
 assert.throws(()=>planRuntimeJars(artifacts.filter(a=>!a.name.includes('coroutines'))),/Coroutines/);
 assert.throws(()=>planRuntimeJars(artifacts.filter(a=>!a.name.includes('usb-serial'))),/USB Serial/);
});
test('DEX numbering supports multi-dex outputs without claiming APK',()=>{
 assert.equal(dexFilename(1),'classes.dex');
 assert.equal(dexFilename(2),'classes2.dex');
 assert.equal(dexFilename(40),'classes40.dex');
 assert.throws(()=>dexFilename(41));
});
test('Never count compiler JAR as a program input',()=>{
 const plan=planRuntimeJars(artifacts);
 assert.equal(checkRuntimeInputs(plan,{}).totalPrograms,plan.dependencies.length+2);
});
