// Canvas editor, part 3: brand fonts on the canvas and in the export
// (lib/editor/fonts.ts), reopening a saved design with its layers
// (GET /api/edits/<id> and saving it again, against the real handlers, SQLite
// from the migrations and the local S3 stand-in), typing as one undo step
// (lib/editor/doc.ts commit with `merge`), and icons as vector layers
// (lib/editor/icons.ts). Synthetic data only.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import * as D from '../lib/editor/doc.ts';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});
// Loaded after the hooks: these import their neighbours without an extension, as the app does.
const F=await import('../lib/editor/fonts.ts'),I=await import('../lib/editor/icons.ts'),{BRAND_FONTS}=await import('../lib/brand-kit.ts');
const read=(rel)=>readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const PICTURE={id:'00000000-0000-4000-8000-000000020000',src:'/api/assets/00000000-0000-4000-8000-000000020000',width:1536,height:864};

// ── Brand fonts ──────────────────────────────────────────────────────────
// What the page resolves Next's font variables to (the hashed family, then its fallback face).
const PAGE_VARS=Object.fromEntries(Object.entries(F.FONT_VARS).filter(([,v])=>v).map(([font,v])=>{const h=font.replace(/\s/g,'_');return [v,`'__${h}_a1b2c3', '__${h}_Fallback_a1b2c3'`]}));
const resolve=(v)=>PAGE_VARS[v]||'';

test('every brand-kit font has its own files and draws as itself, not only Inter and Outfit',()=>{
 const served=read('app/brand-fonts.ts'),layout=read('app/layout.tsx');
 for(const font of BRAND_FONTS){
  const v=F.FONT_VARS[font];
  if(font==='System'){assert.equal(v,null,'the device’s own font: nothing to load');continue}
  assert.match(served,new RegExp(`variable:"${v}"`),`${font} is served by the Studio (${v})`);
  const family=F.canvasFontFamily(font,resolve);
  assert.ok(family.startsWith(`'__${font.replace(/\s/g,'_')}_a1b2c3'`),`${font} draws in its own family first: ${family}`);
  assert.ok(family.endsWith('sans-serif'));
  assert.equal(F.firstFamily(resolve(v)),`__${font.replace(/\s/g,'_')}_a1b2c3`,'the family the font set loads');
 }
 assert.match(layout,/className=\{fontVariables\}/,'every font’s variable is on <html>');
 assert.match(served,/preload:false/,'a page downloads a font only when it draws it');
 assert.equal(F.knownFont('Comic Demo'),'Inter','an unknown name draws in the Studio’s font');
 assert.match(F.cssFontFamily('Poppins'),/^var\(--font-poppins, "Poppins"\), var\(--ds-font-sans\)$/,'panels preview the same files');
 assert.deepEqual(F.fontChoices({headingFont:'Poppins',bodyFont:'Lato'}).slice(0,2).map(c=>c.label),['Poppins (brand headings)','Lato (brand body text)']);
 assert.equal(F.fontChoices(null).length,BRAND_FONTS.length-1,'every font but System');
});

