// Editor panel rules (feat/editor-panel-rules): the review of the document operations, as the
// owner asked before PR B leaves draft. Four promises, each over every operation the editor makes
// (lib/editor/doc.ts `edit`, and the several-layer changes components/canvas/editor-page.tsx runs
// in one recipe):
//   1. every operation is one undo step, and Undo gives the design back;
//   2. no operation stores an address (a signed link or any URL): the design keeps storage keys only;
//   3. group, ungroup, place and reorder keep every layer's id (and everything else about it);
//   4. nothing changes a design outside the history: the operations only touch immer's draft.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as D from '../lib/editor/doc.ts';
import * as H from '../lib/editor/history.ts';

const PICTURE={id:'00000000-0000-4000-8000-000000010000',width:1536,height:864};
const P='page-1',UPLOAD='00000000-0000-4000-8000-000000010777';
const SIGNED='https://bucket.s3.example.test/images/x.png?X-Amz-Signature=abc';
/** Sorted-key JSON: the same design whatever order immer put keys back in. */
const canon=(v)=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:1)):x);
/** Frozen all the way down: a write anywhere but immer's draft throws (modules run in strict mode). */
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))deepFreeze(x)}return v}

/** A design with one of each kind, a group of two, and a second page. */
function sample(){
 let d=D.createDoc(PICTURE);
 const add=(a,id)=>{d=D.addLayer(d,a,id)};
 add({kind:'image',src:'/api/assets/'+UPLOAD,assetId:UPLOAD,name:'Upload',source:'upload',naturalWidth:400,naturalHeight:300},'pic');
 add({kind:'text',style:'heading',text:'Demo SUV'},'txt');
 add({kind:'shape',shape:'rect'},'box');
 add({kind:'shape',shape:'circle'},'dot');
 add({kind:'line'},'ln');
 add({kind:'frame',ratio:1.5},'frm');
 add({kind:'icon',icon:'car',name:'Car',paths:['M2 12h20']},'ico');
 d=D.updateLayer(d,'box',{x:100,y:100,width:200,height:100});
 d=D.updateLayer(d,'dot',{x:400,y:100,width:100,height:100});
 d=D.updateLayer(d,'ln',{x:700,y:100});
 d=D.change(d,x=>{D.edit.group(x,['box','dot'],'grp')});
 d=D.change(d,x=>{D.edit.addPage(x,'page-2',P)});
 return d;
}
const ALL=['pic','txt','grp','ln','frm','ico'];

// Every operation the editor makes, as the recipe it runs. `several`: the editor's own multi-layer recipes.
const OPERATIONS={
 'add':(d)=>D.edit.add(d,P,{kind:'shape',shape:'star'},'new'),
 'update: position':(d)=>D.edit.update(d,'txt',{x:12,y:34}),
 'update: opacity':(d)=>D.edit.update(d,'pic',{opacity:0.4}),
 'update: corner radius and flips':(d)=>D.edit.update(d,'pic',{radius:24,flipX:true,flipY:true}),
 'update: line and letter spacing':(d)=>D.edit.update(d,'txt',{lineHeight:1.6,letterSpacing:4}),
 'remove':(d)=>D.edit.remove(d,'ln'),
 'remove a group':(d)=>D.edit.remove(d,'grp'),
 'duplicate':(d)=>{D.edit.duplicate(d,'txt',()=>'txt-copy',{x:10,y:10})},
 'duplicate a group':(d)=>{D.edit.duplicate(d,'grp',(old)=>old+'-copy',{x:10,y:10})},
 'reorder':(d)=>D.edit.reorder(d,'txt','front'),
 'place':(d)=>D.edit.place(d,'ico',0),
 'nudge a group':(d)=>D.edit.nudge(d,'grp',10,0),
 'group':(d)=>D.edit.group(d,['pic','txt'],'grp-2'),
 'ungroup':(d)=>{D.edit.ungroup(d,'grp')},
 'align to the page':(d)=>D.edit.align(d,['ln'],'centre',{x:0,y:0,width:1536,height:864,rotation:0}),
 'align several':(d)=>D.edit.align(d,['txt','ln','frm'],'top',D.boundsOf(d,['txt','ln','frm'])),
 'distribute':(d)=>D.edit.distribute(d,['pic','grp','ln'],'x'),
 'rename':(d)=>D.edit.rename(d,'grp','Wheels'),
 'hide':(d)=>D.edit.setFlags(d,'grp',{hidden:true}),
 'lock':(d)=>D.edit.setFlags(d,'txt',{locked:true}),
 'background: a colour':(d)=>D.edit.setBackground(d,P,{kind:'colour',colour:'#123456'}),
 'background: the picture':(d)=>D.edit.setBackground(d,'page-2',{kind:'picture',asset:'images/'+PICTURE.id}),
 'add a page':(d)=>D.edit.addPage(d,'page-3',P),
 'duplicate a page':(d)=>D.edit.duplicatePage(d,P,'page-3',(old)=>old+'-p3'),
 'move a page':(d)=>D.edit.movePage(d,'page-2',0),
 'remove a page':(d)=>D.edit.removePage(d,'page-2'),
 'several: duplicate':(d)=>{for(const id of ['txt','ico'])D.edit.duplicate(d,id,()=>id+'-copy',{x:5,y:5})},
 'several: delete':(d)=>{for(const id of ['txt','ico','grp'])D.edit.remove(d,id)},
 'several: nudge':(d)=>{for(const id of ['txt','ico','grp'])D.edit.nudge(d,id,0,-10)},
 'several: to the front':(d)=>{for(const id of ['txt','ico'])D.edit.reorder(d,id,'front')},
 'several: opacity':(d)=>{for(const id of ['txt','ico','pic'])D.edit.update(d,id,{opacity:0.5})},
 'several: lock':(d)=>{for(const id of ['txt','grp'])D.edit.setFlags(d,id,{locked:true})},
};

