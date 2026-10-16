// Exemple de cadran Wear OS sans code Java/Kotlin, inspiré de l'exemple Apache-2.0 Google Pack.
// Tous les fichiers sont construits dans le navigateur, jamais envoyés sur un serveur.
export async function createSampleZip(){
 if (!window.JSZip) throw new Error('JSZip est indisponible, recharge la page.');
 const zip = new window.JSZip();
 zip.file('AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.apkforge.browser.watchface" android:versionCode="1" android:versionName="1.0">
  <uses-feature android:name="android.hardware.type.watch"/>
  <uses-sdk android:minSdkVersion="33"/>
  <application android:hasCode="false" android:label="@string/app_name">
    <property android:name="com.google.wear.watchface.format.version" android:value="1"/>
  </application>
</manifest>`);
 zip.file('res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources><string name="app_name">APK Forge Demo</string></resources>`);
 zip.file('res/xml/watch_face_info.xml', `<?xml version="1.0" encoding="utf-8"?>
<WatchFaceInfo><Preview value="@drawable/preview"/><MultipleInstancesAllowed value="true"/><Editable value="false"/></WatchFaceInfo>`);
 zip.file('res/raw/watchface.xml', `<?xml version="1.0" encoding="utf-8"?>
<WatchFace width="450" height="450"><Scene backgroundColor="#ff162941"><Group x="0" y="0" width="450" height="450"><DigitalClock x="75" y="160" width="300" height="100"><Localization calendar="GREGORIAN" timeZone="SYNC_TO_DEVICE"/><TimeText x="0" y="0" width="300" height="100" format="hh:mm"><Font family="SYNC_TO_DEVICE" size="65"/></TimeText></DigitalClock></Group></Scene></WatchFace>`);
 const preview='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLq5wAAAABJRU5ErkJggg==';
 zip.file('res/drawable/preview.png',preview,{base64:true});
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
 return new File([blob],'Exemple-WearOS-GooglePack.zip',{type:'application/zip'});
}
