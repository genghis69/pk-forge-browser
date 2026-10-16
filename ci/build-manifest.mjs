import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root='dist/toolchains/kotlin/2.2.20';
const dir=path.join(root,'jars');
const jars=fs.readdirSync(dir).filter(x=>x.endsWith('.jar')).sort();
if(!jars.includes('kotlin-compiler-embeddable-2.2.20.jar') || !jars.includes('kotlin-stdlib-2.2.20.jar'))throw Error('Kotlin compiler/stdlib missing');
const artifacts=jars.map(filename=>{
 const bytes=fs.readFileSync(path.join(dir,filename));
 return {filename,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
const totalBytes=artifacts.reduce((x,y)=>x+y.size,0);
const manifest={version:'2.2.20',java:17,entryPoint:'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',jars,totalBytes,artifacts,
d8Version:'8.13.17',d8Jar:fs.existsSync('dist/toolchains/r8/8.13.17/r8-8.13.17.jar')?'r8-8.13.17.jar':null,
status:'experimental',apkKotlinSupported:false};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(jars.length+' Kotlin JARs; '+Math.round(totalBytes/1048576)+' MiB; D8 '+(manifest.d8Jar?'available':'unavailable'));