test('1 and 4: every operation is one undo step on a frozen design; Undo gives it back, Redo the change',()=>{
 const base=deepFreeze(sample()),before=JSON.stringify(base);
 for(const [name,recipe] of Object.entries(OPERATIONS)){
  const h0=H.startHistory(base);
  let h1;
  assert.doesNotThrow(()=>{h1=H.apply(h0,d=>{recipe(d)})},`${name}: wrote outside the draft`);
  assert.equal(h1.past.length,1,`${name}: one undo step`);
  assert.notEqual(h1.present,base,`${name}: changed the design`);
  assert.equal(canon(H.undo(h1).present),canon(base),`${name}: Undo gives the design back`);
  assert.equal(canon(H.redo(H.undo(h1)).present),canon(h1.present),`${name}: Redo gives the change back`);
  assert.equal(JSON.stringify(base),before,`${name}: the design before it is untouched`);
 }
});

test('1: a gesture is one step however many changes it makes, and a refused or empty change makes none',()=>{
 const base=sample();
 let h=H.startHistory(base);
 for(let i=1;i<=20;i++)h=H.apply(h,d=>{D.edit.update(d,'pic',{opacity:i/20})},'opacity:pic');
 assert.equal(h.past.length,1,'a slider drag of twenty moves is one step');
 h=H.end(h);h=H.apply(h,d=>{D.edit.update(d,'pic',{opacity:0.3})},'opacity:pic');
 assert.equal(h.past.length,2,'a second drag of the same slider, after letting go, is a second step');
 const same=H.apply(h,d=>{D.edit.align(d,['ln'],'left',{x:D.boundsOf(base,['ln']).x,y:0,width:1,height:1,rotation:0})});
 assert.equal(same,h,'a change that changes nothing adds no step');
 assert.throws(()=>H.apply(h,d=>{D.edit.group(d,['txt'],'g')}),/two or more/);
 // The panel ends a slider's step when it is let go (components/canvas/design-panel.tsx).
 const panel=readFileSync('components/canvas/design-panel.tsx','utf8');
 assert.match(panel,/onPointerUp=\{e=>\{if\(\(e\.target as HTMLElement\)\.matches\?\.\('input\[type="range"\]'\)\)actions\.endGesture\(\)\}\}/);
});

