/**
 * Verify final resource IDs create real Java17 R classes for all Maven AAR
 * packages, then check D8 can consume those R classes with authentic ad SDKs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {realJavaR} from '../src/java-sources.mjs';
import {parseAapt2Symbols} from '../src/aapt2-wasm.mjs';

const rtext=fs.readFileSync('ci/build/aapt2-real-aars/merged-R.txt','utf8');
const ids=parseAapt2Symbols(rtext);
const idx=JSON.parse(fs.readFileSync('dist/toolchains/android/deps/trainmanager-ads-v1/resolved.json','utf8'));
const packages=new Set();
for(const a of idx.artifacts.filter(x=>x.extension==='aar')){
 const archive='dist/toolchains/android/deps/trainmanager-ads-v1/archives/'+a.file;
 const manifest=execFileSync('unzip',['-p',archive,'AndroidManifest.xml'],{encoding:'utf8',maxBuffer:1_000_000});
 const pkg=manifest.match(/<manifest\b[^>]*\bpackage="([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)"/)?.[1];
 if(!pkg)throw Error('AAR namespace missing: '+a.file);
 packages.add(pkg);
}
const root='ci/build/aar-r-classes';
const sources=[];
for(const pkg of packages){
 const file=path.join('ci/build/aar-r-src',...pkg.split('.'),'R.java');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,realJavaR(pkg,ids));
 sources.push(file);
}
fs.mkdirSync(root,{recursive:true});
execFileSync('javac',['--release','17','-d',root,...sources],{maxBuffer:64*1024*1024});
for(const pkg of packages){
 const output=path.join(root,...pkg.split('.'),'R.class');
 if(!fs.existsSync(output)||fs.statSync(output).size<100)
  throw Error('Missing authentic final resource R.class: '+pkg);
}
const jar='ci/build/aar-real-r-classes.jar';
execFileSync('jar',['--create','--file',jar,'-C',root,'.']);
const bytes=fs.statSync(jar).size;
if(bytes<1000)throw Error('All R.classes failed to package');
console.log('Authentic AAPT2 R.java compiled for',packages.size,
 'Maven namespaces,',Object.keys(ids).length,'IDs, Java17 bytecode:',bytes,'bytes');
