/**
 * AAPT2 reference fixture for CI only. Never uses user ZIP files.
 * The official native AAPT2 runs on the runner, then APK Forge WASM signs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parseAapt2Symbols} from '../src/aapt2-wasm.mjs';
const root='ci/build/aapt2-src';
const write=(name,data)=>{
 const full=path.join(root,name);
 fs.mkdirSync(path.dirname(full),{recursive:true});
 fs.writeFileSync(full,data);
};
if(process.argv.includes('--prepare')){
 write('AndroidManifest.xml','<?xml version="1.0" encoding="utf-8"?>\n'+
 '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.browser.proof" android:versionCode="1" android:versionName="1.0">'+
 '<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/>'+
 '<application android:label="@string/app_name" android:hasCode="true" android:theme="@style/AppTheme">'+
 '<activity android:name=".MainActivity" android:exported="true">'+
 '<intent-filter><action android:name="android.intent.action.MAIN"/>'+
 '<category android:name="android.intent.category.LAUNCHER"/></intent-filter>'+
 '</activity></application></manifest>');
 write('res/values/strings.xml','<resources><string name="app_name">APK Forge AAPT2 Reference</string></resources>');
 write('res/values/styles.xml','<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"/></resources>');
 write('res/layout/activity_main.xml',
 '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:orientation="vertical" android:layout_width="match_parent" android:layout_height="match_parent">'+
 '<TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="@string/app_name"/></LinearLayout>');
 write('res/drawable/panel.xml','<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#112233"/></shape>');
 fs.mkdirSync('ci/build',{recursive:true});
 console.log('Synthetic AAPT2 resource fixture: layout, style, ID and XML drawable.');
}else if(process.argv.includes('--verify')){
 const txt=fs.readFileSync('ci/build/aapt2-R.txt','utf8');
 const ids=parseAapt2Symbols(txt);
 for(const symbol of ['string/app_name','style/AppTheme','layout/activity_main','drawable/panel','id/title']){
  if(!Number.isInteger(ids[symbol]))throw Error('AAPT2 did not link '+symbol);
 }
 const bytes=fs.readFileSync('ci/build/aapt2-linked.apk');
 if(bytes.length<300||bytes[0]!==0x50||bytes[1]!==0x4b)
  throw Error('AAPT2 did not create a linked resource APK.');
 console.log('Native AAPT2 link:',bytes.length,'bytes; verified IDs:',JSON.stringify(ids));
}else throw Error('Expected --prepare or --verify.');
