/**
 * Analyseur de projet Android (sources uniquement).
 * Ne lit, n'exécute et ne réutilise aucun APK/DEX/class généré dans build/.
 */
const GENERATED_DIRS = new Set(['build','.gradle','.idea','.git','.cxx','.externalNativeBuild','out']);
export function isGeneratedPath(path) {
  return String(path).split('/').some(part => GENERATED_DIRS.has(part));
}
const find=(s,re)=>s.match(re)?.[1]||'Non précisé';
const ends=(p,name)=>p===name||p.endsWith('/'+name);
export function projectInfo(paths,texts={}) {
  const sourcePaths=paths.filter(p=>!isGeneratedPath(p));
  // Module application only. Test suites are not compiled into the APK.
  const isAppSource=p=>/(?:^|\/)src\/main\/(?:java|kotlin)\/.*\.(?:kt|java)$/.test(p);
  const kotlinFiles=sourcePaths.filter(p=>p.endsWith('.kt')&&isAppSource(p));
  const javaFiles=sourcePaths.filter(p=>p.endsWith('.java')&&isAppSource(p));
  const testSources=sourcePaths.filter(p=>/\.(?:kt|java)$/.test(p)&&!isAppSource(p));
  const resourcePaths=sourcePaths.filter(p=>/(?:^|\/)res\/[^/]+\/[^/]+$/.test(p));
  const manifests=sourcePaths.filter(p=>ends(p,'AndroidManifest.xml')).sort((a,b)=>{
    const score=p=>p.endsWith('/src/main/AndroidManifest.xml')?100:p==='AndroidManifest.xml'?80:p.endsWith('/AndroidManifest.xml')?50:0;
    return score(b)-score(a)||a.length-b.length;
  });
  const manifestPath=manifests[0]??null;
  const m=manifestPath?(texts[manifestPath]||''):'';
  const appGradlePath=sourcePaths.find(p=>/(?:^|\/)app\/build\.gradle(?:\.kts)?$/.test(p))
    || sourcePaths.filter(p=>ends(p,'build.gradle.kts')||ends(p,'build.gradle')).sort((x,y)=>y.split('/').length-x.split('/').length)[0];
  const appGradle=appGradlePath?(texts[appGradlePath]||''):'';
  const gradleFiles=sourcePaths.filter(p=>ends(p,'build.gradle.kts')||ends(p,'build.gradle'));
  const rootGradlePath=gradleFiles.filter(p=>p!==appGradlePath).sort((x,y)=>x.split('/').length-y.split('/').length)[0];
  const rootGradle=rootGradlePath?(texts[rootGradlePath]||''):'';
  const wrapperPath=sourcePaths.find(p=>ends(p,'gradle-wrapper.properties'));
  const wrapper=wrapperPath?(texts[wrapperPath]||''):'';
  const settingsPath=sourcePaths.find(p=>ends(p,'settings.gradle.kts')||ends(p,'settings.gradle'));
  const settings=settingsPath?(texts[settingsPath]||''):'';
  // Groovy and Kotlin DSL: implementation 'group:name:version', implementation("...").
  // Do not claim support for catalog aliases or computed coordinates.
  const dependencies=[...new Set([...appGradle.matchAll(/\b(?:implementation|api|compileOnly|runtimeOnly|kapt|ksp|debugImplementation)\s*(?:\(\s*)?["']([^"']+)["']/g)].map(m=>m[1]))];
  const unresolvedDependencies=[...appGradle.matchAll(/\b(?:implementation|api|compileOnly|runtimeOnly|kapt|ksp|debugImplementation)\s*(?:\(\s*)?(libs\.[\w.]+|project\s*\([^)]*\)|files\s*\([^)]*\)|fileTree\s*\([^)]*\))/g)].map(m=>m[1]);
  const gradleString=key=>find(appGradle,new RegExp('\\b'+key+'\\s*(?:=|\\(\\s*|\\s+)["\\x27]([^"\\x27]+)'));
  const gradleNumber=key=>find(appGradle,new RegExp('\\b'+key+'\\s*(?:=|\\(\\s*|\\s+)([0-9]+)'));
  const javaPlugin=/\b(?:id\s*(?:\(|\s+)|apply\s+plugin\s*:\s*)["']com\.android\.application["']/.test(appGradle);

  const packageName=gradleString('applicationId');
  const sourcePackage=find(m,/\bpackage\s*=\s*["']([^"']+)/);
  const namespace=gradleString('namespace');
  const hasCodeFalse=/android:hasCode\s*=\s*["']false["']/.test(m);
  const srcCode=kotlinFiles.length+javaFiles.length;
  const nativeLibs=sourcePaths.filter(p=>p.endsWith('.so')).length;
  return {
    manifestPath,appGradlePath,rootGradlePath,
    packageName:packageName!=='Non précisé'?packageName:(sourcePackage!=='Non précisé'?sourcePackage:namespace),
    namespace,
    name:find(m,/android:label\s*=\s*["']([^"']+)/),
    version:gradleString('versionName'),
    versionCode:gradleNumber('versionCode'),
    gradle:find(wrapper,/gradle-([\d.]+)-(?:bin|all)\.zip/),
    agp:find(rootGradle,/\bid\s*(?:\(\s*|\s+)["']com\.android\.application["']\s*\)?\s*version\s*["']([^"']+)/),
    kotlinPlugin:find(rootGradle,/\bid\s*\(\s*["']org\.jetbrains\.kotlin\.android["']\s*\)\s*version\s*["']([^"']+)/),
    javaTarget:find(appGradle,/\btargetCompatibility\s*(?:=|\s+)\s*JavaVersion\.VERSION_(\d+)/),
    kotlinJvmTarget:find(appGradle,/\bjvmTarget\s*=\s*["']([^"']+)/),
    sdk:gradleNumber('compileSdk')!=='Non précisé'?gradleNumber('compileSdk'):gradleNumber('compileSdkVersion'),
    targetSdk:gradleNumber('targetSdk')!=='Non précisé'?gradleNumber('targetSdk'):gradleNumber('targetSdkVersion'),
    minSdk:gradleNumber('minSdk')!=='Non précisé'?gradleNumber('minSdk'):gradleNumber('minSdkVersion'),
    java:javaFiles.length,kotlin:kotlinFiles.length,
    ignoredTestSources:testSources.length,usesAndroidApplicationPlugin:javaPlugin,
    kotlinPaths:kotlinFiles,javaPaths:javaFiles,
    manifestHasCodeFalse:hasCodeFalse,
    resources:resourcePaths.length, files:paths.length,sourceFiles:sourcePaths.length,
    ignoredGenerated:paths.length-sourcePaths.length,
    nativeLibs,
    prebuiltDex:sourcePaths.filter(p=>/(?:^|\/)classes\d*\.dex$/.test(p)).length,
    ignoredGeneratedDex:paths.filter(p=>isGeneratedPath(p)&&p.endsWith('.dex')).length,
    aarFiles:sourcePaths.filter(p=>p.endsWith('.aar')).length,
    sourceSamples:[...kotlinFiles,...javaFiles].slice(0,30),
    dependencies,unresolvedDependencies,
    repositoryHints:settings.includes('jitpack.io')?['https://jitpack.io']:[],
    compatible:!!m&&!!hasCodeFalse&&srcCode===0&&nativeLibs===0&&resourcePaths.length>0,
    resourcePaths
  };
}
