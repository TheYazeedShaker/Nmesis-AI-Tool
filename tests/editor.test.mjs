// The canvas editor (feat/studio-editor; editor format v2): the document model
// (lib/editor/doc.ts: adding a logo and text, layer order, guides, the full-size
// export), undo and redo (lib/editor/history.ts) and saving (app/api/edits against the real handler, SQLite from the
// migrations and the local S3 stand-in): a new version, never a change to the
// original.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import * as D from '../lib/editor/doc.ts';
import * as H from '../lib/editor/history.ts';
import {editedVisual,editFileName,fullSize} from '../lib/editor/save.ts';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const read=(rel)=>readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const PICTURE={id:'00000000-0000-4000-8000-000000010000',src:'/api/assets/00000000-0000-4000-8000-000000010000',width:1536,height:864};
const LOGO={kind:'image',src:'/api/brand-kit/logos/00000000-0000-4000-8000-00000000c0de',name:'Demo logo',source:'logo',naturalWidth:400,naturalHeight:100};

const P='page-1',order=(doc,page=P)=>D.drawOrder(doc,page).map(l=>l.id);

test('adding a logo: one layer, in the middle of the picture, at a readable size, keeping its shape',()=>{
 const doc=D.addLayer(D.createDoc(PICTURE),LOGO,'logo-1');
 assert.equal(D.layerCount(doc),1);
 const l=doc.layers['logo-1'];
 assert.equal(l.kind,'image');assert.equal(l.source,'logo');assert.equal(l.asset,'logos/00000000-0000-4000-8000-00000000c0de','kept by its storage key, never an address');assert.equal(l.name,'Demo logo');
 assert.equal(D.assetSrc(l.asset),LOGO.src,'drawn from the Studio’s own address');
 assert.deepEqual([l.pageId,l.parentId,l.index],[P,null,0]);
 assert.equal(Math.round(l.width),Math.round(1536*0.18),'about a fifth of the picture wide');
 assert.equal(Math.round(l.width/l.height),4,'the logo keeps its 4:1 shape');
 assert.equal(Math.round(l.x+l.width/2),768);assert.equal(Math.round(l.y+l.height/2),432,'centred, ready to drag into place');
 assert.equal(D.layerCount(D.createDoc(PICTURE)),0,'the document it came from is unchanged');
 assert.throws(()=>D.addLayer(D.createDoc(PICTURE),{...LOGO,src:'https://elsewhere.example.test/x.png'},'x'),/Only pictures from this Studio/);
});

test('adding text: the brand’s font and colour, sized from the picture, each style its own size',()=>{
 let doc=D.createDoc(PICTURE);
 doc=D.addLayer(doc,{kind:'text',style:'heading',font:'Outfit',color:'#0a84ff'},'t1');
 doc=D.addLayer(doc,{kind:'text',style:'body'},'t2');
 const h=doc.layers.t1,b=doc.layers.t2;
 assert.equal(h.kind,'text');assert.equal(h.text,'Add a heading');assert.equal(h.font,'Outfit');assert.equal(h.color,'#0a84ff');assert.equal(h.fontWeight,700);
 assert.equal(h.fontSize,Math.round(0.08*864));
 assert.equal(b.text,'Add a little body text');assert.equal(b.font,'Inter','the default font when the brand has none');assert.equal(b.color,'#ffffff');
 assert.ok(h.fontSize>b.fontSize);assert.deepEqual(order(doc),['t1','t2'],'the newest on top');
 const edited=D.updateLayer(doc,'t1',{text:'Launch day'});
 assert.equal(edited.layers.t1.text,'Launch day');assert.equal(edited.layers.t1.kind,'text');
 const sneaky=D.updateLayer(doc,'t1',{kind:'shape',id:'other',pageId:'elsewhere',index:9});
 assert.equal(sneaky.layers.t1.kind,'text','a patch never changes what a layer is');assert.equal(sneaky.layers.t1.pageId,P,'or where it lives');assert.equal(sneaky.layers.other,undefined);
});

