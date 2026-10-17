import test from 'node:test';
import assert from 'node:assert/strict';
import {extractGradleBuildSettings,createGradleBuildConfig} from '../src/gradle-generated.mjs';
const gradle=\`def sdkKey=localProps.getProperty('MAX_SDK_KEY', '').trim()
def rewardedUnit=localProps.getProperty('MAX_REWARDED_AD_UNIT_ID', '').trim()
buildConfigField 'String', 'MAX_SDK_KEY', quoted(sdkKey)
buildConfigField 'String', 'MAX_REWARDED_AD_UNIT_ID', quoted(rewardedUnit)\`;
const info={namespace:'fr.local.trainmanagersession',packageName:'fr.local.trainmanagersession',
 versionCode:'4',version:'4.0'};
test('TrainManager : génère BuildConfig Java sans inventer des clés AppLovin',()=>{
 const config=extractGradleBuildSettings(gradle,info);
 const java=createGradleBuildConfig(info,config);
 assert.match(java,/public static final String MAX_SDK_KEY = "";/);
 assert.match(java,/public static final String MAX_REWARDED_AD_UNIT_ID = "";/);
 assert.match(java,/VERSION_CODE = 4/);
 assert.ok(!java.includes('VOTRE_CLE'));
});
test('TrainManager : remplace le placeholder Gradle maxSdkKey sans modifier les permissions',()=>{
 const config=extractGradleBuildSettings(gradle,info);
 const original='<application><meta-data android:name="applovin.sdk.key" android:value="\${maxSdkKey}" /></application>';
 const resolved=config.manifestPlaceholder(original);
 assert.equal(resolved,'<application><meta-data android:name="applovin.sdk.key" android:value="" /></application>');
});
test('Rejette un placeholder ou un champ BuildConfig non interprété',()=>{
 const config=extractGradleBuildSettings(gradle,info);
 assert.throws(()=>config.manifestPlaceholder('<manifest package="\${otherKey}"/>'),/inconnu/);
 assert.throws(()=>extractGradleBuildSettings(gradle+"\\nbuildConfigField 'int', 'ADMIN', 1",info),/BuildConfig/);
});
