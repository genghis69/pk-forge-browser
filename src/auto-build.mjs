/**
 * Orchestrateur sans moteur fictif. Les opérations sont réellement exécutées
 * dans le navigateur, dans l'ordre, et interrompues à la première erreur.
 */
export async function runAutomaticApkBuild({project,prepareResources,compileKotlin,compileDex,assembleApk,onPhase=()=>{}}){
 if(!project?.zip||!project?.analysis||!project?.files)
  throw Error('Importe un ZIP Android valide avant la compilation automatique.');
 const steps=[
  {name:'AAPT2 : compilation des ressources Android',run:()=>prepareResources(project)},
  {name:'Kotlin : compilation du code avec les vrais identifiants R',run:()=>compileKotlin(project)},
  {name:'D8 : intégration des bibliothèques et génération des DEX',run:()=>compileDex(project)},
 ];
 let resourceSession=null,artifacts=null;
 for(let i=0;i<steps.length;i++){
  const step=steps[i];onPhase({phase:i+1,total:4,name:step.name,status:'running'});
  try{
   const result=await step.run();
   if(i===0){
    resourceSession=result;
    if(!resourceSession?.ids||!Object.keys(resourceSession.ids).length)
     throw Error('AAPT2 n’a pas renvoyé de véritables identifiants R.');
   }
   if(i===2){
    artifacts=result;
    if(!artifacts?.runtimeZip||artifacts?.linkedResourceSession!==resourceSession||
       artifacts?.sourceZip!==project.zip)
     throw Error('Les DEX ne correspondent pas aux ressources réelles de ce ZIP.');
   }
   onPhase({phase:i+1,total:4,name:step.name,status:'done'});
  }catch(error){
   onPhase({phase:i+1,total:4,name:step.name,status:'error',error});
   throw error;
  }
 }
 const phase=4,name='APK : assemblage, vérification et signature';
 onPhase({phase,total:4,name,status:'running'});
 try{
  const apk=await assembleApk(project,artifacts);
  if(!apk||!Number.isFinite(apk.size)||apk.size<100)
   throw Error('Aucun APK signé valide produit.');
  onPhase({phase,total:4,name,status:'done'});
  return apk;
 }catch(error){
  onPhase({phase,total:4,name,status:'error',error});
  throw error;
 }
}
