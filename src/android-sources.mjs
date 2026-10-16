/** Only app/src/main Kotlin sources from user ZIP. Never use build/, APK or DEX. */
const valid=n=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
export function sourcePaths(project){
 const files=project?.analysis?.kotlinPaths??project?.analysis?.sourceSamples??[];
 const selected=files.filter(p=>/\/src\/main\/(?:java|kotlin)\/.*\.kt$/.test(p)
  && !/(?:^|\/)(?:build|\.gradle|\.git)\//.test(p));
 if(selected.length>250)throw Error('More than 250 Kotlin source files.');
 return selected;
}
export function compileProfile(project,catalog){
 const a=project?.analysis;
 if(!a)throw Error('Importe un ZIP Android avant de compiler.');
 if(a.kotlinPlugin!=='2.2.20')throw Error('Kotlin 2.2.20 requis ; détecté : '+a.kotlinPlugin);
 if(Number(a.sdk)!==36)throw Error('Android SDK 36 requis ; détecté : '+a.sdk);
 if(Number(a.java)!==0)throw Error('Ce laboratoire ne compile pas encore les fichiers Java.');
 if(!catalog||catalog.compileSdk!==36||!Array.isArray(catalog.artifacts))throw Error('Catalogue SDK 36 incorrect.');
 const required=catalog.requiredCoordinates||[];
 const missing=(a.dependencies||[]).filter(d=>!required.includes(d));
 if(missing.length)throw Error('Bibliothèques Maven non préparées : '+missing.join(', '));
 const paths=sourcePaths(project);
 if(paths.length!==a.kotlin)throw Error('Compilation Kotlin partielle refusée : '+paths.length+'/'+a.kotlin);
 if(!paths.length)throw Error('Aucune source Kotlin trouvée.');
 return {paths,namespace:a.namespace!=='Non précisé'?a.namespace:a.packageName};
}
const add=(m,kind,name)=>{if(valid(kind)&&valid(name))(m[kind]??=new Set()).add(name);};
export function generateCompileOnlyR({namespace,resourceFiles,sourceTexts}){
 if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(namespace))throw Error('Namespace Android invalide.');
 const table={};
 for(const {path,text} of resourceFiles){
  const n=path.replace(/\\/g,'/');
  const file=n.match(/\/res\/([^/]+)\/([^/]+)\.([^.\/]+)$/);
  if(file){const kind=file[1].split('-')[0];if(kind!=='values')add(table,kind,file[2]);}
  for(const hit of text.matchAll(/@\+id\/([A-Za-z_]\w*)/g))add(table,'id',hit[1]);
  if(/\/res\/values[^/]*\//.test(n))
   for(const hit of text.matchAll(/<(string|color|dimen|bool|integer|plurals|style|fraction|array|string-array|integer-array|item)\b[^>]*\bname\s*=\s*["']([A-Za-z_]\w*)["'][^>]*>/g)){
    const kind=hit[1].includes('array')?'array':hit[1]==='item'?(hit[0].match(/\btype\s*=\s*["']([a-z]+)["']/)?.[1]||'item'):hit[1];
    add(table,kind,hit[2]);
   }
 }
 const refs=[];
 for(const source of sourceTexts)for(const match of source.matchAll(/\bR\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g))refs.push([match[1],match[2]]);
 const missing=[...new Set(refs.filter(([k,v])=>!table[k]?.has(v)).map(([k,v])=>k+'.'+v))];
 if(missing.length)throw Error('Références R absentes des ressources originales : '+missing.slice(0,12).join(', '));
 let n=0,code='package '+namespace+'\n\n/** Symboles temporaires pour validation Kotlin SEULEMENT. Ne pas utiliser dans un APK. */\nobject R {\n';
 for(const type of Object.keys(table).sort()){
  code+='  object '+type+' {\n';
  for(const name of [...table[type]].sort())code+='    const val '+name+': Int = '+(0x7f010000+(n++))+'\n';
  code+='  }\n';
 }
 code+='}\n';
 return {code,symbolCount:n,sourceRefs:refs.length};
}
export function buildDiagnostic(sourceCount,classCount,dexReady){
 return {sourceCount,classCount,dexReady,apkReady:false,resourcesLinked:false};
}
