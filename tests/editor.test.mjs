import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Phase 3 group 2: the one editor talks to the configurator only through the
// adapter (components/editor/configurator.ts). Today's adapter drives the
// in-iframe capture flow; the remote-control adapter will be a swap.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function loadAdapter(requestFrameCapture){
 const js=ts.transpileModule(read('components/editor/iframe-configurator.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 const require=(name)=>{if(name==='@/lib/capture')return {requestFrameCapture};throw new Error('unexpected import '+name)};
 new Function('module','exports','require',js)(mod,mod.exports,require);
 return mod.exports.iframeConfigurator;
}

test('the adapter has the protocol’s functions, and only those, for the editor to call', () => {
 const iface=read('components/editor/configurator.ts');
 for(const fn of ['getOptions():','setColour(id:string)','setTrim(id:string)','setView(id:string)','setFrame(frame:number)','capture():'])assert.ok(iface.includes(fn),fn);
});

test('today’s adapter: options come from inside the configurator; capture uses the iframe handshake', async () => {
 const png='data:image/png;base64,'+Buffer.from('not really a png').toString('base64');
 let asked=null;
 const iframeConfigurator=loadAdapter(async(frame,url)=>{asked={frame,url};return {image:png,angle:'Front 3/4',finish:'Lime'}});
 const frame={id:'frame'};
 const a=iframeConfigurator(()=>frame,()=>'https://config.example/demo');
 assert.equal(a.controlsInEditor,false);
 assert.deepEqual(await a.getOptions(),{colours:[],trims:[],views:[],frames:0});
 for(const set of [a.setColour,a.setTrim,a.setView])await assert.rejects(set('x'),/Choose this in the configurator/);
 await assert.rejects(a.setFrame(3),/Choose this in the configurator/);
 const shot=await a.capture();
 assert.deepEqual(asked,{frame,url:'https://config.example/demo'});
 assert.equal(shot.blob.type,'image/png');
 assert.deepEqual(shot.state,{view:'Front 3/4',colour:'Lime'});
 a.dispose();
 await assert.rejects(a.capture(),/closed/);
});

test('a configurator that sends nothing, or something else, is a plain error', async () => {
 const none=loadAdapter(async()=>null)(()=>({}),()=>'https://config.example/');
 await assert.rejects(none.capture(),/did not send a picture/);
 const odd=loadAdapter(async()=>({image:'data:image/svg+xml;base64,AA=='}))(()=>({}),()=>'https://config.example/');
 await assert.rejects(odd.capture(),/cannot read/);
 const closed=loadAdapter(async()=>null)(()=>null,()=>'https://config.example/');
 await assert.rejects(closed.capture(),/Open a configurator first/);
});

test('the five tools are the one editor, and reach the configurator only through the adapter', () => {
 const pages={visuals:'app/key-visual/page.tsx',lineup:'app/lineup/page.tsx',films:'app/films/page.tsx',swap:'app/swap/page.tsx',storyboard:'app/storyboard/page.tsx'};
 for(const [tool,file] of Object.entries(pages)){
  const s=read(file);
  assert.match(s,new RegExp(`<WorkspaceFrame current="${tool}" bleed`),file);
  assert.match(s,/<EditorScreen /,file);
  assert.match(s,/<SaveToProject /,file);
  assert.doesNotMatch(s,/requestFrameCapture/,file+' captures without the adapter');
 }
 // Settings are drawn once: in the side panel, or in the phone sheet while it is open.
 assert.match(read('components/ds/editor.tsx'),/\{sheet \? null : settings\}/);
});