test('undo and redo: every change is a step, a new change clears what was undone, and history is bounded',()=>{
 const a=D.createDoc(PICTURE);
 let h=H.startHistory(a);
 h=H.apply(h,d=>D.edit.add(d,P,LOGO,'l'));const b=h.present;
 h=H.apply(h,d=>D.edit.nudge(d,'l',10,-5));const c=h.present;
 assert.equal(h.past.length,2);assert.equal(c.layers.l.x,b.layers.l.x+10);
 h=H.undo(h);assert.deepEqual(h.present,b);
 h=H.undo(h);assert.deepEqual(h.present,a);assert.equal(D.layerCount(h.present),0);
 assert.equal(H.undo(h),h,'nothing more to undo');
 h=H.redo(h);assert.deepEqual(h.present,b);
 h=H.redo(h);assert.deepEqual(h.present,c);
 assert.equal(H.redo(h),h,'nothing more to redo');
 h=H.undo(h);h=H.apply(h,d=>D.edit.remove(d,'l'));assert.deepEqual(h.future,[],'a new change clears redo');
 assert.equal(H.apply(h,()=>{}),h,'no change is not a step');
 let long=H.startHistory(b);for(let i=0;i<H.HISTORY_MAX+30;i++)long=H.apply(long,d=>D.edit.nudge(d,'l',1,0));
 assert.equal(long.past.length,H.HISTORY_MAX);
 // A step keeps patches, never a copy of the design.
 assert.ok(c.layers.l&&h.past.every(s=>Array.isArray(s.patches)&&Array.isArray(s.inverse)&&!('present' in s)));
});

test('layer order, duplicate, delete and the alignment guides',()=>{
 let doc=D.createDoc(PICTURE);
 for(const id of ['a','b','c'])doc=D.addLayer(doc,{kind:'shape',shape:'rect'},id);
 assert.deepEqual(order(D.reorder(doc,'a','front')),['b','c','a']);
 assert.deepEqual(order(D.reorder(doc,'c','back')),['c','a','b']);
 assert.deepEqual(order(D.reorder(doc,'a','forward')),['b','a','c']);
 assert.deepEqual(order(D.reorder(doc,'a','backward')),['a','b','c'],'already at the back');
 const dup=D.duplicateLayer(doc,'b','b2');
 assert.deepEqual(order(dup),['a','b','b2','c'],'the copy sits right above the original');assert.ok(dup.layers.b2.x>dup.layers.b.x);
 assert.deepEqual(Object.values(dup.layers).map(l=>l.index).sort(),[0,1,2,3],'indexes stay 0, 1, 2…');
 assert.deepEqual(order(D.removeLayer(doc,'b')),['a','c']);
 // A box a few pixels off the picture's centre snaps onto it and says where.
 const w=200,h=100,s=D.snap(D.createDoc(PICTURE),P,{id:'m',x:768-w/2+4,y:432-h/2-3,width:w,height:h,rotation:0},6);
 assert.equal(s.x,768-w/2);assert.equal(s.y,432-h/2);
 assert.deepEqual(s.guides.map(g=>g.orientation+g.at).sort(),['h432','v768']);
 assert.deepEqual(D.snap(D.createDoc(PICTURE),P,{id:'m',x:300,y:300,width:w,height:h,rotation:0},6).guides,[],'far from everything: no guide');
});

test('export at full resolution: the stage is drawn at the picture’s own size, whatever the screen shows',()=>{
 const doc=D.createDoc(PICTURE);
 for(const shown of [1536,1100,733,412]){
  const ratio=D.exportPixelRatio(doc,shown);
  assert.equal(Math.round(shown*ratio),1536);assert.equal(Math.round(doc.height*(shown/doc.width)*ratio),864);
 }
 assert.deepEqual(D.exportSize(doc),{width:1536,height:864});
 assert.throws(()=>D.exportPixelRatio(doc,0));
 assert.ok(fullSize(PICTURE,{width:1536,height:864}));assert.ok(!fullSize(PICTURE,{width:1535,height:864}));
 // The editor exports the picture's box at that ratio and hides the handles first.
 const canvas=readdirSync(new URL('../components/canvas/',import.meta.url)).filter(f=>/\.tsx?$/.test(f)).map(f=>read('components/canvas/'+f)).join('\n');
 assert.match(canvas,/pixelRatio:ratio/);
 assert.match(canvas,/ui\?\.hide\(\)/);
});

