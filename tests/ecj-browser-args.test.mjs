import test from 'node:test';
import assert from 'node:assert/strict';
import {ecjAndroidArguments} from '../src/ecj-browser-args.mjs';

const androidJar='/str/android.jar';
const args=()=>ecjAndroidArguments({
 androidJar,classpath:[androidJar,'/str/com.applovin-sdk.jar'],
 outputDir:'/files/apkforge-java/compile-1',
 sources:['/str/MainActivity.java','/str/RewardedAds.java','/str/R.java','/str/BuildConfig.java']
});
test('ECJ reste en Java 17 et ne parcourt jamais les modules /lt/17 de CheerpJ',()=>{
 const argv=args();
 assert.equal(argv[0],'-17');
 assert.deepEqual(argv.slice(2,4),['--system','none']);
 assert.equal(argv.includes('-bootclasspath'),false);
 assert.equal(argv.includes('--release'),false);
 assert.ok(!argv.join(' ').includes('/lt/17'));
 assert.ok(argv.includes('/str/BuildConfig.java'));
 assert.ok(argv.includes('/str/R.java'));
 assert.ok(argv.includes('-proc:none'));
 assert.ok(argv.includes('UTF-8'));
});
test('ECJ doit utiliser exclusivement le vrai SDK Android vérifié',()=>{
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