test('2: no operation stores an address; a picture is a storage key',()=>{
 const base=sample();
 const refuse=(recipe,why)=>assert.throws(()=>D.change(base,d=>{recipe(d)}),why);
 refuse(d=>D.edit.update(d,'pic',{asset:SIGNED}),/Only pictures from this Studio/);
 refuse(d=>D.edit.update(d,'pic',{asset:'images/../../etc'}),/Only pictures from this Studio/);
 refuse(d=>D.edit.update(d,'txt',{font:SIGNED}),/can’t be a link/);
 refuse(d=>D.edit.update(d,'txt',{name:'//cdn.example.test/a.png'}),/can’t be a link/);
 refuse(d=>D.edit.rename(d,'grp',SIGNED),/can’t be a link/);
 refuse(d=>D.edit.setBackground(d,P,{kind:'picture',asset:SIGNED}),/Only pictures from this Studio/);
 refuse(d=>D.edit.setBackground(d,P,{kind:'picture',asset:'logos/'+UPLOAD}),/Only pictures from this Studio/);
 refuse(d=>D.edit.add(d,P,{kind:'image',src:SIGNED,name:'Outside',source:'upload'},'out'),/Only pictures from this Studio/);
 // A field the format doesn't have is never set, so it can't carry a link in.
 const extra=D.change(base,d=>{D.edit.update(d,'pic',{src:SIGNED,thumbnail:SIGNED})});
 assert.equal(extra,base,'an unknown field changes nothing');
 // Typed words may say an address; that is text, not a link the design follows.
 const said=D.change(base,d=>{D.edit.update(d,'txt',{text:'Visit https://example.test'})});
 assert.equal(said.layers.txt.text,'Visit https://example.test');
 // After every operation above, the design holds no address outside typed words.
 let d=base;for(const recipe of Object.values(OPERATIONS))d=D.change(d,x=>{recipe(x)});
 const words=Object.values(d.layers).filter(l=>l.kind==='text').map(l=>l.text);
 const stored=JSON.stringify({...d,layers:Object.fromEntries(Object.entries(d.layers).map(([k,l])=>[k,{...l,text:undefined}]))});
 assert.doesNotMatch(stored,/:\/\/|x-amz-|signature=/i,'nothing but typed words may hold an address');
 assert.ok(words.length>0);
});

test('2: what reaches storage: a link in any field is refused, and only each kind’s own fields are kept',()=>{
 const base=sample();
 const withExtra=JSON.parse(JSON.stringify(base));
 withExtra.layers.pic.thumbnail=SIGNED;
 assert.deepEqual(D.checkDoc(withExtra),{ok:false,reason:'link'},'a signed link in a field the format doesn’t have is refused');
 const inPaths=JSON.parse(JSON.stringify(base));inPaths.layers.ico.paths=['M0 0',SIGNED];
 assert.equal(D.checkDoc(inPaths).ok,false,'or in a list');
 const inText=JSON.parse(JSON.stringify(base));inText.layers.txt.text='See https://example.test';
 assert.equal(D.checkDoc(inText).ok,true,'typed words may say an address');
 // cleanDoc (what the save, draft and restore routes write) keeps only each kind's own fields.
 const plain=JSON.parse(JSON.stringify(base));plain.layers.pic.note='kept by no one';plain.layers.grp.colour='#ffffff';plain.extra=true;
 const clean=D.cleanDoc(plain);
 assert.equal('note' in clean.layers.pic,false);assert.equal('colour' in clean.layers.grp,false);assert.equal('extra' in clean,false);
 assert.equal(canon(clean),canon(D.cleanDoc(base)),'everything of its own is kept');
 assert.equal(D.checkDoc(clean).ok,true);
 // The four real v1 files still read, upgrade and survive cleanDoc unchanged.
 for(const f of readdirSync('tests/fixtures/editor-v1')){
  const r=D.readDoc(JSON.parse(readFileSync('tests/fixtures/editor-v1/'+f,'utf8')));
  assert.equal(r.ok,true,f);assert.equal(canon(D.cleanDoc(r.doc)),canon(r.doc),f+': nothing of its own is dropped');
 }
});

