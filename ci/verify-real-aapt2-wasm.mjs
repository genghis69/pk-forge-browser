/**
 * Smoke-test the real compiled AOSP AAPT2 WebAssembly program.
 * Never accept fake FS objects, mocked callMain implementations or prebuilt APKs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const filepath=process.argv[2];
if(!filepath)throw Error('Real aapt2.js output path required');
const js=path.resolve(filepath), wasm=js.replace(/\.js$/,'.wasm');
const magic=await fs.readFile(wasm);
if(magic.length<10000||magic.slice(0,4).toString('hex')!=='0061736d')
 throw Error('Not a real AAPT2 WebAssembly binary');
const {default:factory}=await import(pathToFileURL(js).href);
if(typeof factory!=='function')throw Error('AAPT2 Emscripten factory missing');
const instance=await factory({
 locateFile:(filename)=>path.resolve(path.dirname(js),filename),
 print:console.log,
 printErr:console.error
});
if(!instance.FS||typeof instance.FS.writeFile!=='function'||typeof instance.callMain!=='function')
 throw Error('Actual AAPT2 module is missing FS or callMain');
const status=instance.callMain(['version']);
if(typeof status==='number'&&status!==0)throw Error('Actual AAPT2 version exited '+status);
console.log('Verified actual AAPT2 C++ executed inside WebAssembly');
