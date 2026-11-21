// Editor panel rules (feat/editor-panel-rules), the document side (lib/editor/doc.ts):
// the optional appearance and text settings, groups (descendants, the outermost group,
// hidden and locked through a group), bounds as drawn, group and ungroup, place,
// align, distribute, rename, lock and hide, a page's background, and smart guides
// with equal spacing. Each change is one undo step (lib/editor/history.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as D from '../lib/editor/doc.ts';
import * as H from '../lib/editor/history.ts';

const PICTURE={id:'00000000-0000-4000-8000-000000010000',width:1536,height:864};
const P='page-1';
const PAGE={x:0,y:0,width:1536,height:864,rotation:0};
/** A design with rectangles at these boxes: [id, x, y, width, height, rotation?]. */
function boxes(spec,doc=D.createDoc(PICTURE)){
 for(const [id,x,y,width,height,rotation=0] of spec){doc=D.addLayer(doc,{kind:'shape',shape:'rect'},id);doc=D.updateLayer(doc,id,{x,y,width,height,rotation})}
 return doc;
}
const run=(doc,recipe)=>D.change(doc,d=>{recipe(d)});
const top=(doc,parent=null)=>D.siblings(doc,P,parent).map(l=>l.id);
const drawn=(doc)=>D.drawOrder(doc,P).map(l=>l.id);
const at=(doc,id)=>{const l=doc.layers[id];return [l.x,l.y]};
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<0.011,`${msg}: ${a} is not ${b}`);
/** JSON with sorted keys: what a design holds, whatever order immer put the keys back in. */
const canon=(v)=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:1)):x);
/** One change through the history: it is one step, and Undo gives back the design as it was. */
function oneStep(doc,recipe,{exact=true}={}){
 const h0=H.startHistory(doc),h1=H.apply(h0,d=>{recipe(d)});
 assert.equal(h1.past.length,1,'one undo step');
 const back=H.undo(h1).present;
 if(exact)assert.equal(JSON.stringify(back),JSON.stringify(doc),'undo gives it back byte for byte');
 else assert.equal(canon(back),canon(doc),'undo gives it back (same keys and values)');
 return h1.present;
}

// ── The new settings ──────────────────────────────────────────────────────
test('opacity, corner radius, flips, line and letter spacing: optional, checked, and older designs read as before',()=>{
 let doc=boxes([['s',100,100,200,100]]);
 doc=D.addLayer(doc,{kind:'text',style:'heading'},'t');
 doc=D.addLayer(doc,{kind:'image',src:'/api/assets/00000000-0000-4000-8000-000000020001',name:'Logo',source:'upload',naturalWidth:100,naturalHeight:50},'img');
 assert.equal(D.opacityOf(doc.layers.s),1,'opacity 1 when never set');assert.equal(D.lineHeightOf(doc.layers.t),D.TEXT_LINE_HEIGHT);
 assert.equal(doc.layers.s.opacity,undefined,'nothing new is written until it is set');
 const set=D.updateLayer(D.updateLayer(D.updateLayer(doc,'s',{opacity:0.4}),'img',{radius:12,flipX:true,flipY:false,opacity:0}),'t',{lineHeight:1.6,letterSpacing:-3});
 assert.equal(D.opacityOf(set.layers.s),0.4);assert.equal(set.layers.img.radius,12);assert.equal(set.layers.img.flipX,true);assert.equal(D.lineHeightOf(set.layers.t),1.6);assert.equal(set.layers.t.letterSpacing,-3);
 assert.ok(D.checkDoc(set).ok,'a design with them is valid');
 assert.equal(D.updateLayer(set,'s',{id:'x',kind:'text',pageId:'p',opacity:0.5}).layers.s.kind,'shape','update never changes what a layer is');
 for(const [id,patch,reason] of [
  ['s',{opacity:1.5},'opacity'],['s',{opacity:'0.5'},'opacity'],['s',{opacity:-0.1},'opacity'],
  ['img',{radius:-1},'image'],['img',{radius:'4'},'image'],['img',{flipX:'yes'},'image'],['img',{flipY:1},'image'],
  ['t',{lineHeight:9},'text'],['t',{lineHeight:0.2},'text'],['t',{letterSpacing:2000},'text'],['t',{letterSpacing:Number.NaN},'text'],
 ]){
  const bad=structuredClone(set);Object.assign(bad.layers[id],patch);
  assert.deepEqual(D.checkDoc(bad),{ok:false,reason},`${id} ${JSON.stringify(patch)} is refused`);
 }
 const FIXTURES=new URL('./fixtures/editor-v1/',import.meta.url);
 const files=readdirSync(FIXTURES).filter(f=>f.endsWith('.json'));
 assert.ok(files.length>=4);
 for(const f of files){const r=D.readDoc(JSON.parse(readFileSync(new URL(f,FIXTURES),'utf8')));assert.ok(r.ok,`${f} still reads (${r.reason||''})`)}
});

