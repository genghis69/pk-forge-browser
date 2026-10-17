/**
 * Full public-Maven AAR resource proof using the ACTUAL AAPT2 WebAssembly
 * shipped to Chrome. No synthetic "AAPT2" implementation or uploaded project.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {compileAapt2Wasm} from '../src/aapt2-wasm.mjs';

const [jsFile,sdkFile]=process.argv.slice(2);
if(!jsFile||!sdkFile)throw Error('Expected real aapt2.js and android.jar paths');
const {default:factory}=await import(pathToFileURL(path.resolve(jsFile)).href);
const instance=await factory({locateFile:name=>path.join(path.dirname(path.resolve(jsFile)),name)});
const sdk=new Uint8Array(fs.readFileSync(sdkFile));
const index=JSON.parse(fs.readFileSync('dist/toolchains/android/deps/trainmanager-ads-v1/resolved.json','utf8'));
const libs=[];
for(const aar of index.artifacts.filter(x=>x.extension==='aar')){
 const filename='dist/toolchains/android/deps/trainmanager-ads-v1/archives/'+aar.file;
 if(!(aar.resourceCount>0)){libs.push({name:aar.file,resources:[]});continue;}
 const names=execFileSync('unzip',['-Z','-1',filename],{encoding:'utf8',maxBuffer:20*1024*1024})
  .split(/\r?\n/).filter(x=>x.startsWith('res/')&&!x.endsWith('/'));
 const resources=names.map(name=>({
  path:name,
  data:new Uint8Array(execFileSync('unzip',['-p',filename,name],{maxBuffer:16*1024*1024}))
 }));
 libs.push({name:aar.file,resources});
}
const p='ci/build/aapt2-src/res';
const paths=['values/strings.xml','values/styles.xml','layout/activity_main.xml','drawable/panel.xml'];
const projectFiles=Object.fromEntries(paths.map(name=>[
 'src/main/res/'+name,{async:async type=>{
  if(type!=='uint8array')throw Error('Unexpected resource encoding');
  return new Uint8Array(fs.readFileSync(p+'/'+name));
 }}]));
const project={files:projectFiles};
const manifest=fs.readFileSync('ci/build/aar-real-manifest.xml','utf8');
const result=await compileAapt2Wasm({
 project,manifest,resourcePaths:Object.keys(projectFiles),aarLibraries:libs,
 moduleFactory:async()=>instance,
 fetchFn:async()=>({ok:true,arrayBuffer:async()=>sdk.buffer.slice(sdk.byteOffset,sdk.byteOffset+sdk.byteLength)})
});
if(!result?.apk||result.apk.length<100000||Object.keys(result.ids).length<400)
 throw Error('Real AAPT2 WASM did not compile all public Maven AAR resources: '+
  String(Object.keys(result?.ids||{}).length));
if(!result.ids['string/app_name'])throw Error('User application resources missing');
fs.writeFileSync('ci/build/aapt2-wasm-all-aar-proof.apk',result.apk);
console.log('PASS actual Chrome AAPT2 WASM, AARs:',libs.length,
 'linked IDs:',Object.keys(result.ids).length,'resource APK bytes:',result.apk.length);