test('a document from outside is checked before it is kept',()=>{
 const good=D.addLayer(D.addLayer(D.createDoc(PICTURE),LOGO,'l'),{kind:'text',style:'body'},'t');
 assert.equal(D.checkDoc(good).ok,true);
 const bad=(patch,id='l')=>D.checkDoc({...good,layers:{...good.layers,[id]:{...good.layers[id],...patch}}}).ok;
 assert.equal(bad({asset:'javascript:alert(1)'}),false);
 assert.equal(bad({asset:'http://elsewhere.example.test/x.png'}),false,'an address in place of a storage key');
 assert.equal(bad({asset:'images/x?X-Amz-Signature=abc'}),false,'a signed link');
 assert.equal(bad({width:Number.NaN}),false);
 assert.equal(bad({kind:'script'}),false);
 assert.equal(bad({pageId:'page-9'}),false,'a layer on a page the design does not have');
 assert.equal(bad({parentId:'t'}),false,'a group that is not a group');
 assert.equal(bad({name:'see https://elsewhere.example.test'},'t'),false,'no address in a name');
 assert.equal(bad({text:'Visit https://example.test'},'t'),true,'words a person typed may hold one');
 const many=Object.fromEntries(Array.from({length:D.MAX_LAYERS+1},(_,i)=>['s'+i,{...good.layers.t,id:'s'+i,index:i}]));
 assert.equal(D.checkDoc({...good,layers:many}).ok,false);
 assert.equal(D.checkDoc({...good,pages:[{id:P,background:{kind:'picture',asset:'https://elsewhere.example.test/x.png'}}]}).ok,false);
 assert.equal(D.checkDoc(null).ok,false);
 assert.equal(D.checkDoc({...good,schemaVersion:3}).ok,false,'only the version this Studio knows');
 assert.equal(editFileName('Demo SUV · Desert dusk','png',false),'demo-suv-desert-dusk-edited.png');
 assert.equal(editFileName('','jpg',true),'design-copy.jpg');
 // Building the new record reads the original and never changes it.
 const parent={id:PICTURE.id,title:'Demo SUV · Desert dusk · edited',src:PICTURE.src,status:'ready',createdAt:'2026-11-01T10:00:00.000Z',width:1536,height:864};
 const frozen=JSON.stringify(parent),v=editedVisual(parent,{id:'new-id',width:1536,height:864,layers:3,copy:false,now:new Date(0)});
 assert.equal(JSON.stringify(parent),frozen);
 assert.equal(v.title,'Demo SUV · Desert dusk · edited','an edited title is not edited twice');assert.equal(v.parentId,PICTURE.id);
 assert.deepEqual(v.edit,{parentId:PICTURE.id,parentSrc:PICTURE.src,layers:3,pages:1,designId:PICTURE.id});
 const c=editedVisual(parent,{id:'copy-id',width:1536,height:864,layers:3,copy:true,now:new Date(0)});
 assert.equal(c.title,'Copy of Demo SUV · Desert dusk');assert.equal(c.parentId,null);assert.equal(c.edit.designId,'copy-id','a copy is a design of its own');
});

// ── Saving, against the real route ───────────────────────────────────────
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG=id(0xa),OWNER={id:id(0xa1),email:'owner@example.test'},CREATOR={id:id(0xa2),email:'creator@example.test'},VIEWER={id:id(0xa3),email:'viewer@example.test'};
const full={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'8k','studio.key_visuals':true}};
const ORIGIN='http://studio.test';
let s3,store,route,prefix;const realFetch=globalThis.fetch;
const pngOf=(w,h,fill=0)=>{const b=Buffer.alloc(80,fill);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b};
const ORIGINAL={id:PICTURE.id,title:'Demo SUV · Desert dusk',src:PICTURE.src,status:'ready',createdAt:'2026-11-01T10:00:00.000Z',width:1536,height:864,size:'1536x864',vehicle:'Demo SUV',provider:'openai'};

before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('Network calls are not allowed in this test: '+u)};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG,name:'Demo Company A',kind:'client'}],
  members:[{userId:OWNER.id,orgId:ORG,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG,role:'creator',status:'active'},{userId:VIEWER.id,orgId:ORG,role:'viewer',status:'active'}],
  staff:{},entitlements:{[ORG]:full},grants:{},
 });
 route=await import('@/app/api/edits/route.ts');
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 prefix=(await import('@/lib/portable/tenancy.ts')).userPrefix(ORG,OWNER.id);
 await store.put(prefix+'visuals/'+PICTURE.id+'.json',JSON.stringify(ORIGINAL),{httpMetadata:{contentType:'application/json'}});
 await store.put(prefix+'images/'+PICTURE.id,pngOf(1536,864,7),{httpMetadata:{contentType:'image/png'}});
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});

function as(user){state.user=user;state.chosenOrg=null;state.chosenBrand=null}
async function save({doc,image=pngOf(1536,864,9),copy=false,parentId=PICTURE.id}={}){
 const form=new FormData();form.set('parentId',parentId);form.set('doc',typeof doc==='string'?doc:JSON.stringify(doc));if(copy)form.set('copy','1');
 form.set('image',new File([image],'design.png',{type:'image/png'}));
 const r=await route.POST(new Request(ORIGIN+'/api/edits',{method:'POST',headers:{origin:ORIGIN},body:form}));
 const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
 return {status:r.status,body};
}
const bytesOf=async(key)=>Buffer.from(await (await store.get(key)).arrayBuffer());

