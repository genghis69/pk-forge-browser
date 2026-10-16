import test from 'node:test';import assert from 'node:assert/strict';import {assessAapt2} from '../src/aapt2-diagnostics.mjs';
test('ELM327 resources not misrepresented as supported',()=>{
 const root='ELM327/app/src/main/res/';
 const a=assessAapt2({packageName:'com.meziane.elm327obd',resourcePaths:['drawable/bg_field.xml','drawable/bg_panel.xml','layout/activity_main.xml','values/colors.xml','values/strings.xml','values/themes.xml','xml/file_paths.xml'].map(p=>root+p)});
 assert.equal(a.resourceCount,7);assert.equal(a.blockers.length,6);assert.equal(a.apkReady,false);
});
test('Ignore generated resource files',()=>{
 const a=assessAapt2({resourcePaths:['app/build/intermediates/res/layout.xml','app/src/main/res/layout/activity_main.xml']});
 assert.equal(a.resourceCount,1);
});