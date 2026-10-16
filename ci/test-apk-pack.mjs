/**
 * Automated end-to-end smoke test for the WASM resource+DEX+signing pipeline.
 * This uses a SYNTHETIC app and CI-generated DEX, never user project artifacts.
 */
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import wasmInit,{apkforge_resource_ids,apkforge_sign_with_dex,apkforge_sign_linked_apk} from '../dist/wasm/pack/pack_wasm.js';
import {developmentPem,to64,from64} from '../src/crypto.mjs';
import {inspectSignedApk} from '../src/apk-structure.mjs';
import {verifyDexIntegrity} from '../src/dex-integrity.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const wasmBytes=fs.readFileSync('dist/wasm/pack/pack_wasm_bg.wasm');
await wasmInit(wasmBytes);
const manifest='<?xml version="1.0" encoding="utf-8"?>\n'+
 '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.browser.proof" android:versionCode="1" android:versionName="1.0">'+
 '<uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/>'+
 '<application android:label="@string/app_name" android:hasCode="true">'+
 '<activity android:name=".MainActivity" android:exported="true">'+
 '<intent-filter><action android:name="android.intent.action.MAIN"/>'+
 '<category android:name="android.intent.category.LAUNCHER"/></intent-filter>'+
 '</activity></application></manifest>';
const strings='<resources><string name="app_name">APK Forge Smoke</string></resources>';
const input={
 manifest_b64:to64(new TextEncoder().encode(manifest)),
 resources:[{subdirectory:'values',name:'strings.xml',contents_b64:to64(new TextEncoder().encode(strings))}],
 combined_pem_string:await developmentPem(),
 generate_aab:false
};
const rawIds=apkforge_resource_ids(input);
const ids=rawIds instanceof Map?Object.fromEntries(rawIds):rawIds;
if(!Number.isInteger(ids['string/app_name'])||ids['string/app_name']<0x7f010000)
 throw Error('The WASM linker did not return the real string/app_name R ID');
const dex=fs.readFileSync('ci/build/android-activity-dex/classes.dex');
if(dex.subarray(0,4).toString()!=='dex\n')throw Error('Synthetic input is not DEX');
await verifyDexIntegrity(new Uint8Array(dex));
const binary=from64(apkforge_sign_with_dex(input,[to64(dex)]));
if(binary.length<300||(binary[0]!==0x50||binary[1]!==0x4b))
 throw Error('Signed APK was not produced');
fs.mkdirSync('ci/build',{recursive:true});
inspectSignedApk(binary);
fs.writeFileSync('ci/build/apkforge-wasm-signed-proof.apk',binary);
const aapt2Linked=fs.readFileSync('ci/build/aapt2-linked.apk');
const linkedSigned=from64(apkforge_sign_linked_apk(to64(aapt2Linked),[to64(dex)],input.combined_pem_string));
if(linkedSigned.length<300||linkedSigned[0]!==0x50||linkedSigned[1]!==0x4b)
 throw Error('WASM could not sign a native AAPT2 linked resource APK.');
inspectSignedApk(linkedSigned);
fs.writeFileSync('ci/build/apkforge-aapt2-wasm-signed-proof.apk',linkedSigned);
console.log('Signed Google Pack APK:',binary.length,'bytes; real R.string.app_name:',ids['string/app_name'].toString(16));
console.log('Native AAPT2 resources + WASM DEX assembly/signing:',linkedSigned.length,'bytes');
