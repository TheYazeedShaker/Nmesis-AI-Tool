// design/finish-pass, items 10, 13 and 14: the "needs a plan upgrade" page,
// Home's tool pictures and prompt, and Story's one primary action, one car
// control and a canvas bar that fits 1024–1440.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FEATURE_TOOL,briefPlaceholder,toolSample} from '../lib/tool-samples.ts';
import {boardVehicle,isCompanyCar} from '../lib/story-vehicle.ts';
import {DEMO_CONFIGURATOR} from '../lib/configurators.ts';

const ROOT=new URL('../',import.meta.url);
const rootPath=path.resolve(new URL('.',ROOT).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const read=(rel)=>readFileSync(new URL(rel,ROOT),'utf8');
const nodeRequire=createRequire(import.meta.url);
const cache=new Map();
// The components as the browser gets them, drawn on the server (as in quick-fixes.test.mjs).
function load(file){
 const abs=path.resolve(file);
 if(cache.has(abs))return cache.get(abs).exports;
 const mod={exports:{}};cache.set(abs,mod);
 const code=ts.transpileModule(readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=(spec)=>{
  const target=spec.startsWith('@/')?path.join(rootPath,spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(abs),spec):null;
  if(!target)return nodeRequire(spec);
  if(target.endsWith('.json')&&existsSync(target))return JSON.parse(readFileSync(target,'utf8'));
  for(const ext of ['.tsx','.ts','/index.ts',''])if(existsSync(target+ext)&&/\.(tsx?|mjs|js)$/.test(target+ext))return load(target+ext);
  throw new Error(`Cannot resolve ${spec} from ${abs}`);
 };
 new Function('require','module','exports',code)(req,mod,mod.exports);
 return mod.exports;
}
const h=React.createElement,html=(el)=>renderToStaticMarkup(el);
const PROVIDERS=/OpenAI|Google|Gemini|Higgsfield|Topaz|Kling|Nano Banana/;

// ── Home and the upgrade page: one picture helper ──────────────────────────
const cars=[{name:'Demo SUV',picture:'/api/cars/demo.suv/picture',brandId:'demo'},{name:'Demo Coupe',picture:'/api/cars/demo.coupe/picture',brandId:'demo'},{name:'Demo Van',brandId:'demo'}];

test('a tool’s picture is fixed: one of the company’s cars in the tool’s own place, never its latest work (fix/studio-editor-fixes)', () => {
 // Only cars with a picture count; each tool has its fixed place among them.
 assert.deepEqual(toolSample('Key visual',cars),{from:'car',src:'/api/cars/demo.suv/picture'});
 assert.deepEqual(toolSample('Line-up',cars),{from:'car',src:'/api/cars/demo.coupe/picture'});
 assert.deepEqual(toolSample('Story',cars),{from:'car',src:'/api/cars/demo.suv/picture'});
 assert.deepEqual(toolSample('Line-up',[{name:'Demo Van'}]),{from:'none'});
 assert.deepEqual(toolSample(undefined,cars),{from:'none'});
 // Nothing about the company's work goes in, so a new generation or edit can't change a card's picture.
 assert.equal(toolSample.length,2);
 assert.doesNotMatch(read('lib/tool-samples.ts'),/SampleWork|finished/);
 assert.doesNotMatch(read('components/workspace/pages.tsx'),/asSamples/);
 assert.doesNotMatch(read('components/workspace/samples.ts'),/api\/library/);
 // Every tool on Home and every gated page has its library name.
 for(const f of ['studio.key_visuals','studio.lineups','studio.storyboards','studio.film','studio.swap','studio.smart_reference'])assert.ok(FEATURE_TOOL[f],f);
});

test('Home: each tool card shows its sample in a fixed box (lazy, sized, no layout shift), never the olive box', () => {
 const pages=read('components/workspace/pages.tsx'),home=read('components/workspace/home.tsx'),pic=read('components/workspace/car-picture.tsx'),css=read('app/workspace.css');
 assert.match(pages,/sample:toolSample\(FEATURE_TOOL\[feature\],cars\)\.src/);
 assert.match(pages,/cars=presets\.filter\(c=>!isDemoConfigurator\(c\)\)/);
 assert.match(home,/<SamplePicture src=\{tool\.sample\} className="ds-tool-art" fallback=\{tool\.icon\}\/>/);
 // One tile component for locked and open tools alike (components/ds/tool-tile.tsx), so both are one size.
 assert.equal((home.match(/<ToolArt tool=\{t\}\/>/g)||[]).length,1);
 assert.match(home,/<ToolTile name=\{t\.name\} line=\{t\.line\} href=\{t\.locked\?undefined:t\.href\} locked=\{t\.locked\} soon=\{t\.soon\} cost=\{t\.cost\} art=\{<ToolArt tool=\{t\}\/>\}\/>/);
 assert.match(pic,/<img src=\{shown\} alt="" width=\{320\} height=\{200\} loading="lazy" decoding="async"/);
 assert.match(read('app/design-system.css'),/\.ds-tool-art \{ aspect-ratio: 16 \/ 10;/);
 assert.match(css,/\.ds-tool-art > img \{ width: 100%; height: 100%; object-fit: cover;/);
 assert.doesNotMatch(css,/\.ds-tool-art \{ background: var\(--ds-accent-soft\)/);
 // The upgrade page uses the same helper.
 assert.match(read('components/workspace/samples.ts'),/return toolSample\(FEATURE_TOOL\[feature\],cars\);/);
});

test('Home’s prompt names one of the company’s cars, or none', () => {
 assert.equal(briefPlaceholder(cars),'Demo SUV on a coast road at dusk…');
 assert.equal(briefPlaceholder([{name:'Other Hatch',brandId:'other'},{name:'Demo Van',brandId:'demo'}],'demo'),'Demo Van on a coast road at dusk…','the brand the company works as first');
 assert.equal(briefPlaceholder([{name:'Demo Demo Wagon'}]),'Demo Wagon on a coast road at dusk…','a doubled brand is mended (lib/car-names.ts)');
 assert.equal(briefPlaceholder([]),'Your car on a coast road at dusk…');
 assert.match(read('components/workspace/pages.tsx'),/placeholder=\{briefPlaceholder\(cars,account\?\.brand\?\.id\)\}/);
 assert.match(read('components/workspace/home.tsx'),/placeholder=\{placeholder\}/);
 assert.doesNotMatch(read('components/workspace/home.tsx'),/placeholder="The Demo SUV/);
});

// ── The "needs a plan upgrade" page ────────────────────────────────────────
test('PlanGate draws the upgrade page in the workspace frame', () => {
 const gate=read('components/studio-account.tsx');
 assert.match(gate,/if\(hasFeature\(account,feature\)\)return <>\{children\}<\/>;\n return <UpgradePage feature=\{feature\} plan=\{account!\.upsell\[feature\]\} ended=\{planEnded\(account\)\}\/>;/);
 assert.doesNotMatch(gate,/className="plan-gate"/);
 const page=read('components/workspace/upgrade.tsx');
 assert.match(page,/<WorkspaceFrame current=\{ABOUT\[props\.feature\]\?\.page\?\?'home'\} notices=\{<AccountNotices variant="ds"\/>\}><UpgradeView \{\.\.\.props\} sample=\{sample\.src\}\/><\/WorkspaceFrame>/);
 assert.match(page,/const sample=useToolSample\(props\.feature\);/);
});

test('the upgrade page: what the tool does, a picture, the plan that has it and Ask Nmesis; an ended plan says so (F-051)', () => {
 const {UpgradeView}=load(path.join(rootPath,'components/workspace/upgrade.tsx'));
 const lacks=html(h(UpgradeView,{feature:'studio.storyboards',plan:'Enterprise',ended:false,sample:'/t/story'}));
 assert.match(lacks,/<h1 class="ds-hero-title">Enterprise includes storyboards<\/h1>/);
 assert.match(lacks,/Plan a short film shot by shot\./);
 assert.match(lacks,/<img src="\/t\/story"/);
 assert.match(lacks,/Available on Enterprise/);
 assert.match(lacks,/>Ask Nmesis</);
 assert.match(lacks,/href="\/"/);
 assert.doesNotMatch(lacks,/Plan ended|has ended/);
 assert.doesNotMatch(lacks,PROVIDERS,'F-050');
 const ended=html(h(UpgradeView,{feature:'studio.film',plan:'Enterprise',ended:true}));
 assert.match(ended,/Your Studio plan has ended/);
 assert.match(ended,/New work, including film studio, is paused\. Ask Nmesis to renew your company’s plan\./);
 assert.match(ended,/Plan ended/);
 assert.doesNotMatch(ended,/Available on/);
 assert.match(ended,/data-sample="none"/,'no picture: the neutral placeholder');
 assert.doesNotMatch(ended,PROVIDERS,'F-050');
});

// ── Story ──────────────────────────────────────────────────────────────────
test('Story: Generate ("Plan the shots") is the one primary action; the canvas has no second one', () => {
 const page=read('app/storyboard/page.tsx'),car=read('components/editor/storyboard-car.tsx');
 assert.match(page,/verb:'Plan the shots'/);
 assert.doesNotMatch(car,/Create your story/);
 assert.doesNotMatch(car,/onNext/);
 assert.doesNotMatch(page,/onNext=/);
 // StoryCar's only primary button is in its crop dialog's footer.
 assert.deepEqual(car.match(/kind="primary"[^>]*>[^<]*/g),['kind="primary" icon={<Check aria-hidden="true"/>} busy={busy===\'upload\'} onClick={()=>void addView()}>Add car view']);
});

test('Story’s canvas bar: name, stage switch and Save to project, the rest under one “More actions” menu', () => {
 const page=read('app/storyboard/page.tsx');
 const bar=page.slice(page.indexOf(' const bar=<>'),page.indexOf(' const stage='));
 assert.ok(bar.length>100,'the bar is found');
 assert.match(bar,/<NameField /);
 assert.match(bar,/className="ds-segmented editor-stage-switch"/);
 assert.match(bar,/<SaveToProject /);
 assert.equal((bar.match(/<Menu /g)||[]).length,1);
 assert.match(bar,/<Menu label="More actions" trigger=\{<MoreHorizontal aria-hidden="true"\/>\} size="sm">/);
 for(const item of ['Save changes','New story','Download the finished film','Deleted stories','Delete story'])assert.match(bar,new RegExp(`<MenuItem .*>${item}</MenuItem>`),item);
 assert.doesNotMatch(bar,/<Button /,'no loose buttons in the bar');
 assert.doesNotMatch(bar,/kind="primary"/);
 // Delete and Deleted keep their Undo and drawer (TrashControls), drawn as menu items.
 assert.match(bar,/<TrashControls kind="storyboards" [^\n]*>\n {4}\{trash=><Menu /);
 assert.match(read('components/trash-controls.tsx'),/\{children\?children\(\{remove:\(\)=>void remove\(\),show:\(\)=>void show\(\),busy:busy\|\|!!item\?\.busy,words\}\):<>/);
 // The phone rule stays: the bar never goes past a 360 screen.
 assert.match(read('app/editor.css'),/\.editor-bar-actions \{ flex-wrap: wrap; row-gap: var\(--ds-space-4\); min-width: 0; max-width: 100%; \}/);
});

test('Story has one car control: the free-text car field only without a configurator car; the vehicle follows the car', () => {
 const company=[{id:'demo.suv',name:'Demo SUV',url:'https://configurator.example.com/suv/'},{id:'demo.coupe',name:'Demo Coupe',url:'https://configurator.example.com/coupe/'}];
 assert.equal(isCompanyCar(company,company[1].url),true);
 assert.equal(isCompanyCar(company,'https://configurator.example.com/gone/'),false,'a story saved on a car no longer listed');
 assert.equal(isCompanyCar([DEMO_CONFIGURATOR],DEMO_CONFIGURATOR.url),false,'no cars yet: the placeholder');
 const board={vehicle:'typed earlier',configurator:company[1].url,shots:[]};
 assert.equal(boardVehicle(board,company),'Demo Coupe');
 assert.equal(boardVehicle({...board,shots:[{}]},company),'typed earlier','planned: a changed vehicle would reset the images');
 assert.equal(boardVehicle({...board,configurator:DEMO_CONFIGURATOR.url},[DEMO_CONFIGURATOR]),'typed earlier');
 const settings=read('components/editor/storyboard-settings.tsx');
 assert.match(settings,/typed=!isCompanyCar\(cars,car\.url\)/);
 assert.match(settings,/\{typed&&<SettingsSection title="Your car" id="story-vehicle-title">/);
 // Saved with the chosen car's name, so the planner still gets it.
 assert.match(read('app/storyboard/page.tsx'),/const body=\{\.\.\.value,vehicle:boardVehicle\(value,presets\)\};/);
});
