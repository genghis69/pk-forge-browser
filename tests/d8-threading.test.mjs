import test from 'node:test';
import assert from 'node:assert/strict';
import {d8ThreadFlags,d8ThreadDescription} from '../src/d8-threading.mjs';
import {readFileSync} from 'node:fs';
test('D8 CheerpJ defaults to one thread, without pretending faster',()=>{
 assert.deepEqual(d8ThreadFlags(),['--thread-count','1']);
 assert.deepEqual(d8ThreadFlags('2'),['--thread-count','2']);
 assert.deepEqual(d8ThreadFlags('auto'),[]);
 assert.match(d8ThreadDescription('1'),/expérimental/);
});
test('Unsupported thread count rejected before JVM execution',()=>{
 assert.throws(()=>d8ThreadFlags('64'),/non pris en charge/);
 assert.throws(()=>d8ThreadFlags('0'),/non pris en charge/);
 assert.throws(()=>d8ThreadFlags('--output'),/non pris en charge/);
});
test('D8 standalone and runtime both consume user-selected threading and display log',()=>{
 const src=readFileSync('src/android-compiler.mjs','utf8');
 const html=readFileSync('index.html','utf8');
 assert.match(src,/d8ThreadFlags/);
 assert.match(src,/selectedD8ThreadMode/);
 assert.match(src,/--min-api.*d8ThreadFlags/s);
 assert.match(html,/id="androidD8Threads"/);
 assert.match(html,/<option value="1" selected>/);
});
