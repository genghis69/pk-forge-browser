import test from 'node:test';
import assert from 'node:assert/strict';
import {manifestStartupClasses,definedDexClasses,assertApkLaunchClasses} from '../src/apk-launch-check.mjs';
const pkg='com.meziane.elm327obd';
const manifest='<manifest><application android:name=".ElmApplication"><activity android:name=".MainActivity"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>';
const sampleDex=classes=>{
 const b=new Uint8Array(1024),v=new DataView(b.buffer);
 b.set(new TextEncoder().encode('dex\n035\0'));v.setUint32(0x20,b.length,true);
 const so=112,to=so+classes.length*4,co=to+classes.length*4,st=co+classes.length*32;
 for(const [a,z] of [[0x38,classes.length],[0x3c,so],[0x40,classes.length],[0x44,to],[0x60,classes.length],[0x64,co]])v.setUint32(a,z,true);
 let off=st;
 for(let i=0;i<classes.length;i++){v.setUint32(so+i*4,off,true);v.setUint32(to+i*4,i,true);v.setUint32(co+i*32,i,true);const s=classes[i];b[off++]=s.length;b.set(new TextEncoder().encode(s),off);off+=s.length;b[off++]=0}
 return b;
};
test('Détecte la classe Android déclarée par le manifeste',()=>{
 assert.deepEqual(manifestStartupClasses(manifest,pkg),[{name:pkg+'.ElmApplication',kind:'Application'},{name:pkg+'.MainActivity',kind:'Activity de lancement'}]);
});
test('Vérifie la classe réelle dans les DEX multidex',()=>{
 const r=assertApkLaunchClasses({manifest,packageName:pkg,dexBuffers:[sampleDex(['Lcom/meziane/elm327obd/ElmApplication;']),sampleDex(['Lcom/meziane/elm327obd/MainActivity;'])]});
 assert.equal(r.classCount,2);
});
test('Bloque un APK qui lancerait une classe absente',()=>{
 assert.throws(()=>assertApkLaunchClasses({manifest,packageName:pkg,dexBuffers:[sampleDex(['Lcom/meziane/elm327obd/ElmApplication;'])]}),/MainActivity/);
});
test('Refuse android:hasCode=false pour une application Kotlin',()=>{
 assert.throws(()=>manifestStartupClasses(manifest.replace('<application ','<application android:hasCode="false" '),pkg),/hasCode=false/);
});
test('Rejette les tables de DEX corrompues',()=>{
 assert.throws(()=>definedDexClasses(new Uint8Array(150)),/DEX invalide/);
});