test('the export waits for the brand font and draws in it',async()=>{
 let doc=D.createDoc(PICTURE);
 doc=D.addLayer(doc,{kind:'text',style:'heading',font:'Playfair Display'},'h');
 doc=D.addLayer(doc,{kind:'text',style:'body',font:'Oswald'},'b');
 doc=D.addLayer(doc,{kind:'text',style:'subheading',font:'Playfair Display'},'s');
 assert.deepEqual(F.fontsInDoc(doc),[{font:'Playfair Display',weight:700},{font:'Oswald',weight:400},{font:'Playfair Display',weight:600}],'each font and weight once');
 // A stand-in canvas: it draws each text layer with whatever family is loaded at that moment.
 const loaded=new Set(),events=[];
 const load=(n)=>new Promise(resolve=>setTimeout(()=>{loaded.add(F.fontKey(n));events.push('loaded '+F.fontKey(n));resolve({ok:true})},5));
 const draw=async()=>{events.push('draw');return doc.layers.map(l=>loaded.has(F.fontKey({font:l.font,weight:l.fontWeight}))?F.canvasFontFamily(l.font,resolve):F.fallbackFamily(resolve))};
 const {file,failed}=await F.exportWithFonts(doc,{load,ready:async()=>{events.push('ready')},draw});
 assert.deepEqual(failed,[]);
 assert.equal(events.indexOf('draw'),events.length-1,'nothing is drawn before every font has loaded and the canvas shows it');
 assert.ok(events.indexOf('ready')<events.indexOf('draw'));
 assert.ok(file[0].startsWith("'__Playfair_Display_a1b2c3'"),'the heading is drawn in the brand’s heading font');
 assert.ok(file[1].startsWith("'__Oswald_a1b2c3'"),'the body text in the brand’s body font');
});

