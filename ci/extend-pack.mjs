import fs from 'node:fs';
const root='google-pack-source/pack-wasm';
const src=root+'/src/lib.rs';
let lib=fs.readFileSync(src,'utf8');
if(!lib.includes('mod input_types;')||lib.includes('mod apkforge;'))throw Error('Unexpected Google Pack revision');
lib=lib.replace('mod input_types;','mod input_types;\nmod apkforge;');
fs.writeFileSync(src,lib);
fs.copyFileSync('ci/pack-wasm-apkforge.rs',root+'/src/apkforge.rs');
const toml=root+'/Cargo.toml';
let data=fs.readFileSync(toml,'utf8');
if(!data.includes('[dependencies.getrandom]'))throw Error('Google Pack Cargo changed');
const deps=[
'pack-asset-compiler = { path = "../pack-asset-compiler" }',
'pack-sign = { path = "../pack-sign" }',
'pack-zip = { path = "../pack-zip" }',
'zip = "2.2.2"',
'xml = { package = "xml-rs", version = "0.8.20" }'
].join('\n');
data=data.replace('[dependencies.getrandom]',deps+'\n\n[dependencies.getrandom]');
fs.writeFileSync(toml,data);
console.log('Google Pack WASM extended with resource IDs and APK signing including DEX.');