test('save creates a new version and never changes the original',async()=>{
 as(OWNER);
 const before={json:await (await store.get(prefix+'visuals/'+PICTURE.id+'.json')).text(),image:await bytesOf(prefix+'images/'+PICTURE.id)};
 const doc=D.addLayer(D.addLayer(D.createDoc(PICTURE),LOGO,'l'),{kind:'text',style:'heading'},'t');
 const r=await save({doc});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const v=r.body.visual;
 assert.notEqual(v.id,PICTURE.id);assert.equal(v.parentId,PICTURE.id,'the next version of the original');
 assert.equal(v.title,'Demo SUV · Desert dusk · edited');assert.equal(v.src,'/api/assets/'+v.id);assert.equal(v.status,'ready');
 assert.deepEqual([v.width,v.height],[1536,864],'full resolution');
 assert.deepEqual(v.edit,{parentId:PICTURE.id,parentSrc:PICTURE.src,layers:2,pages:1,designId:PICTURE.id},'a version of the design begun on the original');
 // The original, byte for byte.
 assert.equal(await (await store.get(prefix+'visuals/'+PICTURE.id+'.json')).text(),before.json);
 assert.deepEqual(await bytesOf(prefix+'images/'+PICTURE.id),before.image);
 // The new picture, its record and its layers are kept, in format v2.
 assert.deepEqual(await bytesOf(prefix+'images/'+v.id),pngOf(1536,864,9));
 assert.equal(JSON.parse(await (await store.get(prefix+'visuals/'+v.id+'.json')).text()).parentId,PICTURE.id);
 const kept=JSON.parse(await (await store.get(prefix+'edits/'+v.id+'.json')).text());
 assert.equal(kept.schemaVersion,2);assert.equal(Object.keys(kept.layers).length,2);assert.equal(kept.base,PICTURE.id);
 // Duplicate design: a separate copy, not a version: "Copy of <name>", a design of its own.
 const c=await save({doc,copy:true});
 assert.equal(c.status,200);assert.equal(c.body.visual.parentId,null);assert.equal(c.body.visual.title,'Copy of Demo SUV · Desert dusk');
 assert.equal(c.body.visual.edit.copy,true);assert.equal(c.body.visual.edit.designId,c.body.visual.id);
 assert.equal(await (await store.get(prefix+'visuals/'+PICTURE.id+'.json')).text(),before.json,'still unchanged');
});

test('a colleague edits the owner’s picture: the version is the colleague’s own, the original untouched',async()=>{
 as(CREATOR);
 const before=await (await store.get(prefix+'visuals/'+PICTURE.id+'.json')).text();
 const r=await save({doc:D.addLayer(D.createDoc(PICTURE),{kind:'text',style:'body'},'t')});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const mine=(await import('@/lib/portable/tenancy.ts')).userPrefix(ORG,CREATOR.id);
 assert.ok(await store.get(mine+'visuals/'+r.body.visual.id+'.json'),'saved in the colleague’s own work');
 assert.equal(await store.get(prefix+'visuals/'+r.body.visual.id+'.json'),null,'nothing written into the owner’s work');
 assert.equal(r.body.visual.parentId,PICTURE.id);
 assert.equal(await (await store.get(prefix+'visuals/'+PICTURE.id+'.json')).text(),before);
});

test('save refuses anything that is not the full-size design of this picture, and viewers',async()=>{
 as(OWNER);
 const doc=D.createDoc(PICTURE);
 assert.equal((await save({doc,image:pngOf(1535,864)})).status,400,'not full size');
 assert.equal((await save({doc:'{not json'})).status,400);
 assert.equal((await save({doc:{...doc,base:id(99),pages:[{id:'page-1',background:{kind:'picture',asset:'images/'+id(99)}}]}})).status,400,'a design of another picture');
 assert.equal((await save({doc:{...doc,pages:[{id:'page-1',background:{kind:'picture',asset:'images/'+id(99)}}]}})).status,400,'another picture underneath');
 assert.equal((await save({doc:{...doc,layers:{x:{...D.layerFor(doc,LOGO,'x'),asset:'javascript:x'}}}})).status,400);
 assert.equal((await save({doc,parentId:id(98)})).status,404,'not one of this person’s pictures');
 as(VIEWER);
 assert.equal((await save({doc})).status,403,'viewers look; they don’t make work');
 // Registered as a write that needs no paid feature, and uploads straight to storage.
 const plan=await import('@/lib/accounts/plan.ts');
 assert.equal(plan.routeRule('/api/edits','POST').feature,null);
 assert.match(read('lib/portable/uploads.ts'),/'\/api\/edits'/);
});
