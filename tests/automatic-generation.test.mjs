import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the actual page handler with browser/provider boundaries controlled.
const source=fs.readFileSync(new URL('../app/key-visual/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='autoGenerate')handler=node.getText(ast);ts.forEachChild(node,visit)}visit(ast);
assert(handler);
const js=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(overrides={}){
 const calls=[],track={readyState:'live',addEventListener(){}},stream={getVideoTracks:()=>[track]};
 const scope={preparingRef:{current:false},working:{current:false},moodUpload:'',moodUploadError:'',cropSrc:'',provider:'openai',status:{generation:true},pin:'',mood:{src:'inspiration'},tray:[],view:{src:'old-capture'},mode:'live',adapter:{current:{capture:async()=>{throw new Error('This configurator did not send a picture.')}}},blobToDataUrl:async()=>'original-car',iframeRef:{current:{}},handleRef:{current:'studio'},streamRef:{current:null},captureVersion:{current:1},configurator:{id:'car',url:'https://car.test'},savedViews:{current:{}},crypto:{randomUUID:()=> 'capture-id'},
 navigator:{mediaDevices:{getDisplayMedia:async()=>{calls.push('permission');return stream}}},highResolutionDisplayOptions:()=>({}),
 snapshotStream:async()=>{calls.push('capture');return 'isolated-car'},
 generate:async(_,refs)=>calls.push({generate:refs}),importPin:async()=>{calls.push('inspiration');return {src:'largest-pin'}},
 setPreparing:v=>calls.push(['preparing',v]),setError:v=>{if(v)calls.push({error:v})},setView:v=>calls.push({view:v}),setSharing:v=>calls.push(['sharing',v]),setAskingToShare:v=>calls.push(['asking',v]),stopSharing:()=>calls.push('stop'),setConnectionOpen:()=>calls.push('connection'),...overrides};
 const context=vm.createContext(scope);vm.runInContext(js,context);return {scope,calls,run:()=>context.autoGenerate(),stream};
}
test('Generate captures then generates once with the fresh reference, without review',async()=>{const h=harness();await h.run();const paid=h.calls.filter(v=>v?.generate);assert.equal(paid.length,1);assert.equal(paid[0].generate.view.src,'isolated-car');assert.equal(paid[0].generate.mood.src,'inspiration');assert(h.calls.indexOf('capture')<h.calls.indexOf(paid[0]));assert.equal(h.scope.preparingRef.current,false);assert.equal(h.scope.streamRef.current,h.stream);assert(!h.calls.includes('stop'))});
test('the configurator adapter’s own picture skips sharing and passes the original to generation',async()=>{const h=harness({adapter:{current:{capture:async()=>{h.calls.push('original');return {blob:{},state:{}}}}}});await h.run();assert(!h.calls.includes('permission'));assert(!h.calls.includes('capture'));assert.equal(h.calls.find(v=>v?.generate).generate.view.src,'original-car')});
test('the screen-share notice shows only while the browser asks, and only when it asks',async()=>{const h=harness();await h.run();const at=v=>h.calls.findIndex(c=>Array.isArray(c)&&c[0]==='asking'&&c[1]===v);assert(at(true)>=0&&at(true)<h.calls.indexOf('permission'));assert(at(false)>h.calls.indexOf('permission'));const again=h.calls.length;await h.run();assert(!h.calls.slice(again).some(c=>Array.isArray(c)&&c[0]==='asking'),'a live share is reused without asking again');const s=harness({adapter:{current:{capture:async()=>({blob:{},state:{}})}}});await s.run();assert(!s.calls.some(c=>Array.isArray(c)&&c[0]==='asking'),'no notice when the configurator sends its own picture')});
test('a live share is reused on the next Generate',async()=>{const h=harness();await h.run();await h.run();assert.equal(h.calls.filter(v=>v==='permission').length,1);assert.equal(h.calls.filter(v=>v==='capture').length,2);assert.equal(h.calls.filter(v=>v?.generate).length,2)});
test('capture failure prevents paid generation and releases the lock',async()=>{const h=harness({snapshotStream:async()=>{throw new Error('Cannot isolate car')}});await h.run();assert(!h.calls.some(v=>v?.generate));assert(h.calls.some(v=>v?.error==='Cannot isolate car'));assert(h.calls.includes('stop'));assert.equal(h.scope.preparingRef.current,false)});
test('changing the car during capture prevents stale paid generation',async()=>{const h=harness();h.scope.snapshotStream=async()=>{h.scope.captureVersion.current++;return 'stale-car'};await h.run();assert(!h.calls.some(v=>v?.generate));assert(h.calls.some(v=>v?.error?.includes('vehicle changed')))});
test('double click cannot start two capture or paid requests',async()=>{let release;const h=harness({snapshotStream:()=>new Promise(r=>release=r)});const first=h.run();await Promise.resolve();await h.run();while(!release)await new Promise(r=>setTimeout(r));release('isolated-car');await first;assert.equal(h.calls.filter(v=>v==='permission').length,1);assert.equal(h.calls.filter(v=>v?.generate).length,1)});
test('Pinterest preparation and existing captured references also generate automatically',async()=>{const h=harness({mode:'capture',pin:'https://pinterest.com/pin/123'});await h.run();assert(!h.calls.includes('permission'));const paid=h.calls.find(v=>v?.generate);assert.equal(paid.generate.view.src,'old-capture');assert.equal(paid.generate.mood.src,'largest-pin')});
