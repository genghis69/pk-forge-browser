import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root='dist/toolchains/android';
const sdk=path.join(root,'sdk/36/android.jar');
const deps=path.join(root,'deps/elm327-v1/jars');
const checksum=p=>{
 const bytes=fs.readFileSync(p);
 return {size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}
};
if(!fs.existsSync(sdk)||fs.statSync(sdk).size<1e6)throw Error('Android 36 android.jar missing');
const libs=fs.readdirSync(deps).filter(n=>n.endsWith('.jar')).sort();
if(!libs.some(n=>n.includes('usb-serial-for-android')))throw Error('USB Serial unresolved');
if(!libs.some(n=>n.includes('androidx.core')))throw Error('AndroidX Core unresolved');
const javaPath=path.join(root,'java/ecj/3.43.0/ecj.jar');
if(!fs.existsSync(javaPath)||fs.statSync(javaPath).size<1e6)throw Error('Eclipse ECJ Java compiler JAR is missing');
const helperPath=path.join(root,'helpers/1/classes-tool.jar');
if(!fs.existsSync(helperPath))throw Error('CheerpJ classes tool jar is missing');
const artifacts=[{name:'classes-tool.jar',relative:'helpers/1/classes-tool.jar',kind:'tool',...checksum(helperPath)},
 {name:'android.jar',relative:'sdk/36/android.jar',kind:'platform',...checksum(sdk)},
 ...libs.map(name=>({name,relative:'deps/elm327-v1/jars/'+name,kind:'dependency',...checksum(path.join(deps,name))}))
];
const adsCatalogPath=path.join(root,'deps/trainmanager-ads-v1/resolved.json');
if(!fs.existsSync(adsCatalogPath))throw Error('TrainManager ads Maven catalog missing');
const adsResolved=JSON.parse(fs.readFileSync(adsCatalogPath,'utf8'));
if(!Array.isArray(adsResolved.artifacts)||adsResolved.artifacts.length<2)
 throw Error('TrainManager ads dependencies unresolved');
if(!Array.isArray(adsResolved.jarArtifacts)||adsResolved.jarArtifacts.length<2)
 throw Error('Authentic AppLovin / Google Ads JVM classpath missing');
const jarArtifacts=adsResolved.jarArtifacts.map(jar=>{
 if(!/^[A-Za-z0-9_.-]+\.jar$/.test(jar.name)||
    !jar.group||!jar.module||!jar.version)
  throw Error('Invalid ads JAR metadata: '+jar.name);
 const relative='deps/trainmanager-ads-v1/jars/'+jar.name;
 const file=path.join(root,relative);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())
  throw Error('Published ad SDK JAR missing: '+relative);
 const actual=checksum(file);
 if(actual.size!==jar.size||actual.sha256!==jar.sha256)
  throw Error('Ad SDK JAR SHA256 mismatch: '+relative);
 return {...jar,relative};
});
const trainManagerAds={
  requested:adsResolved.requested,
  selectedAppLovin:adsResolved.artifacts.find(a=>a.group==='com.applovin'&&a.name==='applovin-sdk')?.version,
  artifacts:adsResolved.artifacts.length,
  aars:adsResolved.artifacts.filter(a=>a.extension==='aar').length,
  aarResources:adsResolved.artifacts.reduce((n,a)=>n+(a.resourceCount||0),0),
  aarNative:adsResolved.artifacts.reduce((n,a)=>n+(a.nativeCount||0),0),
  aarAssets:adsResolved.artifacts.reduce((n,a)=>n+(a.assetsCount||0),0),
  jarArtifacts,
  // Public SDK binaries are downloaded and hashed, but an APK also needs
  // Android library manifest/resource/asset merging and library R.java.
  manifestResourceMergeSupported:false
};
const result={format:2,compileSdk:36,profile:'elm327-v1',trainManagerAds,
 javaCompiler:{name:'ecj.jar',relative:'java/ecj/3.43.0/ecj.jar',version:'3.43.0',entryPoint:'org.eclipse.jdt.internal.compiler.batch.Main',...checksum(javaPath)},
 requiredCoordinates:['androidx.core:core:1.13.1','com.github.mik3y:usb-serial-for-android:3.11.0'],
 artifacts,apkReady:false,
 scope:'compile-only classpath, R is a temporary diagnostic stub; resources not linked into an APK'};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(result,null,2));
console.log('Android SDK 36 + '+libs.length+' compile dependencies, '+(artifacts.reduce((sum,a)=>sum+a.size,0)/1048576).toFixed(1)+' MiB');
