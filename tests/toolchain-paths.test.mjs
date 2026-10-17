import test from "node:test";
import assert from "node:assert/strict";
import {toolchainUrl,toCheerpJPath,kotlinJarRelative,d8JarRelative,checkToolchainFiles} from "../src/toolchain-paths.mjs";
const gh = "https://genghis69.github.io/pk-forge-browser/src/kotlin-lab.mjs";
test("GitHub Pages: inclut le sous-dossier du dépôt pour chaque JAR",()=>{
 assert.equal(toCheerpJPath(kotlinJarRelative("kotlin-compiler-embeddable-2.2.20.jar"),gh),
 "/app/pk-forge-browser/toolchains/kotlin/2.2.20/jars/kotlin-compiler-embeddable-2.2.20.jar");
 assert.equal(toolchainUrl("kotlin/2.2.20/manifest.json",gh).href,
 "https://genghis69.github.io/pk-forge-browser/toolchains/kotlin/2.2.20/manifest.json");
 assert.equal(toCheerpJPath(d8JarRelative("8.13.17","r8-8.13.17.jar"),gh),
 "/app/pk-forge-browser/toolchains/r8/8.13.17/r8-8.13.17.jar");
});
test("WAMP ou sous-dossier générique : conserve le chemin racine du projet",()=>{
 const url="http://localhost/cmpl/src/kotlin-lab.mjs";
 assert.equal(toCheerpJPath(kotlinJarRelative("kotlin-stdlib-2.2.20.jar"),url),
 "/app/cmpl/toolchains/kotlin/2.2.20/jars/kotlin-stdlib-2.2.20.jar");
});
test("Hébergement à la racine : pas de double barre ni sous-dossier inventé",()=>{
 assert.equal(toCheerpJPath(kotlinJarRelative("annotations-13.0.jar"),
 "https://apk.example/src/kotlin-lab.mjs"),"/app/toolchains/kotlin/2.2.20/jars/annotations-13.0.jar");
});
test("Rejette les traversées de chemins, noms corrompus et chemins non HTTP",()=>{
 assert.throws(()=>toolchainUrl("../secret.jar",gh));
 assert.throws(()=>kotlinJarRelative("../../bad.jar"));
 assert.throws(()=>d8JarRelative("foo/bar","r8.jar"));
 assert.throws(()=>toCheerpJPath("kotlin/file.jar","file:///var/www/src/kotlin-lab.mjs"));
});
test("Vérification HEAD : affiche les fichiers manquants AVANT de lancer Java",async()=>{
 const m={jars:["kotlin-compiler-embeddable-2.2.20.jar","kotlin-stdlib-2.2.20.jar"],d8Jar:"r8-8.13.17.jar",d8Version:"8.13.17"};
 const requested=[];
 const missing=await checkToolchainFiles(m,gh,async (url,options)=>{
  requested.push({path:url.pathname,method:options.method});
  return {ok:!url.pathname.includes("kotlin-stdlib"),status:url.pathname.includes("kotlin-stdlib")?404:200};
 });
 assert.equal(missing.length,1);
 assert.match(missing[0].url,/pk-forge-browser.*kotlin-stdlib/);
 assert.equal(requested.length,3);
 assert.ok(requested.every(x=>x.method==="HEAD"));
});

test("ECJ Java 17 : URL publique et chemin CheerpJ correspondent au répertoire réel",()=>{
 const ecj='android/java/ecj/3.43.0/ecj.jar';
 assert.equal(toolchainUrl(ecj,gh).href,
  'https://genghis69.github.io/pk-forge-browser/toolchains/android/java/ecj/3.43.0/ecj.jar');
 assert.equal(toCheerpJPath(ecj,gh),
  '/app/pk-forge-browser/toolchains/android/java/ecj/3.43.0/ecj.jar');
 assert.notEqual(toolchainUrl(ecj,gh).pathname,
  '/pk-forge-browser/toolchains/java/ecj/3.43.0/ecj.jar');
});
