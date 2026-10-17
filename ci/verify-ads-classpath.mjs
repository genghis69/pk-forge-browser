/**
 * Checks real Maven JARs exported by stageTrainManagerAdsLibraries.
 * This runs on the public SDK only; no uploaded Android project is sent to CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base='dist/toolchains/android/deps/trainmanager-ads-v1';
const index=JSON.parse(fs.readFileSync(path.join(base,'resolved.json'),'utf8'));
if(!Array.isArray(index.artifacts)||!Array.isArray(index.jarArtifacts)||
   index.artifacts.length<2||index.jarArtifacts.length<2)
 throw Error('Incomplete Maven SDK archive and classpath catalogs');
const seen=new Set(),classes=new Set();
for(const item of index.jarArtifacts){
 if(!/^[\w.-]+\.jar$/.test(item.name)||seen.has(item.name))
  throw Error('Invalid/duplicate ads JAR name: '+item.name);
 seen.add(item.name);
 const filename=path.join(base,'jars',item.name);
 const bytes=fs.readFileSync(filename);
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==item.size||sha256!==item.sha256)
  throw Error('Ads JAR integrity mismatch: '+item.name);
 execFileSync('unzip',['-tqq',filename],{stdio:'pipe'});
 const members=execFileSync('unzip',['-Z','-1',filename],{encoding:'utf8',maxBuffer:32*1024*1024});
 for(const member of members.split(/\r?\n/))if(member.endsWith('.class'))classes.add(member);
}
const required=[
 'com/applovin/mediation/ads/MaxRewardedAd.class',
 'com/applovin/sdk/AppLovinSdk.class',
 'com/applovin/sdk/AppLovinSdkInitializationConfiguration.class',
 'com/google/android/gms/ads/identifier/AdvertisingIdClient.class'
];
for(const name of required)if(!classes.has(name))
 throw Error('Required authentic Maven SDK class is missing: '+name);
for(const name of ['com.applovin:applovin-sdk',
                    'com.google.android.gms:play-services-ads-identifier']){
 if(!index.jarArtifacts.some(item=>item.group+':'+item.module===name))
  throw Error('Missing resolved Maven module: '+name);
}
if(process.argv.includes('--classpath')){
 for(const item of index.jarArtifacts)
  console.log(path.join(base,'jars',item.name));
}else{
 console.log('OK: '+index.jarArtifacts.length+' real Maven JARs, '+
  classes.size+' class entries and '+required.length+' required ad API types verified.');
}
