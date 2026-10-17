/**
 * Vérifie TOUS les fichiers publiés dont les chemins sont annoncés dans les
 * catalogues du site statique. Empêche qu'un build GitHub Actions soit vert
 * avec un fichier ECJ / SDK publicitaire inaccessible dans Chrome.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {toolchainUrl} from '../src/toolchain-paths.mjs';

const root=path.resolve('dist/toolchains');
const origin='https://genghis69.github.io/pk-forge-browser/src/android-compiler.mjs';
const seen=new Set();
let verified=0;

function check(relative,expectedSize,expectedSha,description='JAR'){
 if(typeof relative!=='string'||!relative||
    relative.startsWith('/')||relative.includes('\\')||
    relative.split('/').some(p=>p==='.'||p==='..'||!p))
  throw Error('Chemin d’outil invalide : '+String(relative));
 if(seen.has(relative))throw Error('Artefact déclaré plusieurs fois : '+relative);
 seen.add(relative);
 const url=toolchainUrl(relative,origin);
 if(url.pathname!=='/pk-forge-browser/toolchains/'+relative)
  throw Error('URL GitHub Pages incorrecte : '+url.href);
 const filename=path.join(root,relative);
 if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())
  throw Error('Fichier absent de la publication : '+url.href);
 const bytes=fs.readFileSync(filename);
 if(bytes.length!==expectedSize)throw Error('Taille incorrecte : '+relative);
 if(bytes.length<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)
  throw Error('Archive '+description+' invalide : '+relative);
 if(!/^[0-9a-f]{64}$/.test(expectedSha||''))
  throw Error('Empreinte manquante : '+relative);
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 if(sha!==expectedSha)throw Error('SHA-256 incorrect avant publication : '+relative);
 verified++;
}

const android=JSON.parse(fs.readFileSync(path.join(root,'android/manifest.json'),'utf8'));
for(const item of android.artifacts)
 check('android/'+item.relative,item.size,item.sha256);

if(android.javaCompiler?.relative!=='android/java/ecj/3.43.0/ecj.jar')
 throw Error('Chemin ECJ invalide dans le catalogue Android : '+
  String(android.javaCompiler?.relative)+
  ' (doit commencer par android/ pour GitHub Pages).');
check(android.javaCompiler.relative,android.javaCompiler.size,android.javaCompiler.sha256);
if(android.javaCompiler.entryPoint!=='dev.apkforge.tools.ApkForgeEcjCompiler'||
   !android.javaCompiler.adapter?.relative)
 throw Error('ECJ sans son véritable pilote Java 17 API : catalogue incomplet.');
check(android.javaCompiler.adapter.relative,
 android.javaCompiler.adapter.size,android.javaCompiler.adapter.sha256);

const ads=android.trainManagerAds;
if(!ads||!Array.isArray(ads.jarArtifacts)||!Array.isArray(ads.aarArtifacts))
 throw Error('Inventaire des SDK publicitaires absent.');
for(const jar of ads.jarArtifacts)
 check('android/'+jar.relative,jar.size,jar.sha256);
for(const aar of ads.aarArtifacts)
 check('android/'+aar.relative,aar.size,aar.sha256,'AAR');

const kotlin=JSON.parse(fs.readFileSync(path.join(root,'kotlin/2.2.20/manifest.json'),'utf8'));
for(const a of kotlin.artifacts)
 check('kotlin/2.2.20/jars/'+a.filename,a.size,a.sha256);
if(kotlin.d8Jar)
 check('r8/'+kotlin.d8Version+'/'+kotlin.d8Jar,kotlin.d8Size,kotlin.d8Sha256);

if(verified<15)throw Error('Trop peu de bibliothèques vérifiées : '+verified);
console.log('Intégrité et chemins GitHub Pages vérifiés : '+verified+
 ' fichiers, dont ECJ '+android.javaCompiler.version+
 ', les JAR publicitaires et les AAR originaux.');
