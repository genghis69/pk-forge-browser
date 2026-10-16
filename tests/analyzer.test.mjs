import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInfo,isGeneratedPath} from '../src/analyzer.mjs';
test('exclure les fichiers construits et choisir le manifeste original',()=>{
 const root='ELM327_Universal_OBD2_v4/';
 const source=root+'app/src/main/AndroidManifest.xml';
 const built=root+'app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml';
 const gradle=root+'app/build.gradle.kts', agp=root+'build.gradle.kts';
 const paths=[built,root+'app/build/outputs/apk/debug/app-debug.apk',source,gradle,agp,root+'gradle/wrapper/gradle-wrapper.properties',root+'settings.gradle.kts',root+'app/src/main/res/values/strings.xml',root+'app/build/intermediates/dex/debug/classes.dex',...Array.from({length:16},(_,i)=>root+'app/src/main/java/com/example/Source'+i+'.kt')];
 const texts={
  [built]:'<manifest package="fake.generated"/>',
  [source]:'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="ELM327 Universal OBD2"/></manifest>',
  [gradle]:'plugins { id("com.android.application") }\\nandroid { namespace = "com.meziane.elm327obd"; compileSdk = 36; defaultConfig { applicationId = "com.meziane.elm327obd"; minSdk = 26; targetSdk = 36; versionCode = 5; versionName = "4.0.1" }; compileOptions { targetCompatibility = JavaVersion.VERSION_17 }; kotlinOptions { jvmTarget = "17" }}\\ndependencies { implementation("androidx.core:core:1.13.1"); implementation("com.github.mik3y:usb-serial-for-android:3.11.0") }',
  [agp]:'plugins { id("com.android.application") version "8.13.2" apply false; id("org.jetbrains.kotlin.android") version "2.2.20" apply false }',
  [root+'settings.gradle.kts']:'maven("https://jitpack.io")',
  [root+'gradle/wrapper/gradle-wrapper.properties']:'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.0-bin.zip'
 };
 const p=projectInfo(paths,texts);
 assert.equal(p.manifestPath,source);
 assert.equal(p.name,'ELM327 Universal OBD2');
 assert.equal(p.packageName,'com.meziane.elm327obd');
 assert.equal(p.kotlin,16);
 assert.equal(p.agp,'8.13.2');
 assert.equal(p.kotlinPlugin,'2.2.20');
 assert.equal(p.gradle,'9.3.0');
 assert.equal(p.version,'4.0.1');
 assert.equal(p.versionCode,'5');
 assert.equal(p.sdk,'36');
 assert.equal(p.targetSdk,'36');
 assert.equal(p.minSdk,'26');
 assert.equal(p.javaTarget,'17');
 assert.equal(p.kotlinJvmTarget,'17');
 assert.equal(p.dependencies.length,2);
 assert.equal(p.prebuiltDex,0);
 assert.equal(p.ignoredGeneratedDex,1);
 assert.equal(p.compatible,false);
 assert.ok(p.ignoredGenerated>=3);
});
test('Google Pack accepte une structure de ressources simple sans code',()=>{
 const paths=['AndroidManifest.xml','res/values/strings.xml','res/raw/watchface.xml'];
 const p=projectInfo(paths,{'AndroidManifest.xml':'<manifest package="dev.example"><application android:hasCode="false"/></manifest>'});
 assert.equal(p.compatible,true);
 assert.equal(p.resources,2);
 assert.equal(p.java,0);
 assert.equal(p.kotlin,0);
});
test('un fichier Kotlin dans src/main reste une vraie source',()=>{
 assert.equal(isGeneratedPath('test/app/src/main/MainActivity.kt'),false);
 assert.equal(isGeneratedPath('test/app/build/tmp/kotlin-classes/debug/MainActivity.class'),true);
});

test('l’analyse complète retient toutes les sources Kotlin même au-delà des 30 aperçus',()=>{
 const root='MultipleModule/';
 const paths=[root+'app/src/main/AndroidManifest.xml',root+'app/build.gradle.kts',
  ...Array.from({length:44},(_,i)=>root+'app/src/main/kotlin/org/test/File'+i+'.kt')];
 const r=projectInfo(paths,{[paths[0]]:'<manifest/>'});
 assert.equal(r.kotlin,44);
 assert.equal(r.kotlinPaths.length,44);
 assert.equal(r.sourceSamples.length,30);
});
