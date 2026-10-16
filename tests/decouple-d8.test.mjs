import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('D8 n’est plus exécuté automatiquement après Kotlin',()=>{
 const source=readFileSync('src/android-compiler.mjs','utf8');
 const main=source.slice(source.indexOf('async function buildGroup(project)'),source.indexOf('async function compileStandaloneDex'));
 assert.doesNotMatch(main,/cheerpjRunMain\('com\.android\.tools\.r8\.D8'/);
 assert.match(main,/el\('androidJarDownload'\)\.disabled=false/);
 assert.match(main,/el\('androidCompileDex'\)\.disabled=false/);
 assert.match(source,/el\('androidCompileDex'\)\.addEventListener/);
 const html=readFileSync('index.html','utf8');
 assert.match(html,/id="androidCompileDex"/);
});
test('D8 manuel est un seul jar à convertir : éviter un classpath de 20 bibliothèques',()=>{
 const source=readFileSync('src/android-compiler.mjs','utf8');
 const fragment=source.slice(source.indexOf('export function diagnosticD8Arguments'),source.indexOf('async function compileStandaloneDex'));
 assert.match(fragment,/--lib/);
 assert.match(fragment,/--output/);
 assert.doesNotMatch(fragment,/--classpath/);
});
