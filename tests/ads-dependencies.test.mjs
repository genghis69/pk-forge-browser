import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTrainManagerAds,TRAINMANAGER_ADS_COORDINATES,assertNoUnmergedAdsApk} from '../src/ads-dependencies.mjs';

const jar=(group,module,name)=>({
 group,module,version:group==='com.applovin'?'13.6.4':'18.2.0',
 name,relative:'deps/trainmanager-ads-v1/jars/'+name,size:10240,sha256:'a'.repeat(64)
});
const ads={selectedAppLovin:'13.6.4',aars:21,aarResources:503,
 jarArtifacts:[
  jar('com.applovin','applovin-sdk','com.applovin-applovin-sdk-13.6.4-classes.jar'),
  jar('com.google.android.gms','play-services-ads-identifier','com.google.android.gms-play-services-ads-identifier-18.2.0-classes.jar')
 ]};
const analysis={dependencies:[...TRAINMANAGER_ADS_COORDINATES]};
test('Dépendances publicitaires absentes : classpath inchangé',()=>{
 assert.deepEqual(resolveTrainManagerAds({dependencies:[]},{}),
  {requested:false,jars:[],apkReady:true,blockedReason:null});
});
test('Les vrais JAR indexés permettent ECJ mais jamais un APK incomplet',()=>{
 const profile=resolveTrainManagerAds(analysis,{trainManagerAds:ads});
 assert.equal(profile.jars.length,2);
 assert.equal(profile.apkReady,false);
 assert.match(profile.blockedReason,/fusion des manifestes, ressources/);
});
test('Refuse un catalogue incomplet ou des empreintes non vérifiables',()=>{
 assert.throws(()=>resolveTrainManagerAds(analysis,{}),/pas encore publiés/);
 assert.throws(()=>resolveTrainManagerAds(analysis,{trainManagerAds:{...ads,jarArtifacts:[]}}),/Aucun vrai/);
 assert.throws(()=>resolveTrainManagerAds(analysis,{trainManagerAds:{...ads,jarArtifacts:ads.jarArtifacts.slice(0,1)}}),/incomplet/);
 assert.throws(()=>resolveTrainManagerAds(analysis,{trainManagerAds:{...ads,jarArtifacts:[
  {...ads.jarArtifacts[0],sha256:'fake'},ads.jarArtifacts[1]]}}),/incorrect/);
 assert.throws(()=>resolveTrainManagerAds(analysis,{trainManagerAds:{...ads,jarArtifacts:[
  {...ads.jarArtifacts[0],relative:'../../escape.jar'},ads.jarArtifacts[1]]}}),/incorrect/);
 assert.throws(()=>resolveTrainManagerAds(analysis,{trainManagerAds:{...ads,jarArtifacts:[
  ads.jarArtifacts[0],ads.jarArtifacts[0],ads.jarArtifacts[1]]}}),/dupliquée/);
});
test('Refuse une dépendance publicitaire partielle',()=>{
 assert.throws(()=>resolveTrainManagerAds({dependencies:analysis.dependencies.slice(0,1)},
  {trainManagerAds:ads}),/partielles/);
});

test('L’assembleur refuse tout SDK Ads même en cas de DEX injectés',()=>{
 assert.throws(()=>assertNoUnmergedAdsApk(analysis),/APK publicitaire refusé/);
 assert.throws(()=>assertNoUnmergedAdsApk({dependencies:[TRAINMANAGER_ADS_COORDINATES[0]]}),/refusé/);
 assert.equal(assertNoUnmergedAdsApk({dependencies:[]}),true);
});
