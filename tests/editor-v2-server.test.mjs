// Editor format v2 on the server (feat/editor-core-v2), against the real
// handlers with SQLite built from the migrations and the local S3 stand-in:
// every saved v1 design (tests/fixtures/editor-v1, written by the v1 editor
// itself) reopens unchanged as v2; a design never stores a signed link; the
// original stays byte for byte after Save and Restore; Duplicate design makes
// "Copy of <name>" in the same folder; autosave's working draft; the version
// history (migration 0012); and the soft lock. Synthetic data only.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import * as D from '../lib/editor/doc.ts';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const FIXTURES=new URL('./fixtures/editor-v1/',import.meta.url);
const fixtures=readdirSync(FIXTURES).filter(f=>f.endsWith('.json')).sort().map(f=>({name:f,text:readFileSync(new URL(f,FIXTURES),'utf8')}));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG=id(0xc),OWNER={id:id(0xc1),email:'owner@example.test'},CREATOR={id:id(0xc2),email:'creator@example.test'},VIEWER={id:id(0xc3),email:'viewer@example.test'};
const full={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'8k','studio.key_visuals':true}};
const ORIGIN='http://studio.test',P='page-1';
const LOGO={kind:'image',src:'/api/brand-kit/logos/00000000-0000-4000-8000-00000000c0de',name:'Demo logo',source:'logo',naturalWidth:400,naturalHeight:100};
const UPLOAD={kind:'image',src:'/api/assets/'+id(0x20001),assetId:id(0x20001),name:'Upload',source:'upload',naturalWidth:1200,naturalHeight:800};
// A stored design or a response: no address of any kind, and no mark of a signed storage link.
const NO_LINK=/:\/\/|x-amz-|signature=/i;
let s3,store,routes,prefix,theirs,ready;const realFetch=globalThis.fetch;
const pngOf=(w,h,fill=0)=>{const b=Buffer.alloc(80,fill);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b};
const json=(v)=>JSON.stringify(v);
const putJson=(key,v)=>store.put(key,typeof v==='string'?v:json(v),{httpMetadata:{contentType:'application/json'}});
const text=async(key)=>(await store.get(key))?.text();
const bytes=async(key)=>{const o=await store.get(key);return o?Buffer.from(await o.arrayBuffer()):null};

/** A ready picture of the owner's (its record and image), w x h. */
async function picture(n,{w=1536,h=864,title='Demo SUV · Studio white',extra={}}={}){
 const v={id:id(n),title,src:'/api/assets/'+id(n),status:'ready',createdAt:'2026-11-01T10:00:00.000Z',width:w,height:h,size:w+'x'+h,vehicle:'Demo SUV',...extra};
 await putJson(prefix+'visuals/'+v.id+'.json',v);await store.put(prefix+'images/'+v.id,pngOf(w,h,n%250),{httpMetadata:{contentType:'image/png'}});
 return v;
}

before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('Network calls are not allowed in this test: '+u)};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG,name:'Demo Company C',kind:'client'}],
  members:[{userId:OWNER.id,orgId:ORG,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG,role:'creator',status:'active'},{userId:VIEWER.id,orgId:ORG,role:'viewer',status:'active'}],
  staff:{},entitlements:{[ORG]:full},grants:{},
 });
 // Migration 0012 is checked for once a minute: before it runs (no table), nothing waits on it.
 ready=(await import('@/lib/trash-ready.ts')).designsReady;
 const missing={prepare:()=>({first:async()=>{throw new Error('no such table: design_versions')}})};
 assert.equal(await ready(missing,0),false,'before 0012: the history and the soft lock wait for it');
 routes={
  save:(await import('@/app/api/edits/route.ts')).POST,
  open:(await import('@/app/api/edits/[id]/route.ts')).GET,
  draft:await import('@/app/api/edits/[id]/draft/route.ts'),
  versions:(await import('@/app/api/edits/[id]/versions/route.ts')).GET,
  restore:(await import('@/app/api/edits/[id]/restore/route.ts')).POST,
  presence:await import('@/app/api/edits/[id]/presence/route.ts'),
 };
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 const tenancy=await import('@/lib/portable/tenancy.ts');
 prefix=tenancy.userPrefix(ORG,OWNER.id);theirs=tenancy.userPrefix(ORG,CREATOR.id);
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});