// ── Groups, read ──────────────────────────────────────────────────────────
test('groups: what a group stands for, its outermost group, and hidden or locked through a group',()=>{
 let doc=boxes([['a',0,0,10,10],['b',20,0,10,10],['c',40,0,10,10],['d',60,0,10,10]]);
 doc=run(doc,d=>D.edit.group(d,['a','b'],'g1'));
 doc=run(doc,d=>D.edit.group(d,['g1','c'],'g2'));
 assert.deepEqual(D.descendants(doc,'g2').map(l=>l.id),['a','b','c'],'nested groups opened, back first');
 assert.deepEqual(D.descendants(doc,'a').map(l=>l.id),['a']);assert.deepEqual(D.descendants(doc,'nope'),[]);
 assert.equal(D.topOf(doc,'a'),'g2');assert.equal(D.topOf(doc,'g1'),'g2');assert.equal(D.topOf(doc,'d'),'d');assert.equal(D.topOf(doc,'g2'),'g2');
 const hidden=run(doc,d=>D.edit.setFlags(d,'g2',{hidden:true}));
 assert.ok(D.hiddenIn(hidden,'a'),'hidden by the outer group');assert.ok(!D.hiddenIn(hidden,'d'));assert.ok(!D.lockedIn(hidden,'a'));
 const locked=run(doc,d=>D.edit.setFlags(d,'g1',{locked:true}));
 assert.ok(D.lockedIn(locked,'b'));assert.ok(!D.lockedIn(locked,'c'),'the outer group is not locked by an inner one');
 // Unhiding takes the flag away again, so hiding and unhiding leaves the design as it was.
 assert.equal(JSON.stringify(run(hidden,d=>D.edit.setFlags(d,'g2',{hidden:false}))),JSON.stringify(doc));
 assert.equal(run(doc,d=>D.edit.setFlags(d,'d',{hidden:false})),doc,'nothing to remove: no change');
 assert.ok(D.checkDoc(locked).ok&&D.checkDoc(hidden).ok);
});

test('bounds as drawn: the box around layers, groups opened, rotation about the top-left corner',()=>{
 let doc=boxes([['a',100,100,200,100],['b',400,300,50,50]]);
 assert.deepEqual(D.boundsOf(doc,['a']),{x:100,y:100,width:200,height:100,rotation:0});
 assert.deepEqual(D.boundsOf(doc,['a','b']),{x:100,y:100,width:350,height:250,rotation:0});
 assert.equal(D.boundsOf(doc,[]),null);assert.equal(D.boundsOf(doc,['nope']),null);
 // A quarter turn clockwise about (100, 100): the box now hangs down and to the left of that corner.
 const turned=D.updateLayer(doc,'a',{rotation:90});
 assert.deepEqual(D.boundsOf(turned,['a']),{x:0,y:100,width:100,height:200,rotation:0});
 const eighth=D.boundsOf(D.updateLayer(doc,'a',{rotation:45}),['a']);
 near(eighth.width,300/Math.SQRT2,'45°: the width of the box around it');near(eighth.height,300/Math.SQRT2,'45°: its height');
 doc=run(doc,d=>D.edit.group(d,['a','b'],'g'));
 assert.deepEqual(D.boundsOf(doc,['g']),{x:100,y:100,width:350,height:250,rotation:0},'a group: around everything in it');
});

