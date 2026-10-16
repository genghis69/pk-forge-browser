/**
 * Vérification bout-en-bout de l'adaptateur navigateur sur le VRAI binaire
 * AAPT2 WebAssembly. Aucun mock de FS ou de compilateur.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {compileAapt2Wasm} from '../src/aapt2-wasm.mjs';
const [moduleName,sdkName]=process.argv.slice(2);
if(!moduleName||!sdkName)
 throw Error('Utilisation : node ci/verify-aapt2-browser-adapter.mjs aapt2.js android.jar');
const js=path.resolve(moduleName);
const sdk=new Uint8Array(await fs.readFile(path.resolve(sdkName)));
if(sdk.length<1_000_000)throw Error('android.jar manquant');
const {default:factory}=await import(pathToFileURL(js).href);
const runtime=await factory({locateFile:name=>path.join(path.dirname(js),name)});
if(typeof runtime.FS?.mkdirTree!=='function')
 throw Error('Véritable AAPT2 doit exposer FS.mkdirTree');
const contents={
 'src/main/res/values/strings.xml':'<resources><string name="app_name">APK Forge</string></resources>',
 'src/main/res/values/themes.xml':'<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"/></resources>',
 'src/main/res/layout/activity_main.xml':'<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent"><TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="@string/app_name"/></LinearLayout>',
 'src/main/res/drawable/bg_panel.xml':'<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#112233"/></shape>'
};
const project={files:Object.fromEntries(Object.entries(contents).map(([name,value])=>[
 name,{async:async format=>{
  if(format!=='uint8array')throw Error('Format de fichier non pris en charge : '+format);
  return new TextEncoder().encode(value);
 }}
]))};
const manifest='<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.webproof"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:label="@string/app_name" android:theme="@style/AppTheme"/></manifest>';
const result=await compileAapt2Wasm({
 project,manifest,resourcePaths:Object.keys(contents),
 moduleFactory:async()=>runtime,
 fetchFn:async()=>({ok:true,arrayBuffer:async()=>sdk.buffer.slice(sdk.byteOffset,sdk.byteOffset+sdk.byteLength)})
});
for(const name of ['string/app_name','style/AppTheme','layout/activity_main','drawable/bg_panel','id/title']){
 if(!Number.isInteger(result?.ids?.[name]))throw Error('Symbole AAPT2 manquant : '+name);
}
if(result.apk.length<500||result.apk[0]!==80||result.apk[1]!==75)
 throw Error('Archive AAPT2 incorrecte dans l’adaptateur navigateur');
console.log('PASS AAPT2 browser adapter : '+Object.keys(result.ids).length+' IDs, '+result.apk.length+' octets ; EEXIST corrigé.');