test('a font that can’t load falls back to the Studio’s font, and says so',async()=>{
 const doc=D.addLayer(D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading',font:'Montserrat'},'h'),{kind:'text',style:'body',font:'Lato'},'b');
 const load=async(n)=>n.font==='Montserrat'?{ok:false,reason:'timeout'}:{ok:true};
 assert.deepEqual(await F.settleFonts(doc,load),{failed:['Montserrat']});
 assert.deepEqual(await F.settleFonts(doc,async()=>{throw new Error('offline')}),{failed:['Montserrat','Lato']},'never rejects: a failed load is a fallback');
 assert.equal(F.fallbackNotice(['Montserrat']),'Montserrat couldn’t load, so its text shows in Inter here and in your downloads. Check your connection, then reopen the editor.');
 assert.match(F.fallbackNotice(['Montserrat','Lato']),/^Montserrat and Lato couldn’t load, so their text/);
 assert.equal(F.fallbackNotice([]),null);
 assert.ok(F.fallbackFamily(resolve).startsWith("'__Inter_a1b2c3'"));
 // The browser side: one load per font and weight, a timeout, and never silent (a notice and the console).
 const browser=read('components/canvas/fonts.ts'),editor=read('components/canvas/editor-page.tsx'),stage=read('components/canvas/stage.tsx');
 assert.match(browser,/document\.fonts\.load\(spec\)/);assert.match(browser,/timeout\(FONT_LOAD_MS\)/);
 assert.match(browser,/console\.warn\('\[editor\] a brand font fell back'/);
 assert.match(editor,/const fontNote=fallbackNotice\(fonts\.failed\);/);assert.match(editor,/\{fontNote&&<div className="ds-banner warn canvas-notice" role="status">/);
 assert.match(editor,/exportWithFonts\(doc,\{load:loadCanvasFont,ready:fonts\.whenReady,draw:/,'Save, Duplicate and Download all export through the font wait');
 assert.match(stage,/<Text key=\{key\}/,'the text is measured again once its font arrives');
});

// ── Typing: one undo step ────────────────────────────────────────────────
test('typing on the canvas is one undo step; redo brings it back; a new edit starts a new step',()=>{
 const a=D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading'},'t');
 let h=D.startHistory(a);
 for(const text of ['L','La','Lau','Launch'])h=D.commit(h,D.updateLayer(h.present,'t',{text}),'type:t:1');
 assert.equal(h.present.layers[0].text,'Launch');assert.equal(h.past.length,1,'one step for the whole word');
 h=D.undo(h);assert.equal(h.present.layers[0].text,'Add a heading');
 h=D.redo(h);assert.equal(h.present.layers[0].text,'Launch');
 h=D.commit(h,D.updateLayer(h.present,'t',{text:'Launch day'}),'type:t:1');
 assert.equal(h.past.length,2,'after an undo or redo, typing is a new step');
 h=D.commit(h,D.updateLayer(h.present,'t',{text:'Launch day!'}),'type:t:2');
 h=D.commit(h,D.nudge(h.present,'t',4,0));
 h=D.commit(h,D.updateLayer(h.present,'t',{text:'Launch day!!'}),'type:t:2');
 assert.equal(h.past.length,5,'another change in between ends the step');
 assert.equal(D.commit(h,h.present,'type:t:2'),h,'nothing changed: no step');
 // The canvas: double-click or Enter types in place; Esc finishes; keys never reach the canvas's shortcuts.
 const box=read('components/canvas/text-editor.tsx'),editor=read('components/canvas/editor-page.tsx'),stage=read('components/canvas/stage.tsx');
 assert.match(stage,/onDblClick=\{\(\)=>\{if\(layer\.kind==='text'\)onEditText\(layer\.id\)\}\}/);
 assert.match(editor,/if\(e\.key==='Enter'&&layer\?\.kind==='text'\)\{e\.preventDefault\(\);startTyping\(layer\.id\);return\}/);
 assert.match(box,/e\.stopPropagation\(\);\n   if\(e\.key==='Escape'\)\{e\.preventDefault\(\);finish\(\)\}/);
 assert.doesNotMatch(box,/e\.key==='Enter'/,'Enter adds a line (the text box’s own)');
 assert.match(box,/fontFamily:family,fontSize:layer\.fontSize\*scale,fontWeight:layer\.fontWeight,lineHeight:TEXT_LINE_HEIGHT/,'typed in the brand font, at the canvas’s size');
 assert.match(editor,/change\(d=>updateLayer\(d,l\.id,\{text,height:textHeight\(l,text\)\}\),typingKey\(l\.id\)\)/);
});

// ── Icons ────────────────────────────────────────────────────────────────
test('icons: lucide’s own drawing becomes vector paths the design keeps',async()=>{
 assert.equal(I.shapeToPath({tag:'circle',attrs:{cx:'7',cy:'17',r:'2'}}),'M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z');
 assert.equal(I.shapeToPath({tag:'line',attrs:{x1:'2',y1:'3',x2:'22',y2:'21'}}),'M2 3L22 21');
 assert.equal(I.shapeToPath({tag:'polyline',attrs:{points:'22 12 18 12 15 21'}}),'M22 12L18 12L15 21');
 assert.equal(I.shapeToPath({tag:'polygon',attrs:{points:'1,2 3,4 5,6'}}),'M1 2L3 4L5 6Z');
 assert.equal(I.shapeToPath({tag:'rect',attrs:{x:'2',y:'4',width:'20',height:'16'}}),'M2 4h20v16h-20Z');
 assert.match(I.shapeToPath({tag:'rect',attrs:{x:'2',y:'4',width:'20',height:'16',rx:'2'}}),/^M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z$/);
 assert.equal(I.shapeToPath({tag:'circle',attrs:{cx:'1',cy:'1',r:'0'}}),null);assert.equal(I.shapeToPath({tag:'script',attrs:{}}),null);
 // The car icon, as the app draws it.
 const {__iconData:car}=await import('lucide-react/icons/car');
 const paths=I.iconPaths(car.node.map(([tag,attrs])=>({tag,attrs})));
 assert.equal(paths.length,car.node.length,'every shape kept');
 const {iconCanvasAdd}=await import('../lib/elements.ts');
 const add=iconCanvasAdd({id:'car',name:'Car'},paths,{colours:[{hex:'#0a84ff',name:'Demo blue'}]});
 assert.deepEqual({...add,paths:undefined},{kind:'icon',icon:'car',name:'Car',paths:undefined,color:'#0A84FF'},'in the brand’s first colour');
 assert.equal(iconCanvasAdd({id:'car',name:'Car'},paths,null).color,'#ffffff');
 assert.equal(iconCanvasAdd({id:'Car<x>',name:'Car'},paths),null);assert.equal(iconCanvasAdd({id:'car',name:'Car'},[]),null);
 const doc=D.addLayer(D.createDoc(PICTURE),add,'i'),[l]=doc.layers;
 assert.equal(l.kind,'icon');assert.equal(l.width,l.height,'square, keeps its shape');assert.equal(l.strokeWidth,D.ICON_STROKE);
 assert.equal(D.checkDoc(JSON.parse(JSON.stringify(doc))).ok,true,'the save route keeps it');
 const bad=(patch)=>D.checkDoc({...doc,layers:[{...l,...patch}]}).ok;
 assert.equal(bad({paths:['M0 0<script>']}),false);assert.equal(bad({paths:[]}),false);assert.equal(bad({color:'red'}),false);
 assert.equal(bad({icon:'../x'}),false);assert.equal(bad({strokeWidth:60}),false);assert.equal(bad({paths:Array(D.ICON_PATHS_MAX+1).fill('M0 0')}),false);
 // Recolour: a patch keeps the vector; resizing is the layer's box (the paths are on their own 24-unit grid).
 const blue=D.updateLayer(doc,'i',{color:'#123456',width:400,height:400}).layers[0];
 assert.deepEqual(blue.paths,l.paths);assert.equal(blue.color,'#123456');
 const stage=read('components/canvas/stage.tsx');
 assert.match(stage,/<Group scaleX=\{w\/ICON_GRID\} scaleY=\{h\/ICON_GRID\}>/,'drawn as vectors scaled to the box: sharp at any size and in the export');
 assert.match(stage,/<Path key=\{i\} data=\{d\} stroke=\{layer\.color\}/);
});

test('icon search: the whole set by name and plain words, best first',()=>{
 const names=['car','car-front','car-taxi-front','scan-line','caravan','zap','zap-off','battery-charging','gauge','circle-gauge'];
 assert.deepEqual(I.searchIcons(names,'car').names.slice(0,3),['car','car-front','car-taxi-front'],'the word itself first, then names that start with it');
 assert.ok(I.searchIcons(names,'car').names.includes('caravan'));
 assert.deepEqual(I.searchIcons(names,'electric').names,['zap','battery-charging'],'plain words for the suggested ones');
 assert.deepEqual(I.searchIcons(names,'car front').names,['car-front','car-taxi-front']);
 assert.deepEqual(I.searchIcons(names,'tractor').names,[]);
 assert.deepEqual(I.searchIcons(names,'  ').names,[]);
 assert.equal(I.searchIcons(Array.from({length:200},(_,i)=>'star-'+i),'star',60).names.length,60);
 assert.equal(I.searchIcons(Array.from({length:200},(_,i)=>'star-'+i),'star',60).total,200);
 assert.equal(I.iconName('CarFront'),'car-front');assert.equal(I.iconName('Axis3d'),'axis-3d');assert.equal(I.iconName('AArrowDown'),'a-arrow-down');
 assert.equal(I.iconLabel('car-front'),'Car front');
 const panel=read('components/shell/elements-panel.tsx');
 assert.match(panel,/import\('lucide-react'\)\.then/,'the whole set downloads once, the first time someone searches');
 assert.match(panel,/iconCanvasAdd\(\{id,name\},iconPaths\(shapesOf\(svg\)\),kit\)/,'added from the very drawing shown in the tile');
});

// ── Reopen with layers, against the real routes ─────────────────────────
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG=id(0xb),OWNER={id:id(0xb1),email:'owner@example.test'},CREATOR={id:id(0xb2),email:'creator@example.test'};
const full={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'8k','studio.key_visuals':true}};
const ORIGIN='http://studio.test';
let s3,store,save,reopen,prefix,mine;const realFetch=globalThis.fetch;
const pngOf=(w,h,fill=0)=>{const b=Buffer.alloc(80,fill);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b};
const ORIGINAL={id:PICTURE.id,title:'Demo SUV · Coast road',src:PICTURE.src,status:'ready',createdAt:'2026-11-01T10:00:00.000Z',width:1536,height:864,size:'1536x864',vehicle:'Demo SUV'};
const PLAIN={...ORIGINAL,id:id(0x20001),src:'/api/assets/'+id(0x20001),title:'Demo SUV · Plain'};

before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('Network calls are not allowed in this test: '+u)};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG,name:'Demo Company B',kind:'client'}],
  members:[{userId:OWNER.id,orgId:ORG,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG,role:'creator',status:'active'}],
  staff:{},entitlements:{[ORG]:full},grants:{},
 });
 save=(await import('@/app/api/edits/route.ts')).POST;
 reopen=(await import('@/app/api/edits/[id]/route.ts')).GET;
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 const tenancy=await import('@/lib/portable/tenancy.ts');
 prefix=tenancy.userPrefix(ORG,OWNER.id);mine=tenancy.userPrefix(ORG,CREATOR.id);
 for(const v of [ORIGINAL,PLAIN]){
  await store.put(prefix+'visuals/'+v.id+'.json',JSON.stringify(v),{httpMetadata:{contentType:'application/json'}});
  await store.put(prefix+'images/'+v.id,pngOf(1536,864,7),{httpMetadata:{contentType:'image/png'}});
 }
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});

