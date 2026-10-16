/**
 * D8 compiler threading control for browser-hosted CheerpJ.
 * D8 8.13.x accepts --thread-count <n>. Single-thread mode is a
 * compatibility experiment, NOT a performance guarantee.
 */
export const D8_THREAD_CHOICES=['1','2','auto'];
export function d8ThreadFlags(input='1'){
 const selected=String(input??'1').trim();
 if(!D8_THREAD_CHOICES.includes(selected))throw Error('Nombre de threads D8 non pris en charge : '+selected);
 return selected==='auto'?[]:['--thread-count',selected];
}
export function d8ThreadDescription(input='1'){
 return input==='auto'?'automatique (configuration D8 par défaut)':input+' thread(s) Java (mode expérimental CheerpJ)';
}
