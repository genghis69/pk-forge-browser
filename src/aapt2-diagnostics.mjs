import {isGeneratedPath} from './analyzer.mjs';
export function assessAapt2(analysis){
 if(!analysis?.resourcePaths)throw Error('Importe un ZIP Android.');
 const items=analysis.resourcePaths.filter(p=>!isGeneratedPath(p)).map(path=>{
  const m=path.match(/(?:^|\/)src\/main\/res\/([^/]+)\/([^/]+)$/);
  if(!m)return null;
  const [_,dir,name]=m,kind=dir.split('-')[0];
  const supported=dir==='values'&&name==='strings.xml'||(['drawable','mipmap'].includes(dir)&&/\.(png|jpg|jpeg|webp)$/i.test(name));
  return {path,kind,supported,reason:supported?'Sous-ensemble Google Pack à vérifier':kind==='values'?'Valeurs/styles à lier avec AAPT2':/\.xml$/.test(name)?'Compilation XML binaire et liaison des attributs':'Type de ressource non pris en charge'};
 }).filter(Boolean);
 return {applicationId:analysis.packageName,resourceCount:items.length,blockers:items.filter(x=>!x.supported),items,apkReady:false,
 next:['AAPT2 compile pour layouts et drawables XML','AAPT2 link avec API 36 et génération resources.arsc','Génération R avec IDs de la table','Recompilation Kotlin avec R définitif','D8 runtime définitif','Assemblage et signature APK validés']};
}
export function aapt2Report(analysis){return JSON.stringify({createdAt:new Date().toISOString(),...assessAapt2(analysis),privacy:'Analyse locale uniquement. Aucune source envoyée au serveur.'},null,2);}
