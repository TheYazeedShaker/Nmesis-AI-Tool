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
 assert.match(read('components/ds/editor.tsx'),/\{sheet \? null : <>\{notice\}\{settings\}<\/>\}/);
});

test('the editor never draws one thing over another: flex boxes do not shrink below their content', () => {
 // The settings list scrolls above Generate; the stage keeps its content and the canvas scrolls.
 assert.match(read('app/design-system.css'),/\.ds-settings-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/);
 const css=read('app/editor.css');
 assert.match(css,/\.ds-canvas-stage > \.editor-stage \{ flex: 1 0 auto; height: auto; min-height: 0; \}/);
 assert.match(css,/\.editor-stage-main \{ flex: 1 0 auto; \}/);
});

test('on phones Generate keeps its cost on screen: the label wraps, the cost stays whole', () => {
 const css=read('app/design-system.css');
 assert.match(css,/\.ds-phone-generate \.ds-btn\.primary \{ flex: 1 1 auto; min-width: 0; white-space: normal;/);
 assert.match(css,/\.ds-phone-generate \.ds-btn\.primary \.ds-btn-meta \{ white-space: nowrap; \}/);
 // check:ui counts a control cut off at the side of the screen as spilling.
 assert.match(read('scripts/ui/checks.mjs'),/cutOff: true/);
});

// design/editor-cleanup (owner, Key visual at 1440): one quality control, help
// where it belongs, and "not available" said once with Generate disabled.
test('clients choose Quality only: engine and model live under Advanced, for staff and own keys', () => {
 const screen=read('components/editor/editor-screen.tsx');
 assert.match(screen,/export function Advanced\(\{name,summary='Engine and model',children\}[^)]*\)\{\n if\(!providerNames\(useAccount\(\)\)\)return null;/);
 for(const f of ['app/key-visual/page.tsx','app/lineup/page.tsx','app/films/page.tsx','app/swap/page.tsx','app/storyboard/page.tsx','components/editor/lineup-parts.tsx','components/editor/storyboard-settings.tsx']){
  const src=read(f);
  assert.doesNotMatch(src,/SettingsSection title="(Engine|Model|Video connection)"/,f);
  assert.doesNotMatch(src,/Connections and usage|Connection and settings<\/a>/,f);
 }
 assert.match(read('app/key-visual/page.tsx'),/<Advanced name="visuals"><VisualsEngine /);
 assert.match(read('app/key-visual/page.tsx'),/<Advanced name="visuals-refine"><VisualsEngine /);
 assert.match(read('app/lineup/page.tsx'),/<Advanced name="lineup"><LineupEngine /);
 assert.match(read('app/films/page.tsx'),/<Advanced name="film" /);
 assert.match(read('app/swap/page.tsx'),/<Advanced name="swap" summary="Video connection"><SwapConnectionSection /);
 assert.match(read('components/editor/storyboard-settings.tsx'),/<Advanced name="story" /);
 // The model's words are its field's help, not a loose line at the end.
 assert.match(read('components/editor/visuals-engine.tsx'),/<Field label=\{names\?'Image model':'Model'\} help=\{names\?named:plain\}>/);
});

test('when Generate cannot run: one notice at the top of the settings, and the button disabled with that reason', () => {
 const screen=read('components/editor/editor-screen.tsx');
 for(const words of ['Your plan has ended','No credits left this month','You can look, not generate','Your Studio isn’t part of your plan yet'])assert.ok(screen.includes(words),words);
 assert.match(screen,/notice=\{why&&<GenerateNotice blocked=\{why\}\/>\}/);
 assert.match(screen,/blocked=\{why\}\/>\}\/>;/);
 // A company's own key: credits never stop it.
 assert.match(screen,/!\(payer&&credits\?\.billing\[payer\]==='own key'\)/);
 const ds=read('components/ds/editor.tsx');
 assert.match(ds,/disabled=\{disabled \|\| !!blocked\}/);
 assert.match(ds,/aria-describedby=\{blocked \? reason : undefined\}/);
 // No grey line under a button that cannot run.
 assert.match(ds,/\{blocked \? <span id=\{reason\} className="ds-sr-only">\{blocked\.title\}\. \{blocked\.body\}<\/span> : note && /);
 for(const f of ['app/key-visual/page.tsx','app/lineup/page.tsx','app/films/page.tsx','app/swap/page.tsx'])assert.match(read(f),/blocked=\{blocked\}/,f);
 assert.doesNotMatch(read('app/swap/page.tsx'),/:connection&&!available?'Car swap/);
});
