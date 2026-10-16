/**
 * Contrôle l'intégrité réelle des JAR publiés AVANT d'assembler le site.
 * Évite un manifeste décalé par rapport aux fichiers du même déploiement.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve('dist/toolchains');
let verified=0;
function check(relative,expectedSize,expectedSha){
 if(typeof relative!=='string'||relative.startsWith('/')||relative.split('/').includes('..'))throw Error('Chemin hors des outils : '+relative);
 const filename=path.join(root,relative);
 const bytes=fs.readFileSync(filename);
 if(bytes.length!==expectedSize)throw Error('Taille incorrecte : '+relative);
 if(bytes.length<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)throw Error('Ce fichier n’est pas un JAR : '+relative);
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 if(sha!==expectedSha)throw Error('SHA-256 incorrect avant publication : '+relative);
 verified++;
}
const android=JSON.parse(fs.readFileSync(path.join(root,'android/manifest.json'),'utf8'));
for(const a of android.artifacts)check('android/'+a.relative,a.size,a.sha256);
const kotlin=JSON.parse(fs.readFileSync(path.join(root,'kotlin/2.2.20/manifest.json'),'utf8'));
for(const a of kotlin.artifacts)check('kotlin/2.2.20/jars/'+a.filename,a.size,a.sha256);
if(kotlin.d8Jar)check('r8/'+kotlin.d8Version+'/'+kotlin.d8Jar,kotlin.d8Size,kotlin.d8Sha256);
if(verified<15)throw Error('Trop peu de bibliothèques vérifiées : '+verified);
console.log('Intégrité de publication validée : '+verified+' bibliothèques dont SDK 36 et Kotlin.');
