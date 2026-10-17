/**
 * AAPT2 native CI proof over all authentic PUBLIC Maven AAR resources.
 * This reproduces the browser plan (compile each library + the app, link
 * together) and never accesses a user's uploaded source ZIP.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseAapt2Symbols} from '../src/aapt2-wasm.mjs';

const root='ci/build/aapt2-real-aars';
const base='dist/toolchains/android/deps/trainmanager-ads-v1';
const inventory=JSON.parse(fs.readFileSync(path.join(base,'resolved.json'),'utf8'));
const aapt2=process.env.ANDROID_HOME+'/build-tools/35.0.0/aapt2';
const sdk='dist/toolchains/android/sdk/36/android.jar';
const files=[],names=new Set();
let count=0;
fs.mkdirSync(root,{recursive:true});
for(const a of inventory.artifacts.filter(x=>x.extension==='aar'&&x.resourceCount>0)){
 const source=path.join(base,'archives',a.file);
 const paths=execFileSync('unzip',['-Z','-1',source],{encoding:'utf8',maxBuffer:16*1024*1024})
  .split(/\r?\n/).filter(Boolean);
 for(const entry of paths){
  if(!entry.startsWith('res/')||entry.endsWith('/'))continue;
  if(!/^res\/[A-Za-z0-9_+.-]+\/[A-Za-z0-9_.+-]+$/.test(entry))
   throw Error('Unsupported AAR resource path: '+a.file+'/'+entry);
 }
 const dest=path.join(root,'lib-'+count++);
 fs.mkdirSync(dest,{recursive:true});
 execFileSync('unzip',['-q','-o',source,'res/*','-d',dest],{maxBuffer:32*1024*1024});
 const zip=path.join(root,'compiled-'+count+'.zip');
 execFileSync(aapt2,['compile','--dir',path.join(dest,'res'),'-o',zip],{maxBuffer:32*1024*1024});
 if(fs.statSync(zip).size<100)throw Error('AAPT2 empty library: '+a.file);
 files.push(zip);
 names.add(a.file);
}
const linked=path.join(root,'merged-library-resources.apk');
const symbols=path.join(root,'merged-R.txt');
const compiledApp='ci/build/aapt2-compiled.zip';
const args=['link','-o',linked,'-I',sdk,
 '--manifest','ci/build/aapt2-src/AndroidManifest.xml',
 '--output-text-symbols',symbols,'--auto-add-overlay'];
for(const zip of [...files,compiledApp])args.push('-R',zip);
execFileSync(aapt2,args,{maxBuffer:48*1024*1024});
const ids=parseAapt2Symbols(fs.readFileSync(symbols,'utf8'));
if(Object.keys(ids).length<10||!ids['string/app_name'])
 throw Error('AAPT2 failed to merge authentic AAR resources with app values: '+Object.keys(ids).length);
const bytes=fs.readFileSync(linked);
if(bytes.length<1000||bytes[0]!==80||bytes[1]!==75)
 throw Error('No AAPT2 linked APK for all AAR resources');
console.log('AAPT2 genuine Maven AAR resource link: '+names.size+' libraries, '+
 Object.keys(ids).length+' IDs, '+bytes.length+' bytes. No user source uploaded.');
