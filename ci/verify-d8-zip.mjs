/**
 * Verifies real native D8 archive mode with APK Forge's exact DEX checks.
 */
import {execFileSync} from 'node:child_process';
import {verifyDexIntegrity} from '../src/dex-integrity.mjs';
const archive=process.argv[2];
if(!archive)throw Error('Usage: node ci/verify-d8-zip.mjs classes.zip');
const list=execFileSync('unzip',['-Z','-1',archive],{encoding:'utf8'})
 .trim().split(/\r?\n/).filter(n=>/^classes(?:[2-9]|[1-9]\d+)?\.dex$/.test(n));
if(!list.length)throw Error('D8 n’a produit aucun DEX dans le ZIP');
for(const name of list){
 const bytes=new Uint8Array(execFileSync('unzip',['-p',archive,name],{maxBuffer:60*1024*1024}));
 const result=await verifyDexIntegrity(bytes);
 console.log('Vérifié',name,bytes.length,'octets, map entries',result.sections);
}
console.log('Mode D8 ZIP : '+list.length+' DEX vérifiés.');
