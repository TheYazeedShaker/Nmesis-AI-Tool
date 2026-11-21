// Editor foundations (feat/editor-core-v2): design format v2 and its one
// upgrade from v1 (lib/editor/doc.ts), undo grouped per gesture on immer
// patches (lib/editor/history.ts), autosave and its four states
// (lib/editor/autosave.ts), duplicates of a layer and a page, pages, and the
// ZIP of pages (lib/editor/zip.ts). The routes (save, drafts, versions,
// restore, presence) are in tests/editor-v2-server.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as D from '../lib/editor/doc.ts';
import * as H from '../lib/editor/history.ts';
import {Autosave,SendError,SAVE_WORDS} from '../lib/editor/autosave.ts';
import {zipStored,crc32} from '../lib/editor/zip.ts';

const FIXTURES=new URL('./fixtures/editor-v1/',import.meta.url);
const v1Files=readdirSync(FIXTURES).filter(f=>f.endsWith('.json')).map(f=>({name:f,raw:JSON.parse(readFileSync(new URL(f,FIXTURES),'utf8'))}));
const PICTURE={id:'00000000-0000-4000-8000-000000010000',width:1536,height:864};
const src=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shape=(doc,id,page)=>D.addLayer(doc,{kind:'shape',shape:'rect'},id,page);

// ── v1 → v2 ───────────────────────────────────────────────────────────────
test('every v1 design written by the v1 editor opens unchanged: same picture, same layers, same order, same settings',()=>{
 assert.ok(v1Files.length>=4,'the fixtures are there');
 for(const {name,raw} of v1Files){
  const read=D.readDoc(raw);
  assert.ok(read.ok,`${name} reads (${read.reason||''})`);assert.equal(read.from,1);
  const doc=read.doc;
  assert.equal(doc.schemaVersion,2);assert.equal(doc.width,raw.width);assert.equal(doc.height,raw.height);
  assert.equal(doc.base,raw.background.visualId,'the original picture underneath');
  assert.equal(doc.pages.length,1);assert.deepEqual(doc.pages[0].background,{kind:'picture',asset:'images/'+raw.background.visualId});
  const drawn=D.drawOrder(doc,doc.pages[0].id);
  assert.deepEqual(drawn.map(l=>l.id),raw.layers.map(l=>l.id),`${name}: the same layers in the same order`);
  for(const [i,old] of raw.layers.entries()){
   const now=drawn[i];
   for(const [k,v] of Object.entries(old)){
    if(k==='src'||k==='assetId')continue;
    assert.deepEqual(now[k],v,`${name} ${old.id}: ${k} unchanged`);
   }
   if(old.kind==='image')assert.equal(now.asset,old.src.startsWith('/api/brand-kit/logos/')?'logos/'+old.src.split('/').pop():'images/'+old.src.split('/').pop(),'the picture by its storage key');
   assert.equal(now.src,undefined,'no address kept');
  }
  assert.equal(D.checkDoc(doc).ok,true,'the upgraded design passes the v2 check');
  assert.equal(D.readDoc(doc).from,2,'and reads again as v2, unchanged');
  assert.deepEqual(D.readDoc(JSON.parse(JSON.stringify(doc))).doc,doc);
 }
});

test('the upgrade is the only path: a v1 picture with an outside address keeps its box as an empty frame, nothing else moves',()=>{
 const raw=JSON.parse(JSON.stringify(v1Files.find(f=>f.name==='logo-and-heading.json').raw));
 raw.layers[0].src='https://bucket.example/orgs/x/images/y?X-Amz-Signature=abc';
 const read=D.readDoc(raw);assert.ok(read.ok);
 const [first,second]=D.drawOrder(read.doc,'page-1');
 assert.equal(first.kind,'frame');assert.equal(first.name,'Missing picture');assert.equal(first.x,raw.layers[0].x);assert.equal(first.width,raw.layers[0].width);
 assert.equal(second.text,'Launch day');
 assert.doesNotMatch(JSON.stringify(read.doc),/:\/\/|X-Amz-/i,'the signed address is not carried over');
});