function as(user){state.user=user;state.chosenOrg=null;state.chosenBrand=null}
async function post({doc,parentId,copy=false,image=pngOf(1536,864,9)}){
 const form=new FormData();form.set('parentId',parentId);form.set('doc',JSON.stringify(doc));if(copy)form.set('copy','1');
 form.set('image',new File([image],'design.png',{type:'image/png'}));
 const r=await save(new Request(ORIGIN+'/api/edits',{method:'POST',headers:{origin:ORIGIN},body:form}));
 return {status:r.status,body:await r.json()};
}
async function open(pictureId){const r=await reopen(new Request(ORIGIN+'/api/edits/'+pictureId),{params:Promise.resolve({id:pictureId})});return {status:r.status,body:await r.json()}}
const text=async(key)=>(await store.get(key))?.text();

test('Edit on a picture saved from the editor reopens its original with every layer, editable',async()=>{
 as(OWNER);
 let doc=D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading',font:'Poppins',color:'#0a84ff',text:'Launch day'},'t');
 doc=D.addLayer(doc,{kind:'shape',shape:'circle'},'s');
 const first=await post({doc,parentId:PICTURE.id});assert.equal(first.status,200,JSON.stringify(first.body));
 const e1=first.body.visual;
 const r=await open(e1.id);
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(r.body.design.background,{visualId:PICTURE.id,src:PICTURE.src},'the original underneath, not the flattened picture');
 assert.deepEqual(r.body.design.layers,doc.layers,'every layer, as it was saved');
 assert.equal(r.body.design.layers[0].font,'Poppins');
 assert.deepEqual({id:r.body.base.id,width:r.body.base.width,height:r.body.base.height},{id:PICTURE.id,width:1536,height:864});
 assert.equal(D.checkDoc(r.body.design).ok,true,'the editor checks it the same way');
 // Edit on a normal picture: no layers, it opens plain (as before).
 const plain=await open(PLAIN.id);assert.equal(plain.status,404);assert.equal(plain.body.error,'This picture has no layers to reopen.');
 assert.equal((await open(id(0x9999))).status,404,'not a picture here');
 // The editor asks for the layers only for a picture made in the editor.
 const page=read('components/canvas/editor-page.tsx');
 assert.match(page,/const \{design,lost\}=v\.edit\?await loadDesign\(v\.id\):\{design:null,lost:false\};/);
 assert.match(page,/const \[opened\]=React\.useState<EditorDoc>\(\(\)=>design\|\|createDoc\(/);
});

test('saving a reopened design makes a new version and never changes the earlier one',async()=>{
 as(OWNER);
 const doc=D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'body',text:'First'},'t');
 const e1=(await post({doc,parentId:PICTURE.id})).body.visual;
 const before={record:await text(prefix+'visuals/'+e1.id+'.json'),layers:await text(prefix+'edits/'+e1.id+'.json'),image:Buffer.from(await (await store.get(prefix+'images/'+e1.id)).arrayBuffer()),original:await text(prefix+'visuals/'+PICTURE.id+'.json')};
 // Reopened: the original underneath, a layer changed and one added.
 const design=(await open(e1.id)).body.design;
 let next=D.updateLayer(design,'t',{text:'Second'});next=D.addLayer(next,{kind:'shape',shape:'star'},'star');
 const r=await post({doc:next,parentId:e1.id,image:pngOf(1536,864,3)});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const e2=r.body.visual;
 assert.notEqual(e2.id,e1.id);assert.equal(e2.parentId,e1.id,'the next version of the picture opened');
 assert.equal(e2.title,'Demo SUV · Coast road · edited');
 const kept=JSON.parse(await text(prefix+'edits/'+e2.id+'.json'));
 assert.deepEqual(kept.background,{visualId:PICTURE.id,src:PICTURE.src},'still over the original');
 assert.deepEqual(kept.layers.map(l=>l.id),['t','star']);
 // The earlier version and the original, byte for byte.
 assert.equal(await text(prefix+'visuals/'+e1.id+'.json'),before.record);
 assert.equal(await text(prefix+'edits/'+e1.id+'.json'),before.layers);
 assert.deepEqual(Buffer.from(await (await store.get(prefix+'images/'+e1.id)).arrayBuffer()),before.image);
 assert.equal(await text(prefix+'visuals/'+PICTURE.id+'.json'),before.original);
 // And it reopens in turn.
 assert.deepEqual((await open(e2.id)).body.design.layers.map(l=>l.text||l.shape),['Second','star']);
 // A colleague reopens it and saves: their own version, nothing written into the owner's work.
 as(CREATOR);
 const theirs=await post({doc:(await open(e2.id)).body.design,parentId:e2.id});
 assert.equal(theirs.status,200,JSON.stringify(theirs.body));
 assert.ok(await store.get(mine+'edits/'+theirs.body.visual.id+'.json'));assert.equal(await store.get(prefix+'visuals/'+theirs.body.visual.id+'.json'),null);
 as(OWNER);
 // A design over a picture that isn't this one's original is refused.
 const other=D.addLayer(D.createDoc({...PICTURE,id:PLAIN.id,src:PLAIN.src}),{kind:'text',style:'body'},'x');
 assert.equal((await post({doc:other,parentId:e1.id})).status,400);
 assert.equal((await post({doc:other,parentId:PICTURE.id})).status,400);
});