test('3: group, ungroup, place and reorder keep every layer’s id and everything else about it',()=>{
 const base=sample();
 const ids=(doc)=>Object.keys(doc.layers).sort();
 const own=(l)=>{const {index:_i,parentId:_p,...rest}=l;void _i;void _p;return canon(rest)};
 const kept=(a,b,which)=>{for(const id of which)assert.equal(own(b.layers[id]),own(a.layers[id]),`${id} is the same layer`)};
 // Group: the same layers inside, under the new group; nothing else renamed or remade.
 const grouped=D.change(base,d=>{D.edit.group(d,['pic','txt','ln'],'grp-2')});
 assert.deepEqual(ids(grouped),[...ids(base),'grp-2'].sort());
 kept(base,grouped,Object.keys(base.layers));
 for(const id of ['pic','txt','ln'])assert.equal(grouped.layers[id].parentId,'grp-2');
 // Ungroup: the same ids come back out, in order, where the group was; group then ungroup is the design as it was.
 let out=[];const ungrouped=D.change(grouped,d=>{out=D.edit.ungroup(d,'grp-2')});
 assert.deepEqual(out,['pic','txt','ln']);
 assert.deepEqual(ids(ungrouped),ids(base));
 // Layers that were not neighbours come out together, where the topmost was; neighbours come out as they were.
 assert.deepEqual(D.siblings(ungrouped,P,null).map(l=>l.id),['grp','pic','txt','ln','frm','ico']);
 const near=D.change(D.change(base,d=>{D.edit.group(d,['ln','frm'],'grp-3')}),d=>{D.edit.ungroup(d,'grp-3')});
 assert.equal(canon(near),canon(base),'neighbours grouped, then ungrouped: the same design');
 // Ungrouping a group that was there from the start: its layers keep their ids.
 const apart=D.change(base,d=>{out=D.edit.ungroup(d,'grp')});
 assert.deepEqual(out,['box','dot']);assert.deepEqual(ids(apart),ids(base).filter(i=>i!=='grp'));
 kept(base,apart,['box','dot']);
 // Place and reorder: only the order changes.
 for(const [name,recipe] of [['place',d=>D.edit.place(d,'ico',0)],['reorder',d=>D.edit.reorder(d,'pic','front')],['several to the back',d=>{for(const id of ['txt','ico'])D.edit.reorder(d,id,'back')}]]){
  const moved=D.change(base,recipe);
  assert.deepEqual(ids(moved),ids(base),name);kept(base,moved,Object.keys(base.layers));
  assert.notEqual(canon(D.siblings(moved,P,null).map(l=>l.id)),canon(D.siblings(base,P,null).map(l=>l.id)),name+' changed the order');
 }
 // Undo of each is the same ids again (the history keeps the layers themselves, not copies with new ids).
 const h=H.apply(H.startHistory(base),d=>{D.edit.group(d,['pic','txt'],'g3')});
 assert.deepEqual(ids(H.undo(h).present),ids(base));
});

test('4: the editor changes a design only through the history (no writes to the design in its components)',()=>{
 const dir='components/canvas';
 for(const f of readdirSync(dir).filter(n=>/\.tsx?$/.test(n))){
  const src=readFileSync(`${dir}/${f}`,'utf8');
  // An assignment into the design itself (doc.layers[...] = …, doc.pages.push(…), history.present.… = …).
  assert.doesNotMatch(src,/\b(doc|start|history\.present|live\.current\.present)\.(layers|pages|width|height|base)\b(\[[^\]]*\])?(\.\w+)*\s*(=(?!=)|\+=|-=)/,`${f} writes into the design`);
  assert.doesNotMatch(src,/\b(doc|history\.present)\.(layers|pages)(\[[^\]]*\])?\.(push|splice|pop|shift|unshift|sort|reverse)\(/,`${f} changes the design's lists in place`);
 }
 // Every change in the editor goes through change(recipe) or the history's own undo, redo and end.
 const page=readFileSync(`${dir}/editor-page.tsx`,'utf8');
 assert.match(page,/const change=React\.useCallback\(/);
 assert.match(page,/try\{setHistory\(h=>apply\(h,recipe,gesture\)\);return true\}/);
 assert.doesNotMatch(page,/setHistoryState\((?!next\))/,'the history is set in one place');
});

test('a design never opens without its working draft before the account is known (and is then saved over it)',()=>{
 // Before the account answers, can() says no one may edit, and a load made then skips the draft. Opened from that load,
 // the editor showed the design without its draft and autosave wrote over the draft at the next change (found by the
 // Safari journey editor-duplicate-design, where the account answers later than the picture).
 const page=readFileSync('components/canvas/editor-page.tsx','utf8');
 assert.match(page,/const \[accountIn,setAccountIn\]=React\.useState\(accountKnown\);/,'the page knows whether the account has answered');
 assert.match(page,/void loadAccount\(\)\.then\(\(\)=>\{if\(live\)setAccountIn\(true\)\}\)/,'and waits for it');
 assert.match(page,/const loaded=useVisual\(id,attempt,mayEdit,here\|\|!accountIn\);/,'nothing loads until it has');
 assert.match(page,/key=\(id\|\|''\)\+'#'\+attempt\+\(mayEdit\?'#edit':'#view'\);/,'a load for a viewer is never shown to someone who may edit');
 assert.match(page,/<Editor key=\{`\$\{attempt\}:\$\{shown\.visual\.id\}\$\{shown\.design\?':layers':''\}\$\{mayEdit\?':edit':''\}`\}/,'the editor starts again when the access changes');
 // The draft is only read for someone who may edit; the page still says so.
 assert.match(page,/async function loadDraft\(id:string,mayEdit:boolean\)[^\n]*\n if\(!mayEdit\)return \{doc:null,unsent:false\};/);
});