// ── No addresses in a design ──────────────────────────────────────────────
test('a design keeps pictures by storage key only: never a signed or outside URL',()=>{
 const doc=D.addLayer(D.addLayer(D.createDoc(PICTURE),{kind:'image',src:'/api/brand-kit/logos/00000000-0000-4000-8000-00000000c0de',name:'Logo',source:'logo'},'logo'),{kind:'image',src:'/api/assets/00000000-0000-4000-8000-000000020001',assetId:'00000000-0000-4000-8000-000000020001',name:'Upload',source:'upload'},'up');
 assert.equal(doc.layers.logo.asset,'logos/00000000-0000-4000-8000-00000000c0de');
 assert.equal(doc.layers.up.asset,'images/00000000-0000-4000-8000-000000020001');
 assert.doesNotMatch(JSON.stringify(doc),/:\/\/|X-Amz-|\/api\//i);
 assert.equal(D.assetSrc(doc.layers.logo.asset),'/api/brand-kit/logos/00000000-0000-4000-8000-00000000c0de','drawn through the Studio’s own address');
 assert.throws(()=>D.addLayer(D.createDoc(PICTURE),{kind:'image',src:'https://bucket.example/x.png?X-Amz-Signature=1',name:'x',source:'upload'},'x'),/Only pictures from this Studio/);
 // Refused from outside: a URL in an asset, a background or any name.
 const bad=(f)=>{const d=JSON.parse(JSON.stringify(doc));f(d);return D.checkDoc(d).ok};
 assert.equal(bad(d=>{d.layers.up.asset='https://bucket.example/a.png'}),false);
 assert.equal(bad(d=>{d.layers.up.asset='images/../../x'}),false);
 assert.equal(bad(d=>{d.pages[0].background.asset='https://bucket.example/a.png?X-Amz-Signature=1'}),false);
 assert.equal(bad(d=>{d.layers.logo.name='see https://bucket.example'}),false);
 assert.equal(bad(d=>{d.layers.up.src='/api/assets/00000000-0000-4000-8000-000000020001'}),true,'an unknown field is ignored by the check…');
 assert.equal(D.cleanDoc({...doc,extra:'https://x'}).extra,undefined,'…and never kept: the save keeps only the design’s own fields');
});

// ── Undo grouped per gesture ──────────────────────────────────────────────
const start=()=>H.startHistory(shape(D.createDoc(PICTURE),'a'));
const x=(h)=>h.present.layers.a;
test('a drag is one undo step, however many moves it made',()=>{
 let h=start();
 for(let i=1;i<=30;i++)h=H.apply(h,d=>D.edit.update(d,'a',{x:i*5,y:i*2}),'drag:a:1');
 h=H.end(h);
 assert.equal(h.past.length,1);assert.equal(x(h).x,150);
 h=H.undo(h);assert.equal(x(h).x,start().present.layers.a.x,'one undo puts it back where the drag began');
 h=H.redo(h);assert.equal(x(h).x,150);
});
test('a resize and a rotation are each one step; two drags are two steps',()=>{
 let h=start();
 h=H.apply(h,d=>D.edit.update(d,'a',{width:300,height:200,x:10}),'resize:1');h=H.end(h);
 h=H.apply(h,d=>D.edit.update(d,'a',{rotation:30}),'rotate:1');h=H.apply(h,d=>D.edit.update(d,'a',{rotation:45}),'rotate:1');h=H.end(h);
 h=H.apply(h,d=>D.edit.update(d,'a',{x:20}),'drag:a:2');h=H.end(h);
 h=H.apply(h,d=>D.edit.update(d,'a',{x:40}),'drag:a:2');h=H.end(h);
 assert.equal(h.past.length,4,'resize, rotation, and two drags even with the same key (each gesture was closed)');
 h=H.undo(h);assert.equal(x(h).x,20);h=H.undo(h);assert.equal(x(h).x,10);
 h=H.undo(h);assert.equal(x(h).rotation,0,'the whole rotation in one step');assert.equal(x(h).width,300);
 h=H.undo(h);assert.equal(x(h).width,start().present.layers.a.width);
});
test('a slider moved end to end is one step; typing is one step per editing session',()=>{
 let h=H.startHistory(D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'heading'},'t'));
 for(let v=10;v<=200;v+=10)h=H.apply(h,d=>D.edit.update(d,'t',{fontSize:v}),'slider:fontSize:t:1');
 h=H.end(h);
 for(const text of ['L','La','Lau','Launch'])h=H.apply(h,d=>D.edit.update(d,'t',{text}),'type:t:1');
 h=H.end(h);
 for(const text of ['Launch d','Launch day'])h=H.apply(h,d=>D.edit.update(d,'t',{text}),'type:t:2');
 assert.equal(h.past.length,3);
 h=H.undo(h);assert.equal(h.present.layers.t.text,'Launch');
 h=H.undo(h);assert.equal(h.present.layers.t.text,'Add a heading');assert.equal(h.present.layers.t.fontSize,200);
 h=H.undo(h);assert.equal(h.present.layers.t.fontSize,Math.round(0.08*864));
});
test('a change that changes nothing is not a step; a new change clears redo; undo closes a gesture; the history is bounded',()=>{
 let h=start();
 assert.equal(H.apply(h,d=>D.edit.update(d,'a',{x:x(h).x})),h);
 h=H.apply(h,d=>D.edit.nudge(d,'a',1,0));h=H.undo(h);assert.equal(h.future.length,1);
 h=H.apply(h,d=>D.edit.nudge(d,'a',0,1));assert.equal(h.future.length,0);
 h=H.apply(h,d=>D.edit.nudge(d,'a',1,0),'g');h=H.undo(h);h=H.apply(h,d=>D.edit.nudge(d,'a',1,0),'g');
 assert.equal(h.past.length,2,'after undo, the same key starts a new step');
 let long=start();for(let i=0;i<H.HISTORY_MAX+20;i++)long=H.apply(long,d=>D.edit.nudge(d,'a',1,0));
 assert.equal(long.past.length,H.HISTORY_MAX);
 assert.ok(long.rev>H.HISTORY_MAX,'rev counts every change (what autosave compares)');
 // Steps hold patches, not copies of the design: 100 nudges on a 50-layer design weigh less than two copies of it.
 let big=D.createDoc(PICTURE);for(let i=0;i<50;i++)big=shape(big,'s'+i);
 let hb=H.startHistory(big);for(let i=0;i<H.HISTORY_MAX;i++)hb=H.apply(hb,d=>D.edit.nudge(d,'s7',1,0));
 assert.ok(JSON.stringify(hb.past).length<JSON.stringify(big).length*2,'patches, not copies');
});