// ── Groups, made and taken apart ──────────────────────────────────────────
test('group: side by side only, takes the topmost one’s place, keeps their order inside; one undo step',()=>{
 const doc=boxes([['a',0,0,10,10],['b',20,0,10,10],['c',40,0,10,10],['d',60,0,10,10]]);
 const g=oneStep(doc,d=>D.edit.group(d,['d','b'],'g'));
 assert.deepEqual(top(g),['a','c','g'],'the group sits where the topmost member was');
 assert.deepEqual(top(g,'g'),['b','d'],'members in their order, 0, 1');
 assert.deepEqual(g.layers.g,{id:'g',name:'Group',kind:'group',pageId:P,parentId:null,index:2});
 assert.deepEqual(drawn(g),['a','c','b','d']);
 assert.deepEqual(top(run(doc,d=>D.edit.group(d,['a','c'],'g')),null),['b','g','d']);
 assert.ok(D.checkDoc(g).ok);
 assert.throws(()=>run(doc,d=>D.edit.group(d,['a'],'g')),/^Error: Choose two or more layers to group\.$/);
 assert.throws(()=>run(doc,d=>D.edit.group(d,['a','a','nope'],'g')),/Choose two or more layers to group/);
 assert.throws(()=>run(g,d=>D.edit.group(d,['a','b'],'g2')),/^Error: Only layers side by side in the Layers list can be grouped\.$/,'one inside a group, one outside');
 let paged=D.change(doc,d=>{D.edit.addPage(d,'page-2')});paged=D.addLayer(paged,{kind:'shape',shape:'rect'},'e','page-2');
 assert.throws(()=>run(paged,d=>D.edit.group(d,['a','e'],'g')),/side by side/,'two pages');
 assert.throws(()=>run(g,d=>D.edit.group(d,['a','c'],'g')),/The group couldn’t be made/,'an id already used');
 // A group counts as a layer.
 let full=D.createDoc(PICTURE);for(let i=0;i<D.MAX_LAYERS;i++)full=D.addLayer(full,{kind:'shape',shape:'rect'},'s'+i);
 assert.throws(()=>run(full,d=>D.edit.group(d,['s0','s1'],'g')),/A page holds up to 200 layers/);
});

test('ungroup: what was inside takes the group’s place, in order, hidden or locked as the group was; one undo step',()=>{
 const doc=run(boxes([['a',0,0,10,10],['b',20,0,10,10],['c',40,0,10,10],['d',60,0,10,10]]),d=>D.edit.group(d,['b','c'],'g'));
 assert.deepEqual(top(doc),['a','g','d']);
 let ids;const back=oneStep(doc,d=>{ids=D.edit.ungroup(d,'g')},{exact:false});
 assert.deepEqual(ids,['b','c'],'their ids, back first');
 assert.deepEqual(top(back),['a','b','c','d']);assert.equal(back.layers.g,undefined);assert.equal(back.layers.b.parentId,null);
 assert.deepEqual(Object.values(back.layers).map(l=>l.index).sort(),[0,1,2,3]);
 const hid=run(run(doc,d=>D.edit.setFlags(d,'g',{hidden:true,locked:true})),d=>{D.edit.ungroup(d,'g')});
 assert.equal(hid.layers.b.hidden,true);assert.equal(hid.layers.c.locked,true);assert.equal(hid.layers.a.hidden,undefined);
 // Not a group: nothing happens, and nothing is added to the history.
 let none;const h=H.startHistory(doc);assert.equal(H.apply(h,d=>{none=D.edit.ungroup(d,'a')}),h);assert.deepEqual(none,[]);
 // Nested: the inner group comes out whole.
 const nested=run(run(doc,d=>D.edit.group(d,['g','d'],'outer')),d=>{D.edit.ungroup(d,'outer')});
 assert.deepEqual(top(nested),['a','g','d']);assert.deepEqual(top(nested,'g'),['b','c']);
});

test('place: a layer moves to a place among its siblings, the rest renumbered',()=>{
 const doc=boxes([['a',0,0,10,10],['b',20,0,10,10],['c',40,0,10,10],['d',60,0,10,10]]);
 assert.deepEqual(top(oneStep(doc,d=>D.edit.place(d,'a',2))),['b','c','a','d']);
 assert.deepEqual(top(run(doc,d=>D.edit.place(d,'d',0))),['d','a','b','c']);
 assert.deepEqual(top(run(doc,d=>D.edit.place(d,'a',99))),['b','c','d','a'],'past the end: on top');
 assert.equal(run(doc,d=>D.edit.place(d,'b',1)),doc,'where it already is: no change');
});

