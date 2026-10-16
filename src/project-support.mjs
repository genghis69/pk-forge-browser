/**
 * Determines the supported compile path before JVM tools download.
 * Explicitly refuses Java-only/mixed or incomplete projects rather than
 * compiling a misleading APK without their code.
 */
const known=s=>s&&s!=='Non précisé';
export function classifyAndroidProject(a){
 if(!a||typeof a!=='object')return {mode:'unsupported',description:'Projet absent',
  reason:'Aucun projet Android analysé. Importe une archive ZIP.'};
 const kotlin=Number(a.kotlin)||0,java=Number(a.java)||0;
 const summary=kotlin+' fichier(s) Kotlin, '+java+' fichier(s) Java, '+
  (Number(a.resources)||0)+' ressource(s) Android.';
 const fail=(reason)=>({mode:'unsupported',description:summary,reason});
 if(!a.manifestPath)return fail('AndroidManifest.xml source introuvable. Vérifie que le ZIP contient le manifeste original du module application.');
 if(a.nativeLibs>0)return fail(a.nativeLibs+' bibliothèque(s) natives .so détectée(s). La chaîne actuelle ne sait pas empaqueter et vérifier les ABI natives.');
 if(a.aarFiles>0)return fail(a.aarFiles+' archive(s) .aar locale(s) détectée(s). La fusion de leurs classes, manifestes et ressources n’est pas encore intégrée.');
 if(java>0 && kotlin>0)return fail('Projet mixte détecté : '+summary+' Le navigateur sait compiler Kotlin pour les projets pris en charge, mais ne compile pas encore les sources Java du même module.');
 if(java>0){
  const files=(a.javaPaths||[]).filter(p=>/(?:^|\/)src\/main\/(?:java|kotlin)\/.*\.java$/.test(p));
  if(files.length!==java)return fail('Sources Java du module application introuvables ou incomplètes.');
  if(!a.namespace||a.namespace==='Non précisé'&&!a.packageName)return fail('Le namespace Android est absent. Configure applicationId et namespace dans le fichier Gradle.');
  if(!Number.isInteger(Number(a.sdk))||Number(a.sdk)>36||Number(a.sdk)<21)
   return fail('compileSdk Android '+a.sdk+' non pris en charge. SDK maximum : 36.');
  if(!Number.isInteger(Number(a.minSdk))||Number(a.minSdk)<21)
   return fail('minSdk Android manquant ou inférieur à 21.');
  if(a.unresolvedDependencies?.length)return fail('Bibliothèques Gradle non résolues : '+a.unresolvedDependencies.join(', '));
  // Catalog compatibility is checked again against real SHA-256 manifests
  // before ECJ is run. Unsupported Maven coordinates must never be ignored.
  return {mode:'java',description:summary,reason:'Projet Java détecté. Chaîne expérimentale AAPT2 → ECJ Java 17 → D8 → signature. Les dépendances sont strictement vérifiées avant compilation.'};
 }
 if(kotlin>0){
  const paths=a.kotlinPaths??a.sourceSamples?.filter(p=>p.endsWith('.kt'))??[];
  const selected=paths.filter(p=>/(?:^|\/)src\/main\/(?:java|kotlin)\/.*\.kt$/.test(p));
  if(selected.length!==kotlin)return fail('Sources Kotlin détectées : '+kotlin+', mais seulement '+selected.length+' sous src/main/java ou src/main/kotlin. Structure de projet non prise en charge : '+paths.filter(p=>!selected.includes(p)).slice(0,3).join(', '));
  if(a.kotlinPlugin!=='2.2.20')return fail('Projet Kotlin '+a.kotlinPlugin+' détecté. Le moteur actuellement intégré est limité à Kotlin 2.2.20. Il faut adapter le compilateur et les dépendances à cette version.');
  if(Number(a.sdk)!==36)return fail('SDK Android '+a.sdk+' détecté. Le moteur Kotlin actuel exige compileSdk 36. Il faut adapter la plateforme du compilateur pour ce projet.');
  return {mode:'kotlin',description:summary,reason:'Chaîne AAPT2 → Kotlin → D8 → APK signé disponible pour ce profil. La compatibilité des dépendances sera vérifiée pendant la compilation.'};
 }
 if(a.compatible)return {mode:'resources',description:summary,
  reason:'Projet Android sans sources Java/Kotlin, avec android:hasCode="false" : assemblage et signature Google Pack.'};
 if(!a.manifestHasCodeFalse)return fail('Aucune source Java/Kotlin trouvée, mais le manifeste ne déclare pas android:hasCode="false". Il peut manquer le code de l’application dans le ZIP. APK refusé pour éviter un crash. Fournis les sources complètes si l’application est censée s’ouvrir.');
 if(!a.resources)return fail('Application sans code : aucune ressource res/ détectée. Google Pack ne peut pas construire un APK utile avec cette archive.');
 return fail('Projet sans code non compatible avec les exigences de ressources et de manifeste du moteur Google Pack.');
}