// ── Duplicates: a layer and a page ────────────────────────────────────────
test('Ctrl/Cmd+D: the copy sits right above the original, offset down and right; one undo step takes it away',()=>{
 let doc=D.createDoc(PICTURE);for(const id of ['a','b','c'])doc=shape(doc,id);
 let h=H.startHistory(doc);
 h=H.apply(h,d=>{D.edit.duplicate(d,'b',()=>'b2',D.duplicateOffset(doc))});
 const order=D.drawOrder(h.present,'page-1').map(l=>l.id);
 assert.deepEqual(order,['a','b','b2','c']);
 const off=D.duplicateOffset(doc);assert.ok(off.x>0&&off.y>0);
 assert.equal(h.present.layers.b2.x,h.present.layers.b.x+off.x);assert.equal(h.present.layers.b2.y,h.present.layers.b.y+off.y);
 assert.equal(h.past.length,1);h=H.undo(h);assert.equal(h.present.layers.b2,undefined);assert.deepEqual(D.drawOrder(h.present,'page-1').map(l=>l.id),['a','b','c']);
});
test('Alt-drag: the copy is made where the layer is and moved by the drop, the original stays; the whole drag is one step',()=>{
 let h=start();const was={...x(h)};
 h=H.apply(h,d=>{D.edit.duplicate(d,'a',()=>'a2',{x:0,y:0})},'drag:a:9');
 h=H.apply(h,d=>D.edit.update(d,'a2',{x:900,y:500}),'drag:a:9');h=H.end(h);
 assert.equal(h.past.length,1);assert.equal(x(h).x,was.x);assert.equal(h.present.layers.a2.x,900);
 h=H.undo(h);assert.equal(h.present.layers.a2,undefined);assert.equal(x(h).x,was.x);
});
test('a group is duplicated with everything in it, new ids throughout',()=>{
 let doc=shape(shape(D.createDoc(PICTURE),'k1'),'k2');
 doc=D.change(doc,d=>{d.layers.g={id:'g',name:'Group',kind:'group',pageId:'page-1',parentId:null,index:2};d.layers.k1.parentId='g';d.layers.k1.index=0;d.layers.k2.parentId='g';d.layers.k2.index=1});
 assert.equal(D.checkDoc(doc).ok,true);
 let n=0;const next=D.change(doc,d=>{D.edit.duplicate(d,'g',(old)=>old+'-copy'+(++n),{x:5,y:5})});
 const copy=Object.values(next.layers).find(l=>l.kind==='group'&&l.id!=='g');
 const kids=Object.values(next.layers).filter(l=>l.parentId===copy.id);
 assert.equal(kids.length,2);assert.equal(kids[0].x,doc.layers.k1.x+5);
 assert.equal(D.checkDoc(next).ok,true);
 assert.equal(D.drawOrder(next,'page-1').length,4);
 assert.equal(Object.keys(D.removeLayer(next,copy.id).layers).length,3,'removing a group removes what is in it');
});
test('pages: add, duplicate right after with everything on it, move, delete; all pages one size; each one undo step',()=>{
 let h=H.startHistory(shape(shape(D.createDoc(PICTURE),'a'),'b'));
 h=H.apply(h,d=>D.edit.addPage(d,'p2','page-1'));
 assert.deepEqual(h.present.pages.map(p=>p.id),['page-1','p2']);assert.deepEqual(h.present.pages[1].background,{kind:'colour',colour:D.BLANK_PAGE});
 let n=0;h=H.apply(h,d=>D.edit.duplicatePage(d,'page-1','p1copy',()=>'c'+(++n)));
 assert.deepEqual(h.present.pages.map(p=>p.id),['page-1','p1copy','p2'],'the copy comes right after its page');
 assert.deepEqual(D.drawOrder(h.present,'p1copy').map(l=>l.kind+':'+l.x),D.drawOrder(h.present,'page-1').map(l=>l.kind+':'+l.x));
 assert.deepEqual(h.present.pages[1].background,h.present.pages[0].background,'with the same picture underneath');
 assert.equal(D.drawOrder(h.present,'page-1').length,2,'the page copied from is unchanged');
 h=H.apply(h,d=>D.edit.movePage(d,'p2',0));assert.deepEqual(h.present.pages.map(p=>p.id),['p2','page-1','p1copy']);
 h=H.apply(h,d=>D.edit.removePage(d,'p1copy'));assert.equal(Object.values(h.present.layers).filter(l=>l.pageId==='p1copy').length,0);
 assert.equal(h.past.length,4);
 h=H.undo(h);assert.equal(D.drawOrder(h.present,'p1copy').length,2,'undo brings the page back with its layers');
 h=H.undo(h);h=H.undo(h);assert.equal(h.present.pages.length,2);
 assert.equal(D.checkDoc(h.present).ok,true);
 assert.throws(()=>D.change(D.createDoc(PICTURE),d=>D.edit.removePage(d,'page-1')),/at least one page/);
 assert.equal(D.checkDoc({...h.present,width:h.present.width}).ok,true,'one width and height for every page');
});
test('a restored version replaces the design in one change: one undo takes it back',()=>{
 const before=shape(D.createDoc(PICTURE),'a'),restored=shape(shape(D.createDoc(PICTURE),'x'),'y');
 let h=H.startHistory(before);
 h=H.apply(h,d=>D.edit.replace(d,restored));
 assert.deepEqual(Object.keys(h.present.layers).sort(),['x','y']);assert.equal(h.past.length,1);
 h=H.undo(h);assert.deepEqual(Object.keys(h.present.layers),['a']);
});