// ── Align and distribute ──────────────────────────────────────────────────
test('align: to the page, to the selection, a group whole, a turned layer by what is drawn, locked ones stay',()=>{
 const doc=boxes([['a',100,100,200,100],['b',300,250,50,50]]);
 const to=(how,ids=['a'],box=PAGE)=>run(doc,d=>D.edit.align(d,ids,how,box));
 assert.deepEqual(at(to('left'),'a'),[0,100]);assert.deepEqual(at(to('centre'),'a'),[668,100]);assert.deepEqual(at(to('right'),'a'),[1336,100]);
 assert.deepEqual(at(to('top'),'a'),[100,0]);assert.deepEqual(at(to('middle'),'a'),[100,382]);assert.deepEqual(at(to('bottom'),'a'),[100,764]);
 assert.deepEqual(D.ALIGNS,['left','centre','right','top','middle','bottom']);
 const sel=D.boundsOf(doc,['a','b']);
 const tops=oneStep(doc,d=>D.edit.align(d,['a','b'],'top',sel));
 assert.deepEqual(at(tops,'b'),[300,100]);assert.deepEqual(at(tops,'a'),[100,100]);
 const rights=to('right',['a','b'],sel);assert.deepEqual(at(rights,'a'),[150,100]);assert.deepEqual(at(rights,'b'),[300,250]);
 // A group moves whole, by the box around it; a member chosen too is not moved twice.
 const g=run(doc,d=>D.edit.group(d,['a','b'],'g'));
 const left=run(g,d=>D.edit.align(d,['g','a'],'left',PAGE));
 assert.deepEqual(at(left,'a'),[0,100]);assert.deepEqual(at(left,'b'),[200,250]);
 // A quarter turn: what is drawn lines up, not the layer's own corner.
 const turned=run(D.updateLayer(doc,'a',{rotation:90}),d=>D.edit.align(d,['a'],'left',PAGE));
 assert.equal(D.boundsOf(turned,['a']).x,0);assert.deepEqual(at(turned,'a'),[100,100],'its corner is 100 px right of what it draws');
 // Locked: it stays, and so does a group holding a locked layer.
 const locked=D.change(doc,d=>{D.edit.setFlags(d,'b',{locked:true})});
 const stays=run(locked,d=>D.edit.align(d,['a','b'],'left',PAGE));assert.deepEqual(at(stays,'b'),[300,250]);assert.deepEqual(at(stays,'a'),[0,100]);
 const gl=run(run(locked,d=>D.edit.group(d,['a','b'],'g')),d=>D.edit.align(d,['g'],'left',PAGE));
 assert.deepEqual(at(gl,'a'),[100,100],'a group holding a locked layer does not move');
});

test('distribute: equal gaps between three or four, the first and last stay; locked ones are left out',()=>{
 const three=boxes([['a',0,0,100,10],['b',150,50,50,10],['c',400,90,100,10]]);
 const x3=oneStep(three,d=>D.edit.distribute(d,['c','a','b'],'x'));
 assert.deepEqual(at(x3,'a'),[0,0]);assert.deepEqual(at(x3,'c'),[400,90]);near(x3.layers.b.x,225,'b sits halfway');
 const four=boxes([['a',0,0,100,20],['b',120,0,100,20],['c',500,0,100,20],['d',900,0,100,20]]);
 const x4=run(four,d=>D.edit.distribute(d,['a','b','c','d'],'x'));
 near(x4.layers.b.x,300,'b');near(x4.layers.c.x,600,'c');assert.equal(x4.layers.d.x,900);
 const tall=boxes([['a',0,0,10,100],['b',0,130,10,40],['c',0,600,10,100]]);
 near(run(tall,d=>D.edit.distribute(d,['a','b','c'],'y')).layers.b.y,330,'down the page too');
 const locked=D.change(four,d=>{D.edit.setFlags(d,'b',{locked:true})});
 const skip=run(locked,d=>D.edit.distribute(d,['a','b','c','d'],'x'));
 assert.equal(skip.layers.b.x,120,'locked: left where it is');near(skip.layers.c.x,450,'the others share the space');
 assert.equal(run(locked,d=>D.edit.distribute(d,['a','b','c'],'x')),locked,'fewer than three that can move: nothing');
 assert.equal(run(four,d=>D.edit.distribute(d,['a','b'],'x')),four);
});