function as(user){state.user=user;state.chosenOrg=null;state.chosenBrand=null}
const answer=async(r)=>{const t=await r.text();let body;try{body=JSON.parse(t)}catch{body=t}return {status:r.status,body,raw:t}};
async function save({doc,parentId,copy=false,image}){
 const form=new FormData();form.set('parentId',parentId);form.set('doc',typeof doc==='string'?doc:json(doc));if(copy)form.set('copy','1');
 form.set('image',new File([image||pngOf(doc.width||1536,doc.height||864,9)],'design.png',{type:'image/png'}));
 return answer(await routes.save(new Request(ORIGIN+'/api/edits',{method:'POST',headers:{origin:ORIGIN},body:form})));
}
const at=(path,pictureId)=>[`${ORIGIN}/api/edits/${pictureId}${path}`,{params:Promise.resolve({id:pictureId})}];
async function open(pictureId){const [u,p]=at('',pictureId);return answer(await routes.open(new Request(u),p))}
async function draft(method,pictureId,body,{origin=ORIGIN,raw}={}){
 const [u,p]=at('/draft',pictureId);
 return answer(await routes.draft[method](new Request(u,{method,headers:{origin,'content-type':'application/json'},...(body!==undefined||raw!==undefined?{body:raw??json(body)}:{})}),p));
}
async function versions(pictureId){const [u,p]=at('/versions',pictureId);return answer(await routes.versions(new Request(u),p))}
async function restore(versionId,parentId){const [u,p]=at('/restore',versionId);return answer(await routes.restore(new Request(u,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:json({parentId})}),p))}
async function presence(method,pictureId,body){
 const [u,p]=at('/presence',pictureId);
 return answer(await routes.presence[method](new Request(u,{method,headers:{origin:ORIGIN,'content-type':'application/json'},...(body?{body:json(body)}:{})}),p));
}
const pause=()=>new Promise(r=>setTimeout(r,5));

test('every saved v1 design (written by the v1 editor) reopens unchanged, as v2',async()=>{
 as(OWNER);
 // The originals under the fixtures (their ids, as the v1 editor's tests wrote them).
 await picture(10000);await picture(10001,{w:1024,h:1024,title:'Demo Hatch · Square'});
 let n=0;
 for(const f of fixtures){
  const v1=JSON.parse(f.text),num=0x30000+n++,saved=id(num);
  // A picture saved by the v1 editor: its record (edit without a design id) and its layers, kept verbatim.
  await picture(num,{w:v1.width,h:v1.height,title:'Demo SUV · edited',extra:{parentId:v1.background.visualId,edit:{parentId:v1.background.visualId,parentSrc:v1.background.src,layers:v1.layers.length}}});
  await putJson(prefix+'edits/'+saved+'.json',f.text);
  const r=await open(saved);
  assert.equal(r.status,200,f.name+': '+r.raw);
  const doc=r.body.design;
  assert.equal(D.checkDoc(doc).ok,true,f.name+': a v2 design');
  assert.equal(doc.schemaVersion,2);assert.deepEqual([doc.width,doc.height],[v1.width,v1.height]);
  assert.equal(doc.base,v1.background.visualId,f.name+': over the same original');
  assert.deepEqual(doc.pages,[{id:P,background:{kind:'picture',asset:'images/'+v1.background.visualId}}]);
  assert.equal(r.body.designId,v1.background.visualId,'an older save belongs to the design of its original');
  assert.deepEqual(D.drawOrder(doc,P).map(l=>l.id),v1.layers.map(l=>l.id),f.name+': the same layers, in the same order');
  v1.layers.forEach((l,index)=>{
   const got=doc.layers[l.id],{src,assetId,...rest}=l;
   for(const [k,value] of Object.entries(rest))assert.deepEqual(got[k],value,`${f.name}: ${l.id} keeps ${k}`);
   assert.deepEqual([got.pageId,got.parentId,got.index],[P,null,index]);
   if(l.kind==='image')assert.equal(got.asset,assetId?'images/'+assetId:D.assetKeyOf(src),'its address became its storage key');
   else assert.equal(got.asset,undefined);
  });
  assert.equal(await text(prefix+'edits/'+saved+'.json'),f.text,'reading never rewrites the v1 file');
  assert.doesNotMatch(r.raw,NO_LINK);
 }
 // A reopened v1 design saved again: kept as v2, the v1 file of the version opened untouched.
 const v1=JSON.parse(fixtures.find(f=>f.name==='every-kind.json').text),opened=id(0x30000+fixtures.findIndex(f=>f.name==='every-kind.json'));
 const reopened=(await open(opened)).body.design;
 const r=await save({doc:D.updateLayer(reopened,v1.layers[1].id,{text:'Changed'}),parentId:opened});
 assert.equal(r.status,200,r.raw);
 const kept=JSON.parse(await text(prefix+'edits/'+r.body.visual.id+'.json'));
 assert.equal(kept.schemaVersion,2);assert.equal(kept.layers[v1.layers[1].id].text,'Changed');assert.equal(Object.keys(kept.layers).length,v1.layers.length);
 assert.equal(r.body.visual.edit.designId,v1.background.visualId,'the next version of the same design');
});