// ── Autosave ──────────────────────────────────────────────────────────────
function rig({online=true,fail=null}={}){
 const sent=[],seen=[],kept={v:null},timers=new Map();let id=0,net=online,failing=fail;
 const a=new Autosave({
  send:async(doc,rev)=>{if(failing)throw failing;sent.push({doc,rev})},
  keep:{read:()=>kept.v,write:(v)=>{kept.v=v;return true},clear:()=>{kept.v=null}},
  online:()=>net,setTimer:(fn,ms)=>{const t=++id;timers.set(t,{fn,ms});return t},clearTimer:(t)=>timers.delete(t),
  onStatus:(s)=>seen.push(s),delay:2000,now:()=>1000,
 });
 const tick=async()=>{const all=[...timers.entries()];timers.clear();for(const [,t] of all)t.fn();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
 return {a,sent,seen,kept,timers,tick,setOnline:(v)=>{net=v},setFail:(e)=>{failing=e}};
}
test('autosave: "Saving…" at once, sent about 2 s after the LAST change, then "Saved"; one request for a burst of changes',async()=>{
 const r=rig();
 r.a.change({n:1},1);r.a.change({n:2},2);r.a.change({n:3},3);
 assert.equal(r.a.status,'saving');assert.equal(SAVE_WORDS.saving,'Saving…');
 assert.equal(r.timers.size,1,'each change restarts the one timer');assert.equal([...r.timers.values()][0].ms,2000);
 assert.deepEqual(r.kept.v.doc,{n:3},'kept on this device before anything is sent');
 await r.tick();
 assert.deepEqual(r.sent.map(s=>s.rev),[3],'one request, the latest change');
 assert.equal(r.a.status,'saved');assert.equal(r.kept.v,null,'the device copy is cleared once the Studio has it');
 assert.equal(SAVE_WORDS.saved,'Saved');
});
test('autosave offline: "Offline, changes kept" on this device, then sent when the connection is back',async()=>{
 const r=rig({online:false});
 r.a.change({n:1},1);
 assert.equal(r.a.status,'offline');assert.equal(SAVE_WORDS.offline,'Offline, changes kept');
 assert.deepEqual(r.kept.v,{doc:{n:1},rev:1,at:1000});
 r.a.change({n:2},2);await r.tick();assert.equal(r.sent.length,0,'nothing is sent while offline');
 r.setOnline(true);r.a.reconnect();await r.tick();
 assert.deepEqual(r.sent.map(s=>s.rev),[2],'the latest kept change goes when the connection comes back');
 assert.equal(r.a.status,'saved');assert.equal(r.kept.v,null);
});
test('autosave: a request that never reaches the Studio is "Offline, changes kept"; a refusal is "Couldn’t save, retry", and Retry sends it',async()=>{
 const r=rig({fail:new SendError('No connection.',true)});
 r.a.change({n:1},1);await r.tick();
 assert.equal(r.a.status,'offline');assert.ok(r.kept.v,'still kept');
 r.setFail(new SendError('The design could not be read.',false));
 await r.a.retry();assert.equal(r.a.status,'error');assert.equal(SAVE_WORDS.error,'Couldn’t save, retry');assert.ok(r.kept.v);
 r.setFail(null);await r.a.retry();
 assert.equal(r.a.status,'saved');assert.deepEqual(r.sent.map(s=>s.rev),[1]);assert.equal(r.kept.v,null);
});
test('autosave: one request at a time, in order; a change made meanwhile goes after it',async()=>{
 let release;const order=[];
 const a=new Autosave({send:(doc,rev)=>{order.push(rev);return rev===1?new Promise(r=>{release=r}):Promise.resolve()},keep:{read:()=>null,write:()=>true,clear:()=>{}},online:()=>true,setTimer:(fn)=>{setImmediate(fn);return 1},clearTimer:()=>{},onStatus:()=>{}});
 a.change({},1);await new Promise(r=>setImmediate(r));
 a.change({},2);const second=a.flush();
 release();await second;await new Promise(r=>setTimeout(r,5));
 assert.deepEqual(order,[1,2]);assert.equal(a.status,'saved');assert.equal(a.pending,false);
});
test('autosave: a device that cannot keep the change says "Couldn’t save" rather than "changes kept"',()=>{
 const seen=[];
 const a=new Autosave({send:async()=>{},keep:{read:()=>null,write:()=>false,clear:()=>{}},online:()=>false,setTimer:()=>1,clearTimer:()=>{},onStatus:(s)=>seen.push(s)});
 a.change({},1);assert.equal(a.status,'error');
});

// ── Download all pages ────────────────────────────────────────────────────
test('all pages download as one ZIP of PNGs (stored, with the right checksums)',()=>{
 const files=[{name:'design-page-1.png',bytes:new Uint8Array([137,80,78,71,1,2,3])},{name:'design-page-2.png',bytes:new Uint8Array([137,80,78,71,4,5])}];
 const zip=zipStored(files,new Date(2026,10,21,12,0,0)),view=new DataView(zip.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50,'a local file header first');
 assert.equal(view.getUint32(14,true),crc32(files[0].bytes));
 const endAt=zip.length-22;assert.equal(view.getUint32(endAt,true),0x06054b50);assert.equal(view.getUint16(endAt+10,true),2,'two files');
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926,'the standard CRC-32 check value');
});