// ── Names, flags, the page ────────────────────────────────────────────────
test('rename: trimmed, at most the name length, never empty or a link; groups too',()=>{
 const doc=run(boxes([['a',0,0,10,10],['b',20,0,10,10]]),d=>D.edit.group(d,['a','b'],'g'));
 assert.equal(oneStep(doc,d=>D.edit.rename(d,'a','  Badge  ')).layers.a.name,'Badge');
 assert.equal(run(doc,d=>D.edit.rename(d,'g','Header')).layers.g.name,'Header');
 assert.equal(run(doc,d=>D.edit.rename(d,'a','x'.repeat(200))).layers.a.name.length,D.NAME_MAX);
 assert.equal(run(doc,d=>D.edit.rename(d,'a','Line\none')).layers.a.name,'Line one');
 assert.throws(()=>run(doc,d=>D.edit.rename(d,'a','   ')),/^Error: Give it a name\.$/);
 assert.throws(()=>run(doc,d=>D.edit.rename(d,'a','https://example.test/x')),/^Error: A name can’t be a link\.$/);
 assert.equal(run(doc,d=>D.edit.rename(d,'nope','X')),doc);
});

test('a page’s background: a colour, or a picture of this Studio by its key',()=>{
 const doc=D.createDoc(PICTURE);
 const blue=oneStep(doc,d=>D.edit.setBackground(d,P,{kind:'colour',colour:'#1144ff'}));
 assert.deepEqual(blue.pages[0].background,{kind:'colour',colour:'#1144ff'});
 const pic=run(blue,d=>D.edit.setBackground(d,P,{kind:'picture',asset:'images/00000000-0000-4000-8000-000000020002'}));
 assert.deepEqual(pic.pages[0].background,{kind:'picture',asset:'images/00000000-0000-4000-8000-000000020002'});
 assert.ok(D.checkDoc(pic).ok);
 assert.throws(()=>run(doc,d=>D.edit.setBackground(d,P,{kind:'colour',colour:'blue'})),/^Error: That isn’t a colour\.$/);
 assert.throws(()=>run(doc,d=>D.edit.setBackground(d,P,{kind:'picture',asset:'logos/00000000-0000-4000-8000-000000020003'})),/^Error: Only pictures from this Studio can be a page’s background\.$/);
 assert.throws(()=>run(doc,d=>D.edit.setBackground(d,P,{kind:'picture',asset:'https://example.test/a.png'})),/Only pictures from this Studio/);
 assert.throws(()=>run(doc,d=>D.edit.setBackground(d,'page-9',{kind:'colour',colour:'#000000'})),/^Error: That page is no longer in the design\.$/);
 assert.equal(run(blue,d=>D.edit.setBackground(d,P,{kind:'colour',colour:'#1144ff'})),blue,'the same: no change');
});

