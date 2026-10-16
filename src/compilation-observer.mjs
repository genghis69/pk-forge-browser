/** Mesure le temps d'attente d'un appel CheerpJ. Aucun faux pourcentage,
 * aucune prétention d'interrompre un thread Java déjà en cours.
 */
export function formatElapsed(ms) {
 const sec=Math.floor(Math.max(0,Number(ms)||0)/1000);
 const min=Math.floor(sec/60),s=String(sec%60).padStart(2,'0');
 return min>=60?Math.floor(min/60)+':'+String(min%60).padStart(2,'0')+':'+s:String(min).padStart(2,'0')+':'+s;
}
export function waitDiagnosis(ms,label='Compilation JVM'){
 const task=String(label);
 const isD8=/\bD8\b|fusion|dépendances/i.test(task);
 if(isD8){
  if(ms<60000)return {severity:'working',message:'D8 travaille sur les bibliothèques. Avancement interne non accessible.'};
  if(ms<180000)return {severity:'slow',message:'D8 analyse les JAR. Plusieurs minutes sont possibles dans CheerpJ.'};
  if(ms<480000)return {severity:'warning',message:'D8 fonctionne peut-être encore. Vérifie les erreurs Java dans F12 et la mémoire de Chrome.'};
  return {severity:'stalled',message:'Plus de 8 minutes sous D8 : un blocage est possible. Le rechargement interrompt la JVM et perd la session.'};
 }
 if(ms<60000)return {severity:'working',message:'Compilation en cours. Aucun pourcentage interne disponible.'};
 if(ms<120000)return {severity:'slow',message:'Plus de 1 minute de compilation.'};
 if(ms<240000)return {severity:'warning',message:'Attente prolongée. Vérifie la mémoire et les exceptions Java dans F12.'};
 return {severity:'stalled',message:'Plus de 4 minutes : un blocage JVM est possible. Recharger interrompt la session.'};
}
export function createExecutionObserver({
 label,onTick=()=>{},onNotice=()=>{},clock=()=>performance.now(),
 schedule=(fn,ms)=>setInterval(fn,ms),unschedule=id=>clearInterval(id),tickMs=1000
}){
 const notifications=[30,60,120,180,240];
 let started=0,active=false,timer=null,nextNotice=0;
 const tick=()=>{
  if(!active)return;
  const elapsed=Math.max(0,clock()-started),d=waitDiagnosis(elapsed,label);
  onTick({...d,label,elapsed,text:formatElapsed(elapsed)});
  while(nextNotice<notifications.length&&elapsed>=notifications[nextNotice]*1000){
   onNotice(label+' : '+formatElapsed(elapsed)+' écoulées. '+d.message);
   nextNotice++;
  }
 };
 return {
  start(){
   if(active)throw Error('Chronomètre de compilation déjà actif.');
   active=true;started=clock();nextNotice=0;tick();timer=schedule(tick,tickMs);
  },
  stop(){
   if(!active)return 0;
   const duration=Math.max(0,clock()-started);
   active=false;if(timer!==null)unschedule(timer);timer=null;
   return duration;
  },
  get active(){return active;}
 };
}
