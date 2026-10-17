/**
 * Conservative browser-only AppLovin MAX / Google Ads classpath validator.
 *
 * Maven resolves PUBLIC dependencies during toolchain publication, never an
 * uploaded Android project. Chrome downloads the resulting genuine JARs and
 * validates their SHA-256 with mountJar. JVM classpath support is NOT AAR merge.
 */
export const TRAINMANAGER_ADS_COORDINATES=Object.freeze([
 'com.applovin:applovin-sdk:+',
 'com.google.android.gms:play-services-ads-identifier:18.2.0'
]);
const ARCHIVE_PREFIX='deps/trainmanager-ads-v1/jars/';
const SHA256=/^[0-9a-f]{64}$/;
const VERSION=/^[0-9]+(?:\.[0-9]+){1,3}(?:[-.][a-zA-Z0-9]+)*$/;
const NAME=/^[A-Za-z0-9_.-]+\.jar$/;

/**
 * Reports two separate capabilities:
 * 1. Real ECJ classpath (available once verified public jars are published)
 * 2. Installable APK (unavailable without full AAR resources/manifest merge).
 */
export function resolveTrainManagerAds(analysis,catalog){
 const coordinates=analysis?.dependencies??[];
 if(!Array.isArray(coordinates))throw Error('Dépendances Gradle invalides.');
 const selected=TRAINMANAGER_ADS_COORDINATES.filter(x=>coordinates.includes(x));
 if(!selected.length)return {requested:false,jars:[],apkReady:true,blockedReason:null};
 if(selected.length!==TRAINMANAGER_ADS_COORDINATES.length)
  throw Error('Dépendances publicitaires partielles : TrainManager attend les deux coordonnées AppLovin MAX et Google Ads Identifier.');
 const ads=catalog?.trainManagerAds;
 if(!ads||!VERSION.test(ads.selectedAppLovin||'')||!Array.isArray(ads.jarArtifacts))
  throw Error('AppLovin MAX et Google Ads : les JAR issus des AAR Maven ne sont pas encore publiés dans le catalogue Android.');
 if(!Number.isInteger(ads.aars)||ads.aars<1||!Number.isInteger(ads.aarResources))
  throw Error('Inventaire des AAR publicitaires incomplet : manifeste et ressources non vérifiables.');
 if(!ads.jarArtifacts.length)throw Error('Aucun vrai fichier classes.jar publié pour les publicités.');
 const names=new Set(),paths=new Set(),modules=new Set();
 for(const jar of ads.jarArtifacts){
  if(!jar||!NAME.test(jar.name||'')||
     jar.relative!==ARCHIVE_PREFIX+jar.name||
     !SHA256.test(jar.sha256||'')||
     !Number.isSafeInteger(jar.size)||jar.size<100||
     !/^[a-zA-Z][\w.-]*(?:\.[\w.-]+)+$/.test(jar.group||'')||
     !/^[\w.-]+$/.test(jar.module||'')||
     !VERSION.test(jar.version||''))
   throw Error('Catalogue JAR publicitaire incorrect ou non vérifiable : '+String(jar?.name||'inconnu'));
  if(names.has(jar.name)||paths.has(jar.relative))
   throw Error('Bibliothèque publicitaire dupliquée : '+jar.name);
  names.add(jar.name);paths.add(jar.relative);
  modules.add(jar.group+':'+jar.module);
 }
 if(!modules.has('com.applovin:applovin-sdk')||
    !modules.has('com.google.android.gms:play-services-ads-identifier'))
  throw Error('Classpath publicitaire incomplet : les classes AppLovin SDK ou Google Ads Identifier manquent.');
 const blockedReason='Compilation Java des vrais SDK publicitaires possible, mais APK suspendu : '+
  'fusion des manifestes, ressources, identifiants R, assets et bibliothèques natives des AAR non implémentée.';
 return {requested:true,jars:ads.jarArtifacts,apkReady:false,blockedReason,
  selectedAppLovin:ads.selectedAppLovin,
  aars:ads.aars,aarResources:ads.aarResources};
}

/** Defense in depth: no DEX/archive caller may assemble an ads APK yet. */
export function assertNoUnmergedAdsApk(analysis,linkedResourceSession=null){
 const coordinates=analysis?.dependencies??[];
 const ads=coordinates.some(x=>/^com\.applovin:|^com\.google\.android\.gms:play-services-ads-identifier:/.test(x));
 if(!ads)return true;
 const session=linkedResourceSession,merge=session?.aarState;
 if(session?.engine!=='aapt2-wasm'||!merge?.aarReady||
    merge.aarRCompiled!==true||!Array.isArray(merge.libs)||
    !Array.isArray(merge.packages)||!Array.isArray(merge.extraFiles)||
    merge.libs.length<2)
  throw Error('APK publicitaire refusé : fusion AAR non complètement validée (manifestes, AAPT2, R, assets et JNI).');
 return true;
}