test('a design never stores a signed link: storage keys only, and an address in a picture’s place is refused',async()=>{
 as(OWNER);
 const original=await picture(0x11000,{title:'Demo Saloon · City night'});
 let doc=D.createDoc(original);
 doc=D.addLayer(D.addLayer(doc,UPLOAD,'u'),LOGO,'l');
 assert.equal(doc.layers.u.asset,'images/'+id(0x20001));assert.equal(doc.layers.l.asset,'logos/00000000-0000-4000-8000-00000000c0de');
 const saved=await save({doc,parentId:original.id});assert.equal(saved.status,200,saved.raw);
 const keptText=await text(prefix+'edits/'+saved.body.visual.id+'.json');
 assert.doesNotMatch(keptText,NO_LINK,'the kept design');assert.doesNotMatch((await open(saved.body.visual.id)).raw,NO_LINK,'and what reopening answers');
 // An address where a storage key belongs: refused by Save and by autosave.
 const signed={...doc,layers:{...doc.layers,u:{...doc.layers.u,asset:'https://bucket.s3.example.test/images/x?X-Amz-Signature=abc'}}};
 assert.equal((await save({doc:signed,parentId:original.id})).status,400);
 assert.equal((await draft('PUT',original.id,{doc:signed,rev:1})).status,400);
 assert.equal((await draft('PUT',original.id,{doc:{...doc,pages:[{id:P,background:{kind:'picture',asset:'/api/assets/'+original.id}}]},rev:1})).status,400,'the background too');
 // A v1 design with an outside address (never written by the Studio's panels) keeps its place as an empty frame, with no address.
 const v1={width:1536,height:864,background:{visualId:original.id,src:original.src},layers:[{x:10,y:10,width:100,height:50,rotation:0,id:'outside',kind:'image',name:'Picture',src:'https://elsewhere.example.test/x.png?X-Amz-Signature=1',source:'upload'}]};
 const old=await save({doc:v1,parentId:original.id});assert.equal(old.status,200,old.raw);
 const keptOld=JSON.parse(await text(prefix+'edits/'+old.body.visual.id+'.json'));
 assert.doesNotMatch(json(keptOld),NO_LINK);assert.equal(keptOld.layers.outside.kind,'frame');assert.equal(keptOld.layers.outside.x,10);
 // The working draft and a restored version keep keys only too.
 assert.equal((await draft('PUT',original.id,{doc,rev:1})).status,200);
 assert.doesNotMatch(await text(prefix+'drafts/'+original.id+'.json'),NO_LINK,'the draft');
 const back=await restore(saved.body.visual.id,old.body.visual.id);assert.equal(back.status,200,back.raw);
 assert.doesNotMatch(await text(prefix+'edits/'+back.body.visual.id+'.json'),NO_LINK,'a restored version');
 assert.doesNotMatch(back.raw,NO_LINK);
});

