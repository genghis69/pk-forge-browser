import test from 'node:test';
import assert from 'node:assert/strict';
import {formatElapsed,waitDiagnosis,createExecutionObserver} from '../src/compilation-observer.mjs';
test('formatElapsed MM:SS et heures',()=>{
 assert.equal(formatElapsed(0),'00:00');
 assert.equal(formatElapsed(50900),'00:50');
 assert.equal(formatElapsed(125000),'02:05');
 assert.equal(formatElapsed(3609000),'1:00:09');
});
test('Avertir sans prétendre connaître un pourcentage de compilation',()=>{
 assert.equal(waitDiagnosis(45000).severity,'working');
 assert.equal(waitDiagnosis(90000).severity,'slow');
 assert.equal(waitDiagnosis(200000).severity,'warning');
 assert.equal(waitDiagnosis(260000).severity,'stalled');
 assert.ok(!waitDiagnosis(260000).message.includes('%'));
});
test('D8 possède son diagnostic distinct de Kotlin',()=>{
 assert.match(waitDiagnosis(180000,'Fusion D8 des dépendances Android').message,/D8/);
 assert.doesNotMatch(waitDiagnosis(180000,'Fusion D8 des dépendances Android').message,/Kotlin/);
 assert.equal(waitDiagnosis(300000,'Fusion D8 des dépendances Android').severity,'warning');
 assert.equal(waitDiagnosis(600000,'Fusion D8 des dépendances Android').severity,'stalled');
});
test('Chronomètre nettoyé en fin de compilation',()=>{
 let now=0,pulse=null,cleaned=false;const received=[],alerts=[];
 const obs=createExecutionObserver({
  label:'Kotlin',clock:()=>now,
  schedule:fn=>{pulse=fn;return 7;},
  unschedule:id=>{assert.equal(id,7);cleaned=true;},
  onTick:t=>received.push(t),onNotice:m=>alerts.push(m)
 });
 obs.start();assert.equal(received.at(-1).text,'00:00');
 now=61000;pulse();assert.equal(received.at(-1).severity,'slow');
 now=250000;pulse();assert.equal(received.at(-1).severity,'stalled');
 assert.equal(alerts.length,5);
 assert.equal(obs.stop(),250000);assert.equal(cleaned,true);
 const count=received.length;pulse();assert.equal(received.length,count);
});
