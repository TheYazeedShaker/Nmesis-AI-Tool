// Editor Phase 3: fonts, colour and text effects (feat/editor-fonts-colour-effects).
//  - The font catalogue: about 150 open-licence families, self-hosted as WOFF2 with
//    their licences, a manifest of family, styles, weights, licence and source; the
//    nine brand-kit fonts under their own names; Arabic-capable families.
//  - No request to the font service's hosts, anywhere in the Studio's source (the
//    browser side is enforced by check:ui's network log, scripts/check-ui.mjs).
//  - Loading: only the file a design needs, a missing font said (never a silent
//    swap), Save/Duplicate/Download wait for every font.
//  - The format: the new settings are optional fields of format v2, so every design
//    saved before opens exactly as it was; each change is one undo step; no address.
//  - Effects: every amount is in proportion to the text's size, so the canvas and the
//    export (the same nodes at the picture's pixel ratio) draw the same picture.
//  - Colours: hex with transparency, the contrast hint (4.5:1), gradients.
// Synthetic data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import * as D from '../lib/editor/doc.ts';
import * as H from '../lib/editor/history.ts';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url});
// Loaded after the hooks: these import their neighbours without an extension (and the JSON catalogue), as the app does.
const F=await import('../lib/editor/fonts.ts'),E=await import('../lib/editor/effects.ts'),C=await import('../lib/editor/colour.ts'),{BRAND_FONTS}=await import('../lib/brand-kit.ts');
const read=(rel)=>readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const exists=(rel)=>existsSync(new URL('../'+rel,import.meta.url));
const PICTURE={id:'00000000-0000-4000-8000-000000030000',width:1536,height:864};
const canon=(v)=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:1)):x);

// ── The catalogue ────────────────────────────────────────────────────────
test('the catalogue: about 150 open-licence families, each with its files, preview and licence on the Studio’s own address',()=>{
 const m=JSON.parse(read('lib/editor/font-catalogue.json'));
 assert.ok(F.FONTS.length>=140&&F.FONTS.length<=170,`${F.FONTS.length} families`);
 assert.equal(new Set(F.FONTS.map(f=>f.family)).size,F.FONTS.length,'each family once');
 assert.equal(new Set(F.FONTS.map(f=>f.id)).size,F.FONTS.length,'each id once');
 let bytes=0;
 for(const f of m.families){
  assert.ok(['OFL-1.1','Apache-2.0'].includes(f.licence),`${f.family}: ${f.licence}`);
  assert.ok(exists(`public/fonts/${f.id}/${f.licenceFile}`),`${f.family}: its licence ships with its fonts`);
  assert.match(read(`public/fonts/${f.id}/${f.licenceFile}`),f.licence==='OFL-1.1'?/SIL OPEN FONT LICENSE/i:/Apache License/i);
  assert.match(f.source,/^https:\/\/github\.com\/google\/fonts\/tree\/main\/(ofl|apache)\/[a-z0-9]+$/,'the official repository folder it was built from');
  assert.ok(f.files.length>0&&exists(`public/fonts/${f.id}/${f.preview.file}`));
  for(const x of f.files){
   assert.match(x.file,/\.woff2$/);
   const size=statSync(new URL(`../public/fonts/${f.id}/${x.file}`,import.meta.url)).size;
   assert.equal(size,x.bytes,`${f.family}: ${x.file} is the file the manifest describes`);
   assert.equal(readFileSync(new URL(`../public/fonts/${f.id}/${x.file}`,import.meta.url)).subarray(0,4).toString('latin1'),'wOF2');
   bytes+=size;
  }
  assert.ok(f.preview.bytes<16_000,`${f.family}: the list’s preview is small (${f.preview.bytes} bytes)`);
  assert.ok(f.weights.length>=1&&f.weights.every(w=>w>=100&&w<=1000));
  if(f.variable)assert.ok(f.weights.every(w=>w>=f.variable.min&&w<=f.variable.max),`${f.family}: the weight control stays on its axis`);
  assert.equal(f.italic,f.files.some(x=>x.style==='italic'),`${f.family}: italic only when it has one`);
 }
 assert.ok(bytes<30*1024*1024,`the whole set is ${Math.round(bytes/1024/1024)} MB`);
 // The nine fonts of the brand kit's list (System is the device's own) keep their names.
 for(const b of BRAND_FONTS)if(b!=='System')assert.ok(F.fontByName(b),`${b} is in the catalogue`);
 // Arabic for clients in the Gulf and Egypt.
 for(const a of ['Noto Kufi Arabic','Cairo','Tajawal','IBM Plex Sans Arabic','Almarai'])assert.equal(F.fontByName(a)?.arabic,true,`${a} writes Arabic`);
 assert.ok(F.FONTS.filter(f=>f.arabic).length>=20);
 for(const k of ['sans','serif','display','script','mono'])assert.ok(F.FONTS.some(f=>f.kind===k),k);
 // The build script and its list are in the repository, so the set can be built again.
 assert.match(read('scripts/fonts/build-catalogue.mjs'),/raw\.githubusercontent\.com\/google\/fonts\/main/);
 assert.match(read('scripts/fonts/build-catalogue.mjs'),/OFL: \{[^}]*\}, APACHE2: \{/,'only the two licences');
});

