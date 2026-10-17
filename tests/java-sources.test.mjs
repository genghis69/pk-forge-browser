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

test('Signale la fusion AAR encore nécessaire, sans prétendre que le SDK est absent',()=>{
 const analysis={...base,dependencies:['com.applovin:applovin-sdk:+','com.google.android.gms:play-services-ads-identifier:18.2.0']};
 const sdk={...catalog,trainManagerAds:{selectedAppLovin:'13.6.4',artifacts:27,aars:21,aarResources:503,manifestResourceMergeSupported:false}};
 assert.throws(()=>javaCompileProfile(analysis,sdk),/fusion des manifestes, ressources et R des AAR/);
});