test('the original stays byte for byte after Save and after Restore; restoring makes a new version',async()=>{
 as(OWNER);
 const original=await picture(0x12000,{title:'Demo SUV · Coast road'});
 const snap=async(pid,withDesign=true)=>({image:await bytes(prefix+'images/'+pid),record:await text(prefix+'visuals/'+pid+'.json'),design:withDesign?await text(prefix+'edits/'+pid+'.json'):null});
 const was=await snap(original.id,false);
 const v1=(await save({doc:D.addLayer(D.createDoc(original),{kind:'text',style:'heading',text:'First'},'t'),parentId:original.id,image:pngOf(1536,864,41)})).body.visual;
 assert.deepEqual(await snap(original.id,false),was,'after Save');
 const v1was=await snap(v1.id);
 await pause();
 const second=D.updateLayer((await open(v1.id)).body.design,'t',{text:'Second'});
 const v2=(await save({doc:second,parentId:v1.id,image:pngOf(1536,864,42)})).body.visual;
 await pause();
 const r=await restore(v1.id,v2.id);
 assert.equal(r.status,200,r.raw);
 const v3=r.body.visual;
 assert.ok(![original.id,v1.id,v2.id].includes(v3.id),'a new picture');
 assert.equal(v3.parentId,v2.id,'the next version of the picture opened');
 assert.equal(v3.edit.restoredFrom,v1.id);assert.equal(v3.edit.designId,original.id);
 assert.deepEqual(await bytes(prefix+'images/'+v3.id),await bytes(prefix+'images/'+v1.id),'the image restored is the version’s');
 assert.deepEqual(JSON.parse(await text(prefix+'edits/'+v3.id+'.json')),JSON.parse(v1was.design),'and so is its design');
 assert.equal(r.body.design.layers.t.text,'First');
 assert.deepEqual(await snap(original.id,false),was,'the original, after Restore');
 assert.deepEqual(await snap(v1.id),v1was,'the version restored from, too');
 // Only a version of the same design.
 const copy=(await save({doc:D.createDoc(original),parentId:original.id,copy:true})).body.visual;
 assert.equal((await restore(copy.id,v2.id)).status,400,'a version of another design');
 assert.equal((await restore(id(0x9999),v2.id)).status,404);
 as(VIEWER);
 assert.equal((await restore(v1.id,v2.id)).status,403,'viewers don’t make work');
});