test('no request to the font service: nothing in the Studio names its hosts, and the interface fonts are the catalogue’s files',()=>{
 const HOSTS=/fonts\.googleapis\.com|fonts\.gstatic\.com/;
 const walk=(dir)=>readdirSync(new URL('../'+dir,import.meta.url),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
 for(const f of [...walk('app'),...walk('components'),...walk('lib'),...walk('public').filter(x=>/\.(css|js|html|json|svg)$/.test(x)),'next.config.ts','proxy.ts']){
  if(!/\.(tsx?|mjs|js|css|json|html|svg)$/.test(f))continue;
  assert.doesNotMatch(read(f),HOSTS,`${f} names the font service`);
  assert.doesNotMatch(read(f),/next\/font\/google/,`${f} uses next/font/google, which fetches from the font service at build time`);
 }
 const ui=read('app/brand-fonts.ts');
 assert.match(ui,/import localFont from "next\/font\/local"/);
 // The interface fonts' descriptors are the catalogue's own files and ranges.
 for(const [name,v] of [['Inter','--font-inter'],['Outfit','--font-outfit']]){
  const f=F.fontByName(name);
  for(const x of f.files.filter(x=>name==='Inter'||x.style==='normal'))assert.ok(ui.includes(`{path:"../public/fonts/${f.id}/${x.file}",weight:"${x.weight[0]} ${x.weight[1]}",style:"${x.style}"}`),`${name} ${x.style}`);
  assert.match(ui,new RegExp(`variable:"${v}"`));
 }
 assert.match(ui,/preload:false/,'a page downloads a font only when it draws it');
 assert.match(read('app/layout.tsx'),/className=\{fontVariables\}/);
 // The check in the browser: check:ui fails on any request to those hosts.
 const harness=read('scripts/check-ui.mjs');
 assert.match(harness,/const FONT_SERVICE = \/.*fonts\\\.googleapis\\\.com.*fonts\\\.gstatic\\\.com/);
 assert.match(harness,/if \(FONT_SERVICE\.test\(u\.hostname\)\) fontServiceRequests\.push/,'every page’s requests are watched');
 assert.match(harness,/if \(fontServiceRequests\.length\) \{[^}]*exitCode = 1; \}/,'and any one fails the run');
});

