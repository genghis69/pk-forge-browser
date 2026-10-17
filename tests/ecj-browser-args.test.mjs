import test from 'node:test';
import assert from 'node:assert/strict';
import {ecjAndroidArguments} from '../src/ecj-browser-args.mjs';

const androidJar='/str/android.jar';
const args=()=>ecjAndroidArguments({
 androidJar,classpath:[androidJar,'/str/com.applovin-sdk.jar'],
 outputDir:'/files/apkforge-java/compile-1',
 sources:['/str/MainActivity.java','/str/RewardedAds.java','/str/R.java','/str/BuildConfig.java']
});
test('Le pont API ECJ reçoit les classes sans scanner le JDK virtuel /lt/17',()=>{
 const argv=args();
 assert.equal(argv[0],'/files/apkforge-java/compile-1');
 assert.equal(argv[1],'/str/android.jar:/str/com.applovin-sdk.jar');
 assert.deepEqual(argv.slice(2),['/str/MainActivity.java','/str/RewardedAds.java','/str/R.java','/str/BuildConfig.java']);
 assert.ok(!argv.join(' ').includes('/lt/17'));
 assert.ok(!argv.includes('--system'));
 assert.ok(!argv.includes('-bootclasspath'));
});
test('Le pont ECJ exige le vrai SDK Android et interdit les sources absentes',()=>{
 assert.throws(()=>ecjAndroidArguments({
  androidJar,classpath:['/str/another.jar'],outputDir:'/files/out',sources:['/str/A.java']
 }),/android.jar/);
 assert.throws(()=>ecjAndroidArguments({
  androidJar,classpath:['/str/android.jar','/str/../../evil.jar'],
  outputDir:'/files/out',sources:['/str/A.java']
 }),/classpath Java/);
 assert.throws(()=>ecjAndroidArguments({
  androidJar,classpath:[androidJar],outputDir:'/files/out',sources:[]
 }),/fichiers Java/);
});
