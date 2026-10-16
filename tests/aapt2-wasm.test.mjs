import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAapt2Symbols,assertAapt2Runtime,runAapt2,compileAapt2Wasm} from '../src/aapt2-wasm.mjs';
test('R.txt AAPT2 produit les valeurs exactes, sans ID inventé',()=>{
 const ids=parseAapt2Symbols('int string app_name 0x7f01000a\nint layout activity_main 0x7f020001\n');
 assert.equal(ids['string/app_name'],0x7f01000a);
 assert.equal(ids['layout/activity_main'],0x7f020001);
 assert.equal(Object.keys(ids).length,2);
 assert.throws(()=>parseAapt2Symbols('int string x 0x7f010001\nint string x 0x7f010002'),/dupliqué/);
 const styles=parseAapt2Symbols('int[] styleable MyView { 0x01010000, 0x7f020005 }\nint styleable MyView_tint 1');
 assert.deepEqual(styles['styleable/MyView'],[0x01010000,0x7f020005]);
 assert.equal(styles['styleable/MyView_tint'],1);
 assert.throws(()=>parseAapt2Symbols('int[] styleable MyView { malformed }'),/invalide/);
 assert.throws(()=>parseAapt2Symbols(''),/R.txt/);
});
test('AAPT2 WASM doit exposer une véritable interface de compilation',()=>{
 assert.throws(()=>assertAapt2Runtime({}),/FS\/callMain/);
 const fake={FS:{writeFile(){},readFile(){},mkdir(){}},callMain:()=>7};
 assert.throws(()=>runAapt2(fake,['compile']),/Code de sortie 7/);
});
test('Sans binaire AAPT2, ne simule aucun résultat et ne passe pas par Google Pack',async()=>{
 const output=await compileAapt2Wasm({moduleUrl:'https://example.org/pk/src/aapt2-wasm.mjs',fetchFn:async()=>({status:404,ok:false})});
 assert.equal(output,null);
});
test('Compile et link AAPT2 utilisent les vraies sources dans FS, y compris layouts et styles',async()=>{
 const data=new Map();
 const dirs=new Set();
 const calls=[];
 const FS={
  mkdir(path){if(dirs.has(path))throw Error('File exists');dirs.add(path);},
  writeFile(path,bytes){data.set(path,new Uint8Array(bytes));},
  readFile(path){if(!data.has(path))throw Error('No such file: '+path);return data.get(path);}
 };
 const runtime={FS,callMain(args){
  calls.push(args);
  if(args[0]==='compile')FS.writeFile(args[args.indexOf('-o')+1],Uint8Array.of(80,75,3,4));
  if(args[0]==='link'){
   FS.writeFile(args[args.indexOf('-o')+1],Uint8Array.of(80,75,3,4,...new Uint8Array(128)));
   FS.writeFile(args[args.indexOf('--output-text-symbols')+1],new TextEncoder().encode('int layout activity_main 0x7f020001\nint style Theme_App 0x7f030001\n'));
  }
  return 0;
 }};
 const path='app/src/main/res/layout/activity_main.xml';
 const theme='app/src/main/res/values/themes.xml';
 const project={files:{
  [path]:{async:async()=>new TextEncoder().encode('<LinearLayout/>')},
  [theme]:{async:async()=>new TextEncoder().encode('<resources/>')}
 }};
 const result=await compileAapt2Wasm({project,manifest:'<manifest/>',resourcePaths:[path,theme],
  moduleFactory:async()=>runtime,fetchFn:async()=>({ok:true,arrayBuffer:async()=>new Uint8Array(1_100_000).buffer})});
 assert.equal(calls.length,2);
 assert.equal(calls[0][0],'compile');assert.equal(calls[1][0],'link');
 assert.equal(result.ids['layout/activity_main'],0x7f020001);
 assert.equal(result.ids['style/Theme_App'],0x7f030001);
 assert.ok([...data.keys()].some(p=>p.endsWith('/res/values/themes.xml')));
});

test('Emscripten EEXIST errno 20 lors des mkdir répétés ne bloque pas AAPT2',async()=>{
 const dirs=new Set(['/']),files=new Map(),calls=[];
 const err20=()=>Object.assign(new Error(''),{name:'ErrnoError',errno:20});
 const FS={
  mkdir(p){if(dirs.has(p)||files.has(p))throw err20();const parent=p.slice(0,p.lastIndexOf('/'))||'/';if(!dirs.has(parent))throw Error('Parent absent: '+p);dirs.add(p);},
  stat(p){if(dirs.has(p))return {mode:0o040000};if(files.has(p))return {mode:0o100000};throw Error('Introuvable '+p);},
  isDir(mode){return (mode&0o170000)===0o040000;},
  writeFile(p,data){if(!dirs.has(p.slice(0,p.lastIndexOf('/'))))throw Error('Dossier absent: '+p);files.set(p,new Uint8Array(data));},
  readFile(p){if(!files.has(p))throw Error('Fichier absent: '+p);return files.get(p);}
 };
 const module={FS,callMain(args){
  calls.push(args[0]);
  if(args[0]==='compile')FS.writeFile(args[args.indexOf('-o')+1],Uint8Array.from([80,75,3,4]));
  if(args[0]==='link'){
   FS.writeFile(args[args.indexOf('-o')+1],Uint8Array.from([80,75,...Array(128).fill(0)]));
   FS.writeFile(args[args.indexOf('--output-text-symbols')+1],new TextEncoder().encode('int layout main 0x7f020001\\n'));
  }
  return 0;
 }};
 const prefix='app/src/main/res/',input={
  [prefix+'layout/first.xml']:'<FrameLayout/>',
  [prefix+'layout/second.xml']:'<TextView/>',
  [prefix+'values/strings.xml']:'<resources/>'
 };
 const project={files:Object.fromEntries(Object.entries(input).map(([p,data])=>[p,{async:async()=>new TextEncoder().encode(data)}]))};
 const result=await compileAapt2Wasm({project,manifest:'<manifest/>',resourcePaths:Object.keys(input),
  moduleFactory:async()=>module,
  fetchFn:async()=>({ok:true,arrayBuffer:async()=>new Uint8Array(1100000).buffer})});
 assert.deepEqual(calls,['compile','link']);
 assert.equal(result.ids['layout/main'],0x7f020001);
 assert.ok([...dirs].some(p=>p.endsWith('/res/layout')));
 assert.ok([...dirs].some(p=>p.endsWith('/res/values')));
});