// ── The editor uses all of it ─────────────────────────────────────────────
test('the editor: one patch history, autosave status in the canvas bar, page strip, the three duplicates, soft lock',()=>{
 const page=src('components/canvas/editor-page.tsx'),stage=src('components/canvas/stage.tsx'),status=src('components/canvas/save-status.tsx');
 assert.match(page,/from '@\/lib\/editor\/history'/);assert.doesNotMatch(page,/\bcommit\(/,'no second history');
 assert.match(page,/<SaveStatus /);assert.match(status,/data-save-status/);
 assert.match(page,/<PageStrip /);assert.match(page,/Duplicate design/);assert.match(page,/You’re now editing the copy/);assert.match(page,/Back to original/);
 assert.match(page,/mod&&k==='d'/);assert.match(stage,/altKey/);assert.match(stage,/onAltDrag\(layer\.id,gesture\)/);
 assert.match(page,/window\.history\.replaceState/,'the copy opens in place: no navigation, no new tab');assert.doesNotMatch(page,/window\.open\(/);
 assert.match(page,/Edit anyway/);assert.match(src('components/canvas/use-presence.ts'),/Being edited by /);
 assert.match(page,/ZIP of PNGs/);
 // Typing (on the canvas and in the side field) joins one step per session; designs are read through the one upgrade.
 assert.match(page,/change\(d=>edit\.update\(d,l\.id,\{text,height:textHeight\(l,text\)\}\),typingKey\(l\.id\)\)/);
 assert.match(page,/const read=r\.ok\?readDoc\(d\.design\):null/);assert.match(page,/readDoc\(d\.draft\?\.doc\)/);
 assert.doesNotMatch(page,/checkDoc\(/,'the editor never reads a design without the upgrade');
});