test('when the original is gone, the saved picture opens plain (its layers have nothing to sit on)',async()=>{
 as(OWNER);
 const base={...ORIGINAL,id:id(0x20002),src:'/api/assets/'+id(0x20002)};
 await store.put(prefix+'visuals/'+base.id+'.json',JSON.stringify(base),{httpMetadata:{contentType:'application/json'}});
 await store.put(prefix+'images/'+base.id,pngOf(1536,864,7),{httpMetadata:{contentType:'image/png'}});
 const e1=(await post({doc:D.addLayer(D.createDoc({...PICTURE,id:base.id,src:base.src}),{kind:'text',style:'body'},'t'),parentId:base.id})).body.visual;
 assert.equal((await open(e1.id)).status,200);
 await store.put(prefix+'deleted-visuals/'+base.id+'.json',JSON.stringify(base),{httpMetadata:{contentType:'application/json'}});
 assert.equal((await open(e1.id)).status,404,'deleted original: plain');
 // Registered as a read the library may make, like the picture itself.
 const plan=await import('@/lib/accounts/plan.ts');
 const rule=plan.routeRule('/api/edits/'+e1.id,'GET');assert.equal(rule.feature,null);assert.equal(rule.library,true);
 assert.equal(plan.routeRule('/api/edits/'+e1.id,'POST'),null,'nothing else at that address');
});
