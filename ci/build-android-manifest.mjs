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
const artifacts=[
 {name:'android.jar',relative:'sdk/36/android.jar',kind:'platform',...checksum(sdk)},
 ...libs.map(name=>({name,relative:'deps/elm327-v1/jars/'+name,kind:'dependency',...checksum(path.join(deps,name))}))
];
const result={format:1,compileSdk:36,profile:'elm327-v1',
 requiredCoordinates:['androidx.core:core:1.13.1','com.github.mik3y:usb-serial-for-android:3.11.0'],
 artifacts,apkReady:false,
 scope:'compile-only classpath, R is a temporary diagnostic stub; resources not linked into an APK'};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(result,null,2));
console.log('Android SDK 36 + '+libs.length+' compile dependencies, '+(artifacts.reduce((sum,a)=>sum+a.size,0)/1048576).toFixed(1)+' MiB');
