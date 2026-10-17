/**
 * Conservative browser implementation of the Gradle-generated BuildConfig and
 * manifest placeholders used by the uploaded TrainManager project. No
 * customer SDK credentials are embedded or sent to GitHub.
 */
const textFields=['MAX_SDK_KEY','MAX_REWARDED_AD_UNIT_ID'];
export function extractGradleBuildSettings(appGradle,analysis){
 if(typeof appGradle!=='string')throw Error('app/build.gradle introuvable.');
 const declared=[...appGradle.matchAll(/\bbuildConfigField\s*(?:\(\s*)?['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*([^\n]+)/g)];
 const names=declared.map(m=>m[2]);
 if(names.length!==new Set(names).size)throw Error('Champs BuildConfig dupliqués.');
 const unrecognized=declared.filter(([,type,name,value])=>
  type!=='String'||!textFields.includes(name)||
  !(value.includes(name==='MAX_SDK_KEY'?'quoted(sdkKey)':'quoted(rewardedUnit)')));
 if(unrecognized.length)throw Error('buildConfigField Gradle dynamique non encore reconnu : '+
  unrecognized.map(m=>m[2]).join(', ')+'. Refus de substituer une valeur arbitraire.');
 if(names.length&&names.length!==2)
  throw Error('TrainManager attend MAX_SDK_KEY et MAX_REWARDED_AD_UNIT_ID.');
 const values=Object.fromEntries(textFields.map(name=>[name,'']));
 const placeholder=(manifest)=>{
  if(typeof manifest!=='string')throw Error('AndroidManifest.xml absent.');
  const placeholders=[...manifest.matchAll(/\$\{([^}]+)\}/g)].map(x=>x[1]);
  const unknown=placeholders.filter(p=>p!=='maxSdkKey');
  if(unknown.length)throw Error('Placeholder de manifeste inconnu : '+unknown.join(', '));
  // Same defaults as localProps.getProperty('MAX_SDK_KEY', '') in Gradle.
  return manifest.replace(/\$\{maxSdkKey\}/g,'');
 };
 const namespace=analysis?.namespace!=='Non précisé'?analysis.namespace:analysis.packageName;
 if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(namespace||''))
  throw Error('Namespace pour BuildConfig invalide.');
 return {namespace,values,manifestPlaceholder:placeholder,fields:names,
  credentialsConfigured:false};
}
export function createGradleBuildConfig(analysis,settings){
 if(!settings||!settings.namespace)throw Error('Paramètres Gradle manquants.');
 const stringValue=s=>JSON.stringify(s);
 const appId=analysis.packageName;
 if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(appId||''))
  throw Error('applicationId invalide.');
 if(!Number.isInteger(Number(analysis.versionCode))||Number(analysis.versionCode)<1)
  throw Error('versionCode Gradle invalide.');
 if(!/^[A-Za-z0-9._-]+$/.test(analysis.version||''))
  throw Error('versionName Gradle invalide.');
 return \`package \${settings.namespace};
public final class BuildConfig {
 private BuildConfig() {}
 public static final boolean DEBUG = true;
 public static final String APPLICATION_ID = \${stringValue(appId)};
 public static final String BUILD_TYPE = "debug";
 public static final int VERSION_CODE = \${Number(analysis.versionCode)};
 public static final String VERSION_NAME = \${stringValue(analysis.version)};
 public static final String MAX_SDK_KEY = "";
 public static final String MAX_REWARDED_AD_UNIT_ID = "";
}
\`;
}