// ── Loading ──────────────────────────────────────────────────────────────
test('a font loads only the one file it needs; a name not in the catalogue is a missing font, never a silent swap',async()=>{
 const poppins=F.fontByName('Poppins'),inter=F.fontByName('Inter'),oswald=F.fontByName('Oswald');
 assert.equal(F.fileFor(poppins,600,false).file,'poppins-600-normal.woff2');
 assert.equal(F.fileFor(poppins,650,true).file,'poppins-600-italic.woff2','the nearest weight it really has');
 assert.equal(F.fileFor(inter,550,false).file,'inter-normal.woff2','a variable family: one file for its whole axis');
 assert.equal(F.fileFor(oswald,700,true).file,'oswald-normal.woff2','no italic: upright');
 assert.equal(F.nearestWeight('Oswald',900),700,'kept on Oswald’s axis');
 assert.deepEqual(F.weightsOf('Oswald'),[200,300,400,500,600,700]);
 assert.equal(F.canvasFontFamily('Poppins'),'"nm-poppins", "nm-inter", sans-serif','its own files first, then the fallback');
 assert.equal(F.canvasFontFamily('Inter'),'"nm-inter", sans-serif');
 assert.equal(F.cssFontFamily('Cairo'),'"nm-cairo", "nm-inter", var(--ds-font-sans)');
 assert.equal(F.canvasFontFamily('Comic Demo'),'"nm-inter", sans-serif','an unknown name draws in the fallback…');
 assert.equal(F.isKnownFont('Comic Demo'),false,'…and is said to be missing');
 let doc=D.createDoc(PICTURE);
 doc=D.addLayer(doc,{kind:'text',style:'heading',font:'Playfair Display'},'h');
 doc=D.addLayer(doc,{kind:'text',style:'body',font:'Cairo'},'b');
 doc=D.addLayer(doc,{kind:'text',style:'body',font:'Comic Demo'},'u');
 assert.deepEqual(F.fontsInDoc(doc),[{font:'Playfair Display',weight:700,italic:false},{font:'Cairo',weight:400,italic:false},{font:'Comic Demo',weight:400,italic:false}]);
 const load=async(n)=>n.font==='Comic Demo'?{ok:false,reason:'unknown'}:n.font==='Cairo'?{ok:false,reason:'timeout'}:{ok:true};
 assert.deepEqual(await F.settleFonts(doc,load),{failed:['Cairo','Comic Demo']});
 assert.deepEqual(await F.settleFonts(doc,async()=>{throw new Error('offline')}),{failed:['Playfair Display','Cairo','Comic Demo']},'never rejects');
 assert.match(F.fallbackNotice(['Cairo']),/^Missing font: Cairo couldn’t load, so its text shows in Inter for now\./);
 assert.equal(F.exportFallbackNotice(['Cairo','Lato']),'Made with Inter in place of Cairo and Lato, which couldn’t load.');
 assert.equal(F.exportFallbackNotice([]),null);
 // The export waits: nothing is drawn before every font is settled and the canvas shows it.
 const events=[];
 const {failed}=await F.exportWithFonts(doc,{load:async(n)=>{events.push('load '+n.font);return load(n)},ready:async()=>{events.push('ready')},draw:async()=>{events.push('draw');return 1}});
 assert.deepEqual(failed,['Cairo','Comic Demo']);
 assert.equal(events.indexOf('draw'),events.length-1);assert.ok(events.indexOf('ready')<events.indexOf('draw'));
 // The browser side: a FontFace per file from /fonts/<id>/, a timeout, the console says which; the canvas,
 // the layer and the panel say "Missing font"; Save, Duplicate and Download all export through the wait.
 const browser=read('components/canvas/fonts.ts'),page=read('components/canvas/editor-page.tsx');
 assert.match(browser,/new FontFace\(family,`url\(\$\{url\}\) format\("woff2"\)`/);assert.match(browser,/timeout\(FONT_LOAD_MS\)/);
 assert.match(browser,/console\.warn\('\[editor\] a font is missing'/);
 assert.match(page,/exportWithFonts\(doc,\{load:loadCanvasFont,ready:fonts\.whenReady,draw:/);
 assert.match(page,/exportFallbackNotice\(failed\)/);
 assert.match(page,/canvas-missing-font/);assert.match(read('components/canvas/layers-panel.tsx'),/Missing font/);assert.match(read('components/canvas/font-picker.tsx'),/Missing font/);
 assert.match(read('components/canvas/stage.tsx'),/<Text key=\{key\}/,'the text is measured again once its font arrives');
});

test('the font list: Brand fonts → In this design → Recent → All fonts, one search across them',()=>{
 let doc=D.createDoc(PICTURE);
 doc=D.addLayer(doc,{kind:'text',style:'heading',font:'Cairo'},'a');
 const kit={headingFont:'Montserrat',bodyFont:'Lato'};
 const s=F.fontSections({kit,doc,recent:['Oswald','Comic Demo'],query:''});
 assert.deepEqual(s.map(x=>x.title),['Brand fonts','In this design','Recent','All fonts']);
 assert.deepEqual(s[0].fonts.map(f=>f.family),['Montserrat','Lato']);
 assert.deepEqual(s[1].fonts.map(f=>f.family),['Cairo']);
 assert.deepEqual(s[2].fonts.map(f=>f.family),['Oswald'],'a recent name the catalogue doesn’t have is left out');
 assert.equal(s[3].fonts.length,F.FONTS.length);
 const arabic=F.fontSections({kit,doc,recent:[],query:'arabic'});
 assert.deepEqual(arabic.map(x=>x.id),['design','all'],'the search narrows every section; empty ones go');
 assert.ok(arabic[1].fonts.every(f=>f.arabic));
 assert.deepEqual(F.fontSections({kit,doc,recent:[],query:'zzz'}),[]);
 const serif=F.fontSections({kit:null,doc,recent:[],query:'serif'}).find(x=>x.id==='all').fonts;
 assert.ok(serif.some(f=>f.family==='Lora')&&serif.every(f=>f.kind==='serif'),'serif is serif, not sans serif');
 assert.deepEqual(F.withRecent(['Lato','Oswald'],'Oswald'),['Oswald','Lato']);
 assert.equal(F.withRecent(Array.from({length:20},()=>'Lato'),'Cairo').length,2);
 assert.equal(F.brandRole('Lato',kit),'Brand body text');
 // Each name in its own font from the tiny preview file, loaded when its row is on screen.
 const picker=read('components/canvas/font-picker.tsx');
 assert.match(picker,/new IntersectionObserver/);assert.match(picker,/loadPreview\(font\)/);
 assert.match(picker,/role="combobox"[\s\S]*aria-activedescendant/,'the list by keyboard: the search keeps the focus');
});

// ── The format ───────────────────────────────────────────────────────────
test('designs saved before open unchanged: the new settings are optional fields of format v2',()=>{
 for(const f of readdirSync(new URL('./fixtures/editor-v1/',import.meta.url))){
  const raw=JSON.parse(readFileSync(new URL('./fixtures/editor-v1/'+f,import.meta.url),'utf8'));
  const r=D.readDoc(raw);assert.ok(r.ok,f);
  // Read, cleaned (what a save keeps) and read again: the very same design, nothing added.
  const again=D.readDoc(D.cleanDoc(r.doc));assert.ok(again.ok);
  assert.equal(canon(again.doc),canon(r.doc),f);
  for(const l of Object.values(r.doc.layers)){assert.equal('effect' in l,false);assert.equal('italic' in l,false);assert.equal('gradient' in l,false)}
 }
 // A v2 design written before this change (no effect, no gradient, solid hex colours).
 let old=D.createDoc(PICTURE);
 old=D.addLayer(old,{kind:'text',style:'heading',font:'Poppins',color:'#ffffff'},'t');
 old=D.addLayer(old,{kind:'shape',shape:'rect',fill:'#112233'},'s');
 const frozen=JSON.stringify(old);
 const r=D.readDoc(JSON.parse(frozen));assert.ok(r.ok);assert.equal(JSON.stringify(D.cleanDoc(r.doc)),frozen,'byte for byte');
});

test('the new settings: checked at the boundary, kept by a save, never an address',()=>{
 let doc=D.addLayer(D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading'},'t'),{kind:'shape',shape:'circle'},'s');
 const g={type:'radial',angle:0,stops:[{at:0,colour:'#FF0000'},{at:0.5,colour:'#00FF0080'},{at:1,colour:'#0000FF'}]};
 doc=D.change(doc,d=>{D.edit.setEffect(d,'t',{kind:'shadow',offset:40,direction:45,blur:30,colour:'#000000',transparency:50});D.edit.update(d,'t',{italic:true,color:'#FFFFFF80'});D.edit.setFill(d,'s',{gradient:g});D.edit.setBackground(d,'page-1',{kind:'colour',colour:'#101010',gradient:{type:'linear',angle:135,stops:[{at:0,colour:'#101010'},{at:1,colour:'#FFFFFF'}]}})});
 assert.ok(D.checkDoc(doc).ok);
 const kept=D.readDoc(JSON.parse(JSON.stringify(D.cleanDoc(doc))));assert.ok(kept.ok);
 assert.equal(canon(kept.doc),canon(doc),'a save keeps every new setting');
 assert.equal(doc.layers.s.fill,'#FF0000','with a gradient, the solid fill is its first stop (what an older reader draws)');
 const bad=(mut,why)=>{const x=JSON.parse(JSON.stringify(doc));mut(x);assert.equal(D.checkDoc(x).ok,false,why)};
 bad(x=>{x.layers.t.effect={kind:'glitch',amount:3}},'an effect the format doesn’t have');
 bad(x=>{x.layers.t.effect={kind:'shadow',offset:400,direction:45,blur:30,colour:'#000000',transparency:50}},'out of range');
 bad(x=>{x.layers.t.effect={kind:'outline',thickness:30,colour:'#000000',href:'https://example.test/x'}},'a field it doesn’t have');
 bad(x=>{x.layers.t.effect={kind:'neon',intensity:30,colour:'https://example.test/x.png'}},'an address as a colour');
 bad(x=>{x.layers.s.gradient={...g,stops:[g.stops[0]]}},'a gradient needs two stops');
 bad(x=>{x.layers.s.gradient={...g,stops:[...g.stops,...g.stops]}},'and at most four');
 bad(x=>{x.pages[0].background.gradient={type:'linear',angle:0,stops:[{at:0,colour:'#000000'},{at:1,colour:'url(https://example.test)'}]}},'no address in a background');
 bad(x=>{x.layers.t.italic='yes'},'italic is on or off');
 assert.throws(()=>D.change(doc,d=>D.edit.update(d,'t',{effect:{kind:'outline',thickness:30,colour:'#000000',src:'https://a.example.test'}})));
 assert.throws(()=>D.change(doc,d=>D.edit.update(d,'s',{fill:{url:'x'}})),/isn’t part of a design/);
 // None takes the effect off (the field goes, so the design is as it was).
 const none=D.change(doc,d=>D.edit.setEffect(d,'t',null));assert.equal('effect' in none.layers.t,false);
 const solid=D.change(doc,d=>D.edit.setFill(d,'s',{gradient:null}));assert.equal('gradient' in solid.layers.s,false);
});

test('every change is one undo step: picking an effect, a colour, a gradient; a slider’s drag is one step',()=>{
 const doc=D.addLayer(D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading'},'t'),{kind:'shape',shape:'rect'},'s');
 let h=H.startHistory(doc);
 h=H.apply(h,d=>D.edit.setEffect(d,'t',E.effectDefaults('shadow',doc.layers.t)));
 h=H.apply(h,d=>D.edit.setEffect(d,'t',E.effectDefaults('neon',doc.layers.t)));
 assert.equal(h.present.layers.t.effect.kind,'neon','one effect at a time: picking another replaces it');
 assert.equal(h.past.length,2);
 // A drag of the Intensity slider: many changes, one gesture, one step; let go (end) and the next drag is another.
 for(const n of [10,20,30,40])h=H.apply(h,d=>D.edit.setEffect(d,'t',{...h.present.layers.t.effect,intensity:n}),'effect:t:intensity');
 assert.equal(h.past.length,3);h=H.end(h);
 h=H.apply(h,d=>D.edit.setEffect(d,'t',{...h.present.layers.t.effect,intensity:90}),'effect:t:intensity');
 assert.equal(h.past.length,4);h=H.end(h);
 h=H.apply(h,d=>D.edit.setFill(d,'s',{gradient:C.gradientFrom('#336699')}));
 h=H.apply(h,d=>D.edit.update(d,'t',{color:'#FFCC00'}));
 assert.equal(h.past.length,6);
 for(let i=0;i<6;i++)h=H.undo(h);
 assert.equal(canon(h.present),canon(doc),'undo gives the design back');
});

// ── Effects ──────────────────────────────────────────────────────────────
test('effects: 2–5 controls each, first settings the format accepts, amounts in proportion to the size',()=>{
 assert.deepEqual(Object.keys(E.EFFECTS),[...D.TEXT_EFFECTS]);
 assert.deepEqual(D.TEXT_EFFECTS,['shadow','outline','lift','neon','background','curve']);
 for(const [kind,e] of Object.entries(E.EFFECTS)){
  const n=e.controls.length;assert.ok(kind==='lift'||kind==='curve'?n===1:n>=2&&n<=5,`${kind}: ${n} controls`);
  for(const colour of ['#FFFFFF','#111111','#FF0000'])assert.equal(D.effectProblem(E.effectDefaults(kind,{color:colour})),null,kind);
 }
 assert.deepEqual(E.EFFECTS.shadow.controls.map(c=>c.label),['Offset','Direction','Blur','Transparency','Shadow colour']);
 // The same text at twice the size: every length doubles, nothing else changes. The export draws the
 // stage at the picture's pixel ratio, and Konva scales shadows with it, so it shows what the canvas shows.
 for(const kind of ['shadow','outline','lift','neon']){
  const at=(fontSize)=>E.textPaint({color:'#FF0000',fontSize,effect:E.effectDefaults(kind,{color:'#FF0000'})});
  const a=at(50),b=at(100);
  for(const k of ['strokeWidth','shadowBlur','shadowOffsetX','shadowOffsetY'])if(a[k]!==undefined)assert.ok(Math.abs(b[k]-2*a[k])<1e-9,`${kind}.${k}`);
  for(const k of ['fill','stroke','shadowColor','shadowOpacity','fillAfterStrokeEnabled'])assert.equal(b[k],a[k],`${kind}.${k}`);
 }
 const box=(s)=>E.backgroundBox({fontSize:s,effect:{kind:'background',colour:'#000000',padding:50,corner:30,transparency:20}},s*4,s*1.2);
 assert.ok(Math.abs(box(80).width-2*box(40).width)<1e-9&&Math.abs(box(80).cornerRadius-2*box(40).cornerRadius)<1e-9);
 assert.equal(box(40).opacity,0.8);
 assert.equal(E.textPaint({color:'#FFFFFF',fontSize:40}).shadowEnabled,false,'no effect: plain text');
});

test('curved text: an arc as long as the line, up or down, the box grown to hold it',()=>{
 const up=E.curveGeometry(400,40,50,400),down=E.curveGeometry(400,40,-50,400),flat=E.curveGeometry(400,40,0,400);
 assert.ok(up.height>40&&Math.abs(up.height-down.height)<1e-9,'the same bow either way');
 assert.match(up.path,/ 0 [01] 1 /,'up: over the top of the circle');
 assert.match(down.path,/ 0 [01] 0 /,'down: under it');
 assert.equal(flat.height,40);
 assert.ok(Math.abs(up.radius*(Math.abs(50)/100*Math.PI*1.9)-400)<1e-6,'the arc is as long as the line');
 assert.ok(E.curveGeometry(400,40,100,400).height>E.curveGeometry(400,40,30,400).height,'more curve, a taller box');
 // Still the text layer: double-click types in it, as on straight text.
 assert.match(read('components/canvas/stage.tsx'),/onDblClick=\{\(\)=>\{if\(layer\.kind==='text'\)onEditText\(layer\.id\)\}\}/);
 assert.match(read('components/canvas/stage.tsx'),/<TextPath key=\{key\}/);
});

test('right-to-left text: drawn in one run so Arabic letters join, typed right to left',()=>{
 const stage=read('components/canvas/stage.tsx'),measure=read('components/canvas/measure.ts');
 assert.match(stage,/direction=isRtl\(layer\.text\)\?'rtl':'ltr'/);
 assert.match(measure,/export function isRtl/);
 assert.match(read('components/canvas/text-editor.tsx'),/dir="auto"/);
 assert.match(read('components/canvas/design-panel.tsx'),/<Textarea rows=\{3\}[^>]*dir="auto"/);
 // Konva draws a right-to-left line in one native run (shaping kept) only with direction rtl.
 assert.match(readFileSync(new URL('../node_modules/konva/lib/shapes/Text.js',import.meta.url),'utf8'),/Keep RTL text in one native run to preserve shaping/);
});

// ── Colours ──────────────────────────────────────────────────────────────
test('colours: hex with transparency, the contrast hint at 4.5:1, gradients as the canvas and CSS draw them',()=>{
 assert.deepEqual(C.parseHex('#FF000080'),{r:255,g:0,b:0,a:128/255});
 assert.equal(C.toHex({r:255,g:0,b:0,a:1}),'#FF0000');assert.equal(C.withAlpha('#FF0000',0.5),'#FF000080');
 assert.equal(C.cleanTypedHex('abc'),'#AABBCC');assert.equal(C.cleanTypedHex('#1a2b3c'),'#1A2B3C');assert.equal(C.cleanTypedHex('nope'),null);
 const back=C.hsvToRgb(C.rgbToHsv(C.parseHex('#3366CC')));assert.equal(C.toHex(back),'#3366CC');
 assert.equal(Math.round(C.contrastRatio('#FFFFFF','#000000')),21);
 assert.ok(C.contrastRatio('#777777','#FFFFFF')<C.LOW_CONTRAST,'grey on white is low');
 assert.ok(C.contrastRatio('#FFFFFF80','#FFFFFF')<1.01,'see-through text counts');
 assert.equal(C.worstContrast('#000000',['#FFFFFF','#333333'])<3,true,'the worst stop of a gradient decides');
 const p=C.linearPoints(90,200,100);assert.deepEqual([p.start,p.end],[{x:0,y:50},{x:200,y:50}],'90°: left to right, corner to corner');
 const k=C.konvaGradient({type:'linear',angle:180,stops:[{at:1,colour:'#000000'},{at:0,colour:'#FFFFFF'}]},100,100);
 assert.deepEqual(k.fillLinearGradientColorStops,[0,'#FFFFFF',1,'#000000'],'stops in order');
 assert.equal(C.konvaGradient({type:'radial',angle:0,stops:[{at:0,colour:'#000000'},{at:1,colour:'#FFFFFF'}]},100,100,50,50).fillRadialGradientStartPoint.x,0,'an ellipse is drawn from its centre');
 assert.equal(C.cssGradient({type:'linear',angle:45,stops:[{at:0,colour:'#000000'},{at:1,colour:'#FFFFFF'}]}),'linear-gradient(45deg, #000000 0%, #FFFFFF 100%)');
 // One picker everywhere: every colour in the panel goes through it, none through the old swatch row.
 const panel=read('components/canvas/design-panel.tsx');
 assert.doesNotMatch(panel,/SwatchRow/);
 assert.ok((panel.match(/<ColourField /g)||[]).length>=6);
 assert.match(read('components/canvas/effects-section.tsx'),/<ColourField /);
 const picker=read('components/canvas/colour-picker.tsx');
 assert.match(picker,/EyeDropper/);assert.match(picker,/pickFromCanvas\(\)/,'the canvas itself where the browser has no eyedropper');
 for(const s of ['Brand colours','In this design','Recent','Any colour','Transparency'])assert.ok(picker.includes(s),s);
});
