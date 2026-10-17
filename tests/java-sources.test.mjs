import test from 'node:test';
import assert from 'node:assert/strict';
import {javaCompileProfile,realJavaR,javaSourcePaths} from '../src/java-sources.mjs';
const base={java:2,kotlin:0,namespace:'fr.local.trainmanagersession',packageName:'fr.local.trainmanagersession',
 sdk:'35',minSdk:'23',dependencies:[],unresolvedDependencies:[],
 javaPaths:['TrainManager/app/src/main/java/fr/local/trainmanagersession/MainActivity.java',
 'TrainManager/app/src/main/java/fr/local/trainmanagersession/RewardedAds.java']};
const catalog={artifacts:[{name:'android.jar'}],requiredCoordinates:[],
 javaCompiler:{relative:'java/ecj/3.43.0/ecj.jar',sha256:'a'.repeat(64)}};
test('Les fichiers Java de production sont retenus, pas les tests',()=>{
 assert.equal(javaCompileProfile(base,catalog).paths.length,2);
 assert.equal(javaCompileProfile(base,catalog).minSdk,23);
});
test('Une dépendance de publicité non installée empêche le faux APK',()=>{
 assert.throws(()=>javaCompileProfile({...base,dependencies:['com.google.android.gms:play-services-ads:23.6.0']},catalog),/play-services-ads/);
});
test('Un namespace manquant est rejeté',()=>{
 assert.throws(()=>realJavaR('Non précisé',{'string/app_name':0x7f010001}),/Namespace/);
});
test('R.java contient les identifiants et tableaux styleable authentiques',()=>{
 const code=realJavaR('fr.local.trainmanagersession',{'layout/activity_main':0x7f020001,'id/title':0x7f080003,
  'styleable/Foo':[0x7f010001],'styleable/Foo_bar':0});
 assert.match(code,/public static final int title = 0x7f080003/);
 assert.match(code,/public static final int\[\] Foo = new int\[\]\{0x7f010001\}/);
 assert.match(code,/public static final int Foo_bar = 0/);
});
test('Le compilateur Java doit exclure les sources Kotlin et les classes hors module',()=>{
 assert.throws(()=>javaCompileProfile({...base,kotlin:1},catalog),/mixte/);
 assert.deepEqual(javaSourcePaths(base),base.javaPaths);
});

test('TrainManager : échoue si les vraies classes Maven ne sont pas publiées',()=>{
 const analysis={...base,dependencies:['com.applovin:applovin-sdk:+','com.google.android.gms:play-services-ads-identifier:18.2.0']};
 const sdk={...catalog,trainManagerAds:{selectedAppLovin:'13.6.4',artifacts:27,aars:21,aarResources:503,manifestResourceMergeSupported:false}};
 assert.throws(()=>javaCompileProfile(analysis,sdk),/JAR issus des AAR Maven/);
});
test('TrainManager : vrais SDK autorisés pour ECJ, APK strictement suspendu',()=>{
 const analysis={...base,dependencies:['com.applovin:applovin-sdk:+','com.google.android.gms:play-services-ads-identifier:18.2.0']};
 const make=(group,module,name)=>({group,module,name,version:group==='com.applovin'?'13.6.4':'18.2.0',
  relative:'deps/trainmanager-ads-v1/jars/'+name,size:1000,sha256:'a'.repeat(64)});
 const sdk={...catalog,trainManagerAds:{selectedAppLovin:'13.6.4',aars:21,aarResources:503,
  manifestResourceMergeSupported:false,jarArtifacts:[
   make('com.applovin','applovin-sdk','com.applovin-applovin-sdk-13.6.4-classes.jar'),
   make('com.google.android.gms','play-services-ads-identifier','com.google.android.gms-play-services-ads-identifier-18.2.0-classes.jar')
  ]}};
 const profile=javaCompileProfile(analysis,sdk);
 assert.equal(profile.adsClasspath.length,2);
 assert.match(profile.apkBlockedReason,/APK suspendu/);
 assert.equal(profile.paths.length,2);
});