test('Duplicate design: "Copy of <name>", a design of its own, in the same folder as the original',async()=>{
 as(OWNER);
 const inFolder=await picture(0x13000,{title:'Demo SUV · Desert dusk · edited'}),loose=await picture(0x13001,{title:'Demo Hatch · Forest track'});
 const raw=state.db.raw;
 raw.prepare('INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('folder-launch',ORG,null,'Launch campaign',prefix,1,1);
 raw.prepare("INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,'visual',?,?,1)").run(ORG,inFolder.id,'folder-launch');
 const before=await text(prefix+'visuals/'+inFolder.id+'.json');
 const r=await save({doc:D.addLayer(D.createDoc(inFolder),{kind:'shape',shape:'star'},'s'),parentId:inFolder.id,copy:true});
 assert.equal(r.status,200,r.raw);
 const c=r.body.visual;
 assert.equal(c.title,'Copy of Demo SUV · Desert dusk','the name, without what earlier saves added');
 assert.equal(c.parentId,null,'not a version: a separate picture');assert.equal(c.edit.copy,true);assert.equal(c.edit.designId,c.id,'a design of its own');
 const filed=raw.prepare("SELECT folder_id FROM folder_items WHERE item_kind='visual' AND item_id=?").get(c.id);
 assert.equal(filed?.folder_id,'folder-launch','in the same folder');
 assert.equal(await text(prefix+'visuals/'+inFolder.id+'.json'),before,'the original unchanged');
 assert.equal((await open(c.id)).body.designId,c.id);
 const l=await save({doc:D.createDoc(loose),parentId:loose.id,copy:true});
 assert.equal(l.body.visual.title,'Copy of Demo Hatch · Forest track');
 assert.equal(raw.prepare("SELECT folder_id FROM folder_items WHERE item_kind='visual' AND item_id=?").get(l.body.visual.id),undefined,'an original in no folder: its copy in none');
});

test('autosave’s working draft: the person’s own, checked, kept, read back and dropped',async()=>{
 as(OWNER);
 const original=await picture(0x14000);
 // No draft yet is the usual case, not an error: a 404 would put a console error on every editor open.
 const none=await draft('GET',original.id);
 assert.equal(none.status,200,'no draft yet is not an error');assert.equal(none.body.draft,null,'no draft yet');
 assert.equal((await draft('GET',id(0x14998))).status,404,'not a picture here');
 const doc=D.addLayer(D.createDoc(original),{kind:'text',style:'body',text:'Draft'},'t');
 const put=await draft('PUT',original.id,{doc,rev:3});
 assert.equal(put.status,200,put.raw);assert.equal(typeof put.body.savedAt,'number');
 const got=await draft('GET',original.id);
 assert.equal(got.status,200);assert.deepEqual(got.body.draft.doc,JSON.parse(json(doc)));assert.equal(got.body.draft.rev,3);assert.equal(got.body.draft.savedAt,put.body.savedAt);
 assert.equal(await text(prefix+'visuals/'+original.id+'.json')!==undefined,true);
 // Refused: another picture underneath, a v1 file, a bad revision, too large, another site, a viewer.
 const other=D.createDoc({id:id(0x14999),width:1536,height:864});
 assert.equal((await draft('PUT',original.id,{doc:other,rev:4})).status,400,'a design of another picture');
 assert.equal((await draft('PUT',original.id,{doc:JSON.parse(fixtures[0].text),rev:4})).status,400,'autosave sends v2 only');
 assert.equal((await draft('PUT',original.id,{doc,rev:-1})).status,400);
 assert.equal((await draft('PUT',original.id,undefined,{raw:'{"doc":"'+'x'.repeat(2_000_001)+'"}'})).status,413);
 assert.equal((await draft('PUT',original.id,{doc,rev:5},{origin:'http://elsewhere.example.test'})).status,403);
 assert.equal((await draft('PUT',id(0x14998),{doc,rev:5})).status,404,'not a picture here');
 as(CREATOR);
 assert.equal((await draft('GET',original.id)).body.draft,null,'a colleague has their own drafts, not the owner’s');
 assert.equal((await draft('PUT',original.id,{doc,rev:1})).status,200);assert.ok(await store.get(theirs+'drafts/'+original.id+'.json'));
 as(VIEWER);
 assert.equal((await draft('PUT',original.id,{doc,rev:1})).status,403,'viewers look; they don’t make work');
 as(OWNER);
 assert.equal((await draft('GET',original.id)).body.draft.rev,3,'still the owner’s');
 assert.deepEqual((await draft('DELETE',original.id)).body,{deleted:true});
 assert.equal((await draft('GET',original.id)).body.draft,null);
 // A reopened design's draft sits on its original; Save never touches the draft.
 const v1=(await save({doc,parentId:original.id})).body.visual;
 const reopened=(await open(v1.id)).body.design;
 assert.equal((await draft('PUT',v1.id,{doc:reopened,rev:1})).status,200,'over the original under the version opened');
 assert.equal((await draft('PUT',v1.id,{doc:D.createDoc(v1),rev:2})).status,200,'or over the version itself');
});

test('the version history: every save, restore and copy of a design, newest first, only what the person may open',async()=>{
 as(OWNER);
 const original=await picture(0x15000,{title:'Demo SUV · Harbour at dawn'});
 const empty=await versions(original.id);
 assert.equal(empty.status,200,empty.raw);assert.deepEqual(empty.body,{designId:original.id,ready:true,versions:[]});
 const doc=D.addLayer(D.createDoc(original),{kind:'text',style:'body'},'t');
 const v1=(await save({doc,parentId:original.id})).body.visual;await pause();
 const v2=(await save({doc:D.updateLayer(doc,'t',{text:'Two'}),parentId:v1.id})).body.visual;await pause();
 const v3=(await restore(v1.id,v2.id)).body.visual;await pause();
 const copy=(await save({doc,parentId:v2.id,copy:true})).body.visual;
 const list=await versions(v2.id);
 assert.equal(list.status,200,list.raw);
 assert.equal(list.body.ready,true);assert.equal(list.body.designId,original.id,'every version of a design gives the same history');
 assert.deepEqual(list.body.versions.map(v=>[v.id,v.kind]),[[v3.id,'restore'],[v2.id,'save'],[v1.id,'save']],'newest first; the copy is another design');
 assert.ok(list.body.versions.every(v=>v.mine===true&&typeof v.createdAt==='number'&&v.title));
 assert.deepEqual((await versions(original.id)).body.versions.map(v=>v.id),[v3.id,v2.id,v1.id]);
 assert.deepEqual((await versions(copy.id)).body.versions.map(v=>[v.id,v.kind]),[[copy.id,'copy']],'a duplicate starts its own history');
 // A colleague sees them too (not as theirs); a deleted version leaves the list.
 as(CREATOR);
 const seen=(await versions(v1.id)).body.versions;
 assert.deepEqual(seen.map(v=>v.id),[v3.id,v2.id,v1.id]);assert.ok(seen.every(v=>v.mine===false));
 await putJson(prefix+'deleted-visuals/'+v2.id+'.json',{id:v2.id});
 assert.deepEqual((await versions(v1.id)).body.versions.map(v=>v.id),[v3.id,v1.id]);
 as(VIEWER);
 assert.equal((await versions(v1.id)).status,200,'viewers may look at the history');
 // Nothing in the table is ever changed: one row per picture.
 assert.equal(state.db.raw.prepare('SELECT COUNT(*) AS n FROM design_versions WHERE design_id=?').get(original.id).n,3);
});

test('the soft lock: who else has the design open, by their own name from the server, and leaving clears it',async()=>{
 as(OWNER);
 const original=await picture(0x16000);
 const v1=(await save({doc:D.createDoc(original),parentId:original.id})).body.visual;
 const mine=await presence('POST',original.id,{editing:true,name:'Mallory'});
 assert.equal(mine.status,200,mine.raw);assert.deepEqual(mine.body,{ready:true,others:[]},'nobody else yet');
 as(CREATOR);
 const theirsNow=await presence('POST',v1.id,{editing:false});
 assert.deepEqual(theirsNow.body.others,[{name:'A teammate',editing:true}],'the same design, opened from another of its versions');
 assert.doesNotMatch(theirsNow.raw,/Mallory|@example\.test/,'never a name the request gave, never an address');
 as(VIEWER);
 const looking=await presence('GET',original.id);
 assert.equal(looking.status,200);assert.deepEqual(looking.body.others.map(o=>o.editing),[true,false],'whoever is editing first');
 assert.equal((await presence('POST',original.id,{editing:true})).status,403,'viewers only look');
 as(OWNER);
 assert.deepEqual((await presence('POST',original.id,{editing:true})).body.others,[{name:'A teammate',editing:false}]);
 assert.equal((await presence('POST',original.id,{editing:'yes'})).status,400);
 assert.equal((await presence('DELETE',original.id)).status,200);
 as(CREATOR);
 assert.deepEqual((await presence('POST',v1.id,{editing:true})).body.others,[],'the owner left');
 // Someone not heard from for 45 s has gone.
 as(OWNER);await presence('POST',original.id,{editing:true});
 state.db.raw.prepare('UPDATE design_presence SET seen_at=? WHERE person=?').run(Date.now()-46_000,prefix);
 as(CREATOR);
 assert.deepEqual((await presence('GET',v1.id)).body.others,[]);
 // The name others see: the person's own display name, never an address.
 const {displayName}=await import('@/lib/editor/presence.ts');
 assert.equal(displayName({account:{user:{id:'x',email:'a@example.test',name:'  Demo   Person '}}}),'Demo Person');
 assert.equal(displayName({account:{user:{id:'x',email:'a@example.test',name:'a@example.test'}}}),'A teammate');
 assert.equal(displayName({account:{user:{id:'x',email:'a@example.test'}}}),'A teammate');
});

test('every new address is in the route table: reads like the picture, writes for those who make work',async()=>{
 const plan=await import('@/lib/accounts/plan.ts'),x=id(0x17000);
 for(const [path,method,library] of [['/versions','GET',true],['/presence','GET',true],['/draft','GET',false],['/draft','PUT',false],['/draft','DELETE',false],['/restore','POST',false],['/presence','POST',false],['/presence','DELETE',false]]){
  const rule=plan.routeRule(`/api/edits/${x}${path}`,method);
  assert.ok(rule,method+' '+path);assert.equal(rule.feature,null,'no paid feature: nothing is generated');assert.equal(!!rule.library,library,method+' '+path);
 }
 assert.equal(plan.routeRule(`/api/edits/${x}/versions`,'POST'),null);assert.equal(plan.routeRule(`/api/edits/${x}/restore`,'GET'),null);
 const sql=readFileSync(new URL('../supabase/migrations/0012_designs.sql',import.meta.url),'utf8');
 for(const t of ['design_versions','design_presence']){
  assert.match(sql,new RegExp(`create table if not exists studio\\.${t} \\(`));assert.match(sql,new RegExp(`revoke all on studio\\.${t} from public`));
 }
 assert.match(sql,/array\['design_versions', 'design_presence'\]/);assert.match(sql,/force row level security/);assert.match(sql,/environment = \(select studio\.request_env\(\)\)/);
 assert.equal(await ready(state.db),true,'after 0012');
});
