/**
 * End-to-end integration of the REAL Emscripten AAPT2 module.
 * Generates inputs in memory. No prebuilt APK/DEX is read.
 * Requires Android's official SDK platform android.jar.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseAapt2Symbols,runAapt2} from '../src/aapt2-wasm.mjs';

const js=path.resolve(process.argv[2]||'');
const sdk=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node ci/verify-aapt2-wasm-resources.mjs aapt2.js android.jar');
const bytes=new Uint8Array(await fs.readFile(sdk));
if(bytes.length<1_000_000)throw Error('Official Android SDK platform jar is missing');
const {default:factory}=await import(pathToFileURL(js).href);
const module=await factory({locateFile:name=>path.join(path.dirname(js),name)});
if(!module.FS||typeof module.callMain!=='function')throw Error('Not an executable AAPT2 WASM module');
const mem=module.FS;
mem.mkdir('/apkforge-proof');
mem.mkdir('/apkforge-proof/res');
for(const dir of ['values','layout','drawable'])mem.mkdir('/apkforge-proof/res/'+dir);
mem.writeFile('/apkforge-proof/android.jar',bytes);
mem.writeFile('/apkforge-proof/AndroidManifest.xml',new TextEncoder().encode(
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.webproof">'+
  '<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/>'+
  '<application android:label="@string/app_name" android:theme="@style/AppTheme" android:hasCode="true"/></manifest>'));
mem.writeFile('/apkforge-proof/res/values/strings.xml',new TextEncoder().encode(
  '<resources><string name="app_name">WASM AAPT2 real compiler</string></resources>'));
mem.writeFile('/apkforge-proof/res/values/themes.xml',new TextEncoder().encode(
  '<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"/></resources>'));
mem.writeFile('/apkforge-proof/res/layout/activity_main.xml',new TextEncoder().encode(
  '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent">'+
  '<TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="@string/app_name"/></LinearLayout>'));
mem.writeFile('/apkforge-proof/res/drawable/bg_panel.xml',new TextEncoder().encode(
  '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#112233"/></shape>'));

runAapt2(module,['compile','--dir','/apkforge-proof/res','-o','/apkforge-proof/compiled.zip']);
const intermediate=mem.readFile('/apkforge-proof/compiled.zip');
if(intermediate[0]!==80||intermediate[1]!==75)throw Error('Real AAPT2 compile did not generate ZIP of .flat resources');
runAapt2(module,['link','-o','/apkforge-proof/linked.apk',
 '-I','/apkforge-proof/android.jar','--manifest','/apkforge-proof/AndroidManifest.xml',
 '--output-text-symbols','/apkforge-proof/R.txt','--auto-add-overlay',
 '-R','/apkforge-proof/compiled.zip']);
const linked=mem.readFile('/apkforge-proof/linked.apk');
if(linked.length<500||linked[0]!==80||linked[1]!==75)throw Error('Real AAPT2 link did not generate APK resources');
const rtxt=new TextDecoder().decode(mem.readFile('/apkforge-proof/R.txt'));
const ids=parseAapt2Symbols(rtxt);
for(const sym of ['string/app_name','style/AppTheme','layout/activity_main','drawable/bg_panel','id/title']){
 if(!Number.isInteger(ids[sym]))throw Error('Real AAPT2 lacks generated resource '+sym);
}
console.log('PASS actual WASM AAPT2 compile/link; '+linked.length+' bytes, '+Object.keys(ids).length+' resource symbols.');