// ── Smart guides and equal spacing ────────────────────────────────────────
test('snapping: the page’s lines, other layers’ edges with guides from the box to them, never a hidden or ignored one',()=>{
 const page=D.snapBox(D.createDoc(PICTURE),P,{x:768-100+4,y:432-50-3,width:200,height:100,rotation:0},new Set(),6);
 assert.deepEqual([page.dx,page.dy],[-4,3]);
 assert.deepEqual(page.guides,[{orientation:'v',at:768},{orientation:'h',at:432}],'the page’s own lines: across the whole page');
 assert.deepEqual(page.gaps,[]);
 const doc=boxes([['t',600,100,100,100]]);
 const edge=D.snapBox(doc,P,{x:703,y:400,width:50,height:50,rotation:0},new Set(),6);
 assert.deepEqual([edge.dx,edge.dy],[-3,0]);
 assert.deepEqual(edge.guides,[{orientation:'v',at:700,from:100,to:450}],'from the layer down to the box');
 assert.deepEqual(D.snapBox(doc,P,{x:703,y:400,width:50,height:50,rotation:0},new Set(['t']),6).guides,[],'ignored: not a target');
 assert.deepEqual(D.snapBox(D.change(doc,d=>{D.edit.setFlags(d,'t',{hidden:true})}),P,{x:703,y:400,width:50,height:50,rotation:0},new Set(),6).guides,[],'hidden: not a target');
 // Ignoring a group ignores what is in it (moving a group never snaps to itself).
 const grouped=run(boxes([['a',600,100,100,100],['b',900,500,10,10]]),d=>D.edit.group(d,['a','b'],'g'));
 assert.equal(D.snapBox(grouped,P,{x:703,y:400,width:50,height:50,rotation:0},new Set(['g']),6).dx,0);
 // A turned layer is a target by what it draws: a quarter turn of (600,100,100,100) spans x 500 to 600.
 const turned=D.snapBox(boxes([['r',600,100,100,100,90]]),P,{x:503,y:400,width:50,height:50,rotation:0},new Set(),6);
 assert.equal(turned.dx,-3);assert.equal(turned.guides[0].at,500);
 // The older call still works: the box's position and guides.
 const old=D.snap(doc,P,{id:'m',x:703,y:400,width:50,height:50,rotation:0},6);
 assert.deepEqual([old.x,old.y],[700,400]);
});

test('equal spacing: a gap made equal to one already there, or the middle of two neighbours, with both gaps marked',()=>{
 const row=boxes([['A',100,100,100,100],['B',300,100,100,100]]);
 const s=D.snapBox(row,P,{x:497,y:100,width:100,height:100,rotation:0},new Set(),6);
 assert.equal(s.dx,3,'the gap after B becomes A to B’s');
 assert.deepEqual(s.gaps,[{axis:'x',start:400,end:500,at:150},{axis:'x',start:200,end:300,at:150}]);
 assert.ok(s.guides.every(g=>g.orientation==='h'),'the other axis lines up by edges as usual');
 const before=D.snapBox(row,P,{x:-3-100+4,y:100,width:100,height:100,rotation:0},new Set(),6);
 assert.deepEqual(before.gaps,[],'nothing within reach before A');
 const sides=boxes([['L',100,100,100,100],['R',500,100,100,100]]);
 const m=D.snapBox(sides,P,{x:297,y:110,width:100,height:50,rotation:0},new Set(),6);
 assert.equal(m.dx,3,'right in the middle');
 assert.equal(m.dy,0);assert.deepEqual(m.gaps,[{axis:'x',start:200,end:300,at:135},{axis:'x',start:400,end:500,at:135}]);
 const col=boxes([['A',100,100,100,100],['B',100,300,100,100]]);
 const v=D.snapBox(col,P,{x:100,y:502,width:100,height:100,rotation:0},new Set(),6);
 assert.equal(v.dy,-2);assert.deepEqual(v.gaps,[{axis:'y',start:400,end:500,at:150},{axis:'y',start:200,end:300,at:150}]);
 // A nearer edge wins over an equal gap further away.
 const edgeFirst=D.snapBox(boxes([['A',100,100,100,100],['B',300,100,100,100],['C',600,400,100,100]]),P,{x:495,y:100,width:100,height:100,rotation:0},new Set(),6);
 assert.equal(edgeFirst.dx,5);assert.deepEqual(edgeFirst.gaps,[]);
});

test('snapping stays quick on a busy page: 50 layers, 200 moves',()=>{
 const spec=Array.from({length:50},(_,i)=>['l'+i,(i*97)%1400,(i*53)%800,40+(i%7)*10,30+(i%5)*10,i%9===0?15:0]);
 const doc=boxes(spec);
 const t0=performance.now();
 for(let i=0;i<200;i++)D.snapBox(doc,P,{x:(i*37)%1400,y:(i*29)%800,width:120,height:80,rotation:0},new Set(['l0']),6);
 const each=(performance.now()-t0)/200;
 assert.ok(each<2,`${each.toFixed(3)} ms a move`);
});
