// Editor Phase 5: photo and icon libraries inside the editor.
// - Pixabay as a reference provider (lib/references/pixabay.ts) against a fake API: what a search keeps
//   (the credit), the key missing, the 24-hour cache Pixabay's terms ask for, its rate limit.
// - The Photos panel's one search over every switched-on library (GET /api/references?provider=all).
// - Placing a photo copies it into the person's own storage (POST /api/references/import) and the layer
//   keeps the Studio's storage key and the credit, never the library's address.
// - The design format: a picture's credit and an icon's grid and fill (lib/editor/doc.ts).
// - The icon sets (lib/editor/icon-sets.ts, public/icons/): licences, files, search; no icon service.
// The routes run with the stand-ins of tests/references.test.mjs. All data is synthetic.
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {register} from 'node:module';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import {tsxLoader,rootPath} from './support/load-tsx.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const KEY='demo-pixabay-key-0123456789abcdef';
const ENV={PIXABAY_API_KEY:KEY};
const Q={query:'demo suv',page:1,perPage:20};
const JPEG=new Uint8Array(2048);JPEG.set([255,216,255,224,0,16,74,70,73,70,0,1]);
const json=(value,init={})=>new Response(JSON.stringify(value),{status:200,...init,headers:{'content-type':'application/json',...init.headers}});
const jpeg=()=>new Response(JPEG,{status:200,headers:{'content-type':'image/jpeg'}});
const hit=(id,extra={})=>({
 id,pageURL:`https://pixabay.com/photos/demo-road-${id}/`,type:'photo',tags:'demo, road, hills',
 previewURL:`https://cdn.pixabay.com/photo/2026/01/01/00/00/demo-${id}_150.jpg`,
 webformatURL:`https://pixabay.com/get/g${id}abc_640.jpg`,largeImageURL:`https://pixabay.com/get/g${id}def_1280.jpg`,
 imageWidth:6000,imageHeight:4000,user_id:4242,user:'demo_maker',
 ...extra,
});
function fakeFetch(answer){
 const calls=[];
 const f=async(url,init={})=>{const u=new URL(String(url));calls.push({url:u.href,host:u.hostname,headers:new Headers(init.headers||{})});const r=await answer(u,init);if(!r)throw new Error('Unexpected request to '+u.hostname);return r};
 f.calls=calls;return f;
}
async function quiet(fn){const real=console.error;const said=[];console.error=(...a)=>said.push(a.join(' '));try{return {value:await fn(),said}}finally{console.error=real}}
/** A shared cache like the route's (the Studio's storage), in memory. */
function memoryCache(){const m=new Map();return {m,get:async k=>m.has(k)?JSON.parse(m.get(k)):null,set:async(k,v)=>{m.set(k,JSON.stringify(v))}}}

let px,pixabay,providers,doc,elements,iconSets,s3,store,routes={};
const realFetch=globalThis.fetch;let libraryCalls=[],libraryAnswer=null;
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=uid(0xa),OWNER={id:uid(0xa1),email:'owner@example.test'};
const ORIGIN='http://studio.test';
before(async()=>{
 px=await import('@/lib/references/pixabay.ts');pixabay=px.pixabay;
 providers=await import('@/lib/references/index.ts');
 doc=await import('@/lib/editor/doc.ts');
 const load=tsxLoader();elements=load('lib/elements.ts');iconSets=load('lib/editor/icon-sets.ts');
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);libraryCalls.push(u);if(libraryAnswer){const r=await libraryAnswer(new URL(u),init);if(r)return r}throw new Error('Requests to this host are not allowed in this test.')};
 const features=Object.fromEntries(['studio.enabled','studio.key_visuals','studio.lineups'].map(k=>[k,true]));
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Company A',kind:'client'}],
  members:[{userId:OWNER.id,orgId:ORG_A,role:'owner',status:'active'}],
  entitlements:{[ORG_A]:{legacy:false,status:'active',planId:'growth',planName:'Growth',endsOn:null,features:{...features,'studio.max_output':'4k'}}},
 });
 for(const p of ['app/api/references/route.ts','app/api/references/import/route.ts'])routes[p]=await import('@/'+p);
 store=(await import('@/lib/portable/storage.ts')).getStorage();
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});
beforeEach(()=>{px.forgetPixabay();libraryCalls=[];libraryAnswer=null;state.user=OWNER;state.chosenOrg=null;state.chosenBrand=null;delete process.env.UNSPLASH_ACCESS_KEY;process.env.PIXABAY_API_KEY=KEY});

// ── Pixabay ─────────────────────────────────────────────────────────────────
test('the registry adds Pixabay beside Unsplash; the Photos panel searches both, never Pinterest',()=>{
 assert.deepEqual(providers.REFERENCE_PROVIDERS.map(p=>p.id),['unsplash','pixabay','pinterest']);
 assert.deepEqual(providers.PHOTO_LIBRARIES.map(p=>p.id),['unsplash','pixabay']);
 assert.equal(providers.referenceProvider('pixabay'),pixabay);
});

test('without a key Pixabay is off, says so in plain words, and makes no request',async()=>{
 const f=fakeFetch(()=>json({}));
 for(const env of [{},{PIXABAY_API_KEY:''},{PIXABAY_API_KEY:'short'},{PIXABAY_API_KEY:'has spaces in it 0123456789'}]){
  assert.equal(pixabay.available(env),false);
  await assert.rejects(pixabay.search(Q,{env,fetch:f}),e=>e.status===503&&e.message==='Pixabay isn\'t set up yet.');
  await assert.rejects(pixabay.fetchForUse('101',{env,fetch:f}),e=>e.status===503);
 }
 assert.equal(pixabay.unavailable,'Pixabay isn\'t set up yet.');
 assert.equal(f.calls.length,0);
 assert.equal(pixabay.available(ENV),true);
});

test('a search keeps each photo\'s credit (who, their page, Pixabay, the photo\'s page) and only Pixabay\'s own picture hosts',async()=>{
 const hits=[hit(101),hit(102,{user:'Second Maker',user_id:77}),hit(103,{webformatURL:'https://images.example.test/a_640.jpg'}),hit(104,{user:''}),hit(105,{pageURL:'https://elsewhere.example.test/p'}),{id:'x'},null];
 const f=fakeFetch(u=>u.hostname==='pixabay.com'&&u.pathname==='/api/'?json({total:900,totalHits:500,hits}):undefined);
 const page=await pixabay.search({...Q,query:'  demo suv '},{env:ENV,fetch:f});
 assert.deepEqual(page.photos.map(p=>p.id),['101','102','105']);
 assert.equal(page.nextPage,2);
 assert.deepEqual(page.photos[0],{
  id:'101',provider:'pixabay',thumb:'https://pixabay.com/get/g101abc_340.jpg',src:'https://pixabay.com/get/g101abc_640.jpg',
  width:6000,height:4000,alt:'demo, road, hills',
  credit:{name:'demo_maker',href:'https://pixabay.com/users/demo_maker-4242/',source:'Pixabay',sourceHref:'https://pixabay.com/',page:'https://pixabay.com/photos/demo-road-101/'},
 });
 // A name that can't be a link path links to Pixabay itself; a page elsewhere is dropped.
 assert.equal(page.photos[1].credit.href,'https://pixabay.com/');
 assert.equal(page.photos[2].credit.page,undefined);
 // One request, to the official API, with the key as its parameter, never in what the browser gets.
 assert.equal(f.calls.length,1);
 const url=new URL(f.calls[0].url);
 assert.equal(url.origin+url.pathname,'https://pixabay.com/api/');
 assert.deepEqual(Object.fromEntries(url.searchParams),{key:KEY,q:'demo suv',page:'1',per_page:'20',image_type:'photo',safesearch:'true',lang:'en'});
 assert.ok(!JSON.stringify(page).includes(KEY));
 // Past Pixabay's 500 results there is no next page, and no request.
 assert.equal((await pixabay.search({...Q,page:26},{env:ENV,fetch:f})).nextPage,null);
 assert.equal(f.calls.length,1);
});

test('Pixabay\'s answers are kept 24 hours: in memory, and in the shared cache for every other server',async()=>{
 let now=Date.UTC(2026,10,25,9);
 const cache=memoryCache();
 const f=fakeFetch(()=>json({totalHits:40,hits:[hit(201),hit(202)]}));
 const call={env:ENV,fetch:f,cache,now:()=>now};
 const first=await pixabay.search(Q,call);
 assert.equal(f.calls.length,1);assert.equal(cache.m.size,1);
 // The same search on this server, an hour later: no request.
 now+=60*60_000;assert.deepEqual(await pixabay.search({...Q,query:'Demo SUV'},call),first);assert.equal(f.calls.length,1);
 // Another server (nothing in its memory) reads the shared cache: no request, the same photos, checked again.
 px.forgetPixabay();
 now+=20*60*60_000;assert.deepEqual((await pixabay.search(Q,call)).photos,first.photos);assert.equal(f.calls.length,1);
 // A kept answer with a picture elsewhere is not shown from the cache either.
 const [k]=[...cache.m.keys()],stored=JSON.parse(cache.m.get(k));stored.hits[0].webformatURL='https://images.example.test/x_640.jpg';cache.m.set(k,JSON.stringify(stored));px.forgetPixabay();
 assert.deepEqual((await pixabay.search(Q,call)).photos.map(p=>p.id),['202']);assert.equal(f.calls.length,1);
 // After 24 hours Pixabay is asked again.
 px.forgetPixabay();now+=3*60*60_000;await pixabay.search(Q,call);assert.equal(f.calls.length,2);
});

test('Pixabay\'s rate limit: once it says none are left the server waits; its refusals are plain sentences without the key',async()=>{
 let now=1_000_000;
 const empty=fakeFetch(()=>json({totalHits:1,hits:[hit(301)]},{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':'30'}}));
 await pixabay.search(Q,{env:ENV,fetch:empty,now:()=>now});
 await assert.rejects(pixabay.search({...Q,query:'other'},{env:ENV,fetch:empty,now:()=>now+1000}),e=>e.status===429&&/this minute/.test(e.message));
 assert.equal(empty.calls.length,1,'no request while paused');
 now+=31_000;await pixabay.search({...Q,query:'other'},{env:ENV,fetch:empty,now:()=>now});assert.equal(empty.calls.length,2);
 px.forgetPixabay();
 const {value:busy,said}=await quiet(()=>pixabay.search(Q,{env:ENV,fetch:fakeFetch(()=>new Response('Too many',{status:429})),now:()=>now}).catch(e=>e));
 assert.equal(busy.status,429);
 px.forgetPixabay();
 const {value:bad}=await quiet(()=>pixabay.search(Q,{env:ENV,fetch:fakeFetch(()=>new Response('[ERROR 400] Invalid or missing API key',{status:400}))}).catch(e=>e));
 assert.equal(bad.status,503);assert.match(bad.message,/refused the Studio's access key/);
 assert.ok(said.every(line=>!line.includes(KEY)),'nothing logged carries the key');
});

test('using a Pixabay photo fetches its large picture from Pixabay only, from Pixabay\'s own answer',async()=>{
 const f=fakeFetch(u=>u.pathname==='/api/'?json({hits:[hit(401)]}):u.hostname==='pixabay.com'&&u.pathname.startsWith('/get/')?jpeg():undefined);
 const used=await pixabay.fetchForUse('401',{env:ENV,fetch:f});
 assert.equal(used.type,'image/jpeg');assert.equal(used.bytes.byteLength,JPEG.byteLength);assert.equal(used.photo.credit.name,'demo_maker');
 assert.deepEqual(f.calls.map(c=>c.host),['pixabay.com','pixabay.com']);
 assert.equal(new URL(f.calls[0].url).searchParams.get('id'),'401');
 assert.equal(f.calls[1].url,'https://pixabay.com/get/g401def_1280.jpg');
 // An answer pointing anywhere else is not followed.
 px.forgetPixabay();
 const other=fakeFetch(u=>u.pathname==='/api/'?json({hits:[hit(402,{largeImageURL:'https://images.example.test/big.jpg',webformatURL:'https://images.example.test/x_640.jpg'})]}):undefined);
 await assert.rejects(pixabay.fetchForUse('402',{env:ENV,fetch:other}),e=>e.status===422);
 assert.ok(!other.calls.some(c=>c.host.endsWith('example.test')));
 for(const bad of ['../x','abc','1 2',''])await assert.rejects(pixabay.fetchForUse(bad,{env:ENV,fetch:other}),e=>e.status===404);
});

// ── The routes ──────────────────────────────────────────────────────────────
async function call(method,p,{body}={}){
 const file=p.startsWith('/api/references/import')?'app/api/references/import/route.ts':'app/api/references/route.ts';
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+p,{method,headers,...body!==undefined?{body:JSON.stringify(body)}:{}}));
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text};
}
const unsplashRaw=id=>({id,width:4000,height:3000,alt_description:'Demo coupe',urls:{raw:`https://images.unsplash.com/photo-${id}?ixid=demo`,regular:`https://images.unsplash.com/photo-${id}?w=1080`,small:`https://images.unsplash.com/photo-${id}?w=400`},links:{download_location:`https://api.unsplash.com/photos/${id}/download`},user:{name:'Demo Shooter',username:'demo_shooter'}});
const library=u=>{
 if(u.hostname==='pixabay.com'&&u.pathname==='/api/')return u.searchParams.get('id')?json({hits:[hit(Number(u.searchParams.get('id')))]}):json({totalHits:100,hits:[hit(501),hit(502),hit(503)]});
 if(u.hostname==='pixabay.com'&&u.pathname.startsWith('/get/'))return jpeg();
 if(u.hostname==='api.unsplash.com'&&u.pathname==='/search/photos')return json({total_pages:1,results:[unsplashRaw('demo-u-1')]});
};

test('GET /api/references?provider=all: every library that is on, in turn; one that is off says so, and nothing asks it',async()=>{
 libraryAnswer=library;
 // Before a search: only which libraries are on.
 const status=await call('GET','/api/references?provider=all');
 assert.equal(status.status,200,status.text);
 assert.deepEqual(status.body.libraries,[{id:'unsplash',label:'Unsplash',on:false,notice:'The photo library isn\'t set up yet.'},{id:'pixabay',label:'Pixabay',on:true}]);
 assert.deepEqual(libraryCalls,[]);
 const r=await call('GET','/api/references?provider=all&q=demo%20suv');
 assert.equal(r.status,200,r.text);
 assert.deepEqual(r.body.photos.map(p=>p.provider+':'+p.id),['pixabay:501','pixabay:502','pixabay:503']);
 assert.equal(r.body.libraries[0].on,false);assert.equal(r.body.nextPage,2);
 assert.ok(libraryCalls.every(u=>new URL(u).hostname==='pixabay.com'),'Unsplash, off, is never asked');
 assert.ok(!r.text.includes(KEY));
 // Both on: taken in turn.
 process.env.UNSPLASH_ACCESS_KEY='demo-access-key-0123456789abcdef';
 const both=await call('GET','/api/references?provider=all&q=demo%20coupe');
 assert.deepEqual(both.body.photos.map(p=>p.provider),['unsplash','pixabay','pixabay','pixabay']);
 // A library that fails says so; the others still answer.
 libraryAnswer=u=>u.hostname==='pixabay.com'?new Response('busy',{status:429}):library(u);
 px.forgetPixabay();
 const {value:failing}=await quiet(()=>call('GET','/api/references?provider=all&q=demo%20wagon'));
 assert.equal(failing.status,200);
 assert.match(failing.body.libraries[1].notice,/this minute/);assert.equal(failing.body.photos.length,1);
 // The same checks on what is asked as any search.
 for(const q of ['provider=all&q='+'x'.repeat(101),'provider=all&q=demo&page=0'])assert.equal((await call('GET','/api/references?'+q)).status,400);
});

test('placing a photo copies it into the person\'s own storage; the layer keeps the storage key and the credit, never the library\'s address',async()=>{
 libraryAnswer=library;
 const r=await call('POST','/api/references/import',{body:{provider:'pixabay',id:'777'}});
 assert.equal(r.status,200,r.text);
 assert.equal(r.body.url,'/api/assets/'+r.body.id);
 const key=`orgs/${ORG_A}/users/${OWNER.id}/images/${r.body.id}`;
 const stored=await store.get(key);
 assert.ok(stored,'the picture is in the Studio\'s storage');
 assert.deepEqual(new Uint8Array(await stored.arrayBuffer()),JPEG,'the very bytes Pixabay sent');
 assert.ok(libraryCalls.includes('https://pixabay.com/get/g777def_1280.jpg'));
 // What the Photos panel hands the editor, and the layer the editor makes of it.
 const add=elements.photoCanvasAdd(r.body,{provider:'pixabay',width:6000,height:4000});
 assert.deepEqual(add.credit,{provider:'pixabay',name:'demo_maker',href:'https://pixabay.com/users/demo_maker-4242/',page:'https://pixabay.com/photos/demo-road-777/'});
 const design=doc.addLayer(doc.createDoc({id:'demo-visual-1',width:1200,height:800}),add,'photo-1');
 const layer=design.layers['photo-1'];
 assert.equal(layer.asset,'images/'+r.body.id);assert.equal(layer.name,'Photo by demo_maker');
 assert.equal(Math.round(layer.height/layer.width*100),67,'the photo keeps its shape');
 const saved=JSON.stringify(doc.cleanDoc(design));
 assert.ok(!saved.includes('pixabay.com/get')&&!saved.includes('cdn.pixabay.com'),'no picture address in the design');
 assert.equal(doc.checkDoc(JSON.parse(saved)).ok,true);
 assert.deepEqual(doc.cleanDoc(design).layers['photo-1'].credit,add.credit);
});

// ── The design format ───────────────────────────────────────────────────────
test('a picture\'s credit: only links on the library\'s own site, only its own four fields',()=>{
 const base=doc.addLayer(doc.createDoc({id:'demo-visual-2',width:1000,height:1000}),{kind:'image',src:'/api/assets/demo-asset-1',assetId:'demo-asset-1',name:'Photo',source:'upload'},'p');
 const withCredit=c=>({...base,layers:{...base.layers,p:{...base.layers.p,credit:c}}});
 const good={provider:'unsplash',name:'Demo Shooter',href:'https://unsplash.com/@demo_shooter?utm_source=nmesis_studio&utm_medium=referral',page:'https://unsplash.com/photos/abc?utm_source=nmesis_studio&utm_medium=referral'};
 assert.equal(doc.checkDoc(withCredit(good)).ok,true);
 assert.equal(doc.checkDoc(withCredit({...good,provider:'pexels',href:'https://www.pexels.com/@demo',page:'https://www.pexels.com/photo/123/'})).ok,true,'a library added later needs no change here');
 for(const bad of [
  {...good,href:'https://images.example.test/@demo'},{...good,page:'http://unsplash.com/photos/abc'},{...good,page:'https://unsplash.com.evil.test/photos/abc'},
  {...good,page:'https://unsplash.com/photos/abc?X-Amz-Signature=1'},{...good,page:'https://unsplash.com/photos/abc?token=1'},{...good,href:'https://user:pw@unsplash.com/'},
  {...good,name:''},{...good,name:'see https://elsewhere.test'},{...good,extra:'x'},{...good,provider:'Un splash'},'Photo by someone',
 ])assert.equal(doc.checkDoc(withCredit(bad)).ok,false,JSON.stringify(bad));
 // A credit somewhere else in a layer is still an address.
 const text=doc.addLayer(base,{kind:'text',style:'body'},'t');
 assert.equal(doc.checkDoc({...text,layers:{...text.layers,t:{...text.layers.t,credit:good}}}).ok,false);
});

test('an icon keeps its set\'s grid and whether it is solid; older icons read as before; a drop places the middle on the point',()=>{
 const d=doc.createDoc({id:'demo-visual-3',width:1000,height:500});
 const solid=doc.layerFor(d,{kind:'icon',icon:'acorn',name:'Acorn',paths:['M0 0L256 256Z'],grid:256,fill:true,at:{x:900,y:100}},'i');
 assert.equal(solid.grid,256);assert.equal(solid.fill,true);
 assert.deepEqual([solid.x+solid.width/2,solid.y+solid.height/2],[900,100]);
 const line=doc.layerFor(d,{kind:'icon',icon:'car',name:'Car',paths:['M1 1L23 23']},'j');
 assert.equal('grid' in line,false);assert.equal('fill' in line,false,'a 24-unit line icon is written as before');
 // A drop off the page lands on its edge.
 const off=doc.layerFor(d,{kind:'shape',shape:'rect',at:{x:-50,y:9999}},'k');
 assert.deepEqual([off.x+off.width/2,off.y+off.height/2],[0,500]);
 const both=doc.addLayer(doc.addLayer(d,{kind:'icon',icon:'acorn',name:'Acorn',paths:['M0 0L256 256Z'],grid:256,fill:true},'i'),{kind:'icon',icon:'car',name:'Car',paths:['M1 1L23 23']},'j');
 assert.equal(doc.checkDoc(both).ok,true);
 assert.deepEqual(doc.cleanDoc(both).layers.i.grid,256);
 for(const bad of [{grid:7},{grid:24.5},{grid:'24'},{fill:false},{fill:'yes'}])assert.equal(doc.checkDoc({...both,layers:{...both.layers,i:{...both.layers.i,...bad}}}).ok,false,JSON.stringify(bad));
});

// ── The icon sets ───────────────────────────────────────────────────────────
test('every icon set is MIT, Apache 2.0, ISC or CC0, ships with its licence, and its file is the set the panel expects',()=>{
 const sets=iconSets.ICON_SETS;
 assert.deepEqual(sets.map(s=>s.id),['lucide','tabler','phosphor','material']);
 for(const s of sets){
  assert.ok(['MIT','Apache-2.0','ISC','CC0-1.0'].includes(s.spdx),s.id+' '+s.spdx);
  assert.match(s.file,/^\/icons\/[a-z]+\.json$/);assert.match(s.licenceFile,/^\/icons\/[a-z]+\.LICENSE\.txt$/);
  const licence=fs.readFileSync(path.join(rootPath,'public',s.licenceFile),'utf8');
  assert.match(licence,s.spdx==='Apache-2.0'?/Apache License/:s.spdx==='MIT'?/MIT License/:/ISC License/);
  const set=iconSets.readIconSet(JSON.parse(fs.readFileSync(path.join(rootPath,'public',s.file),'utf8')),s);
  assert.ok(set,s.id);assert.equal(set.icons.length,s.count,s.id);assert.ok(s.count>1000,s.id);
  // No company's logo (a trademark, and a third-party brand name in a public repository).
  const logos=set.icons.map(i=>i.name).filter(n=>/^brand-|(^|-)logo(-|$)|(^|-)(google|android|youtube|facebook|instagram|github|nintendo|lego)(-|$)/.test(n));
  assert.deepEqual(logos,[],s.id);
  for(const icon of set.icons.slice(0,50))assert.equal(doc.checkDoc(doc.addLayer(doc.createDoc({id:'demo-visual-4',width:100,height:100}),{kind:'icon',icon:icon.name,name:icon.name,paths:icon.paths,grid:set.grid,fill:icon.fill},'x')).ok,true,s.id+':'+icon.name);
 }
 // Another set's file, or a damaged one, is not read as this one.
 assert.equal(iconSets.readIconSet({id:'tabler',grid:24,icons:[]},sets[0]),null);
 assert.equal(iconSets.readIconSet({id:'lucide',grid:24,icons:[['ok',0,['M1 1L2 2']],['bad',0,['<script>']],['x',2,['M1 1']]]},sets[0]).icons.length,1);
});

test('one search across every set: results from several sets, exact names first, tags matched, drawings left to their chunks',()=>{
 const raw=fs.readFileSync(path.join(rootPath,'public',iconSets.ICON_INDEX_FILE),'utf8');
 const index=iconSets.readIconIndex(JSON.parse(raw));
 assert.ok(index);
 assert.deepEqual(index.sets.map(s=>s.id),iconSets.ICON_SETS.map(s=>s.id));
 // Names and tags only: no drawing in the index, and it stays small.
 assert.ok(!/"M[0-9]/.test(raw)&&Buffer.byteLength(raw)<600_000,'the index holds no drawings');
 for(const s of index.sets)assert.equal(s.names.length,iconSets.ICON_SETS.find(i=>i.id===s.id).count,s.id);
 // "car": one list from more than one set, every exact "car" before any other.
 const car=iconSets.searchAllSets(index,'car');
 assert.ok(new Set(car.map(h=>h.set)).size>1,'results from more than one set');
 const exact=car.filter(h=>h.name==='car');
 assert.ok(exact.length>1,'"car" is a name in more than one set');
 assert.deepEqual(car.slice(0,exact.length).map(h=>h.name),exact.map(()=>'car'),'exact names first');
 // "steering" finds the steering icons in every set that has one.
 const steering=iconSets.searchAllSets(index,'steering');
 assert.ok(new Set(steering.map(h=>h.set)).size>=3,JSON.stringify(steering.slice(0,6)));
 assert.ok(steering.every(h=>/steering/.test(h.name)||/steering/.test(index.sets.find(s=>s.id===h.set).tags[h.name]||'')));
 // A tag finds an icon its name doesn't (the Studio's plain words: "ev" → electric icons).
 const ev=iconSets.searchAllSets(index,'ev');
 assert.ok(ev.some(h=>h.name==='battery-charging'),'"ev" finds the charging battery by its tag');
 assert.deepEqual(iconSets.searchAllSets(index,'  '),[]);
 assert.deepEqual(iconSets.searchAllSets(index,'zzzqqq'),[]);
 // Each hit's drawing is in its set's chunk, at its place.
 for(const hit of [...car.slice(0,3),...steering.slice(0,3)]){
  const chunk=iconSets.readIconChunk(JSON.parse(fs.readFileSync(path.join(rootPath,'public','icons',hit.set,`${Math.floor(hit.at/index.chunk)}.json`),'utf8')));
  assert.ok(chunk.some(i=>i.name===hit.name),hit.set+':'+hit.name);
 }
});

test('the Photos panel opens with results for "cars", written in its search box',async()=>{
 const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
 const panel=tsxLoader({'@/components/ds/toast':{useToast:()=>({toast(){}})}})('components/canvas/photos-panel.tsx');
 assert.equal(panel.OPENING_SEARCH,'cars');
 const html=renderToStaticMarkup(React.createElement(panel.PhotosPanel));
 // The search is already running as it opens (a placeholder grid), with no typing.
 assert.match(html,/<input[^>]*type="search"[^>]*value="cars"/);
 assert.match(html,/aria-busy="true" aria-label="Loading photos"/);
 assert.ok(!html.includes('Find a photo'),'no empty start: results come at once');
 // The search box stays the person's to change, and every library off still wins over any grid.
 const src=fs.readFileSync(path.join(rootPath,'components/canvas/photos-panel.tsx'),'utf8');
 assert.match(src,/\{allOff\?<State kind="empty" title="Photos aren’t set up yet">/);
});

test('no icon or font service is named anywhere the Studio runs: the icon data is its own',()=>{
 const hosts=/iconify\.design|api\.iconify|api\.simplesvg|api\.unisvg|unpkg\.com\/@iconify|cdn\.jsdelivr\.net\/npm\/@iconify/;
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const dir of ['app','components','lib'])for(const f of walk(path.join(rootPath,dir)).filter(f=>/\.(tsx?|css|json)$/.test(f)))
  assert.ok(!hosts.test(fs.readFileSync(f,'utf8')),path.relative(rootPath,f));
 const panel=fs.readFileSync(path.join(rootPath,'components/canvas/icons-panel.tsx'),'utf8');
 // A set, the search index and a result's chunk: each from the Studio's own address, and nothing else is fetched.
 assert.match(panel,/once\(sets,info\.id,info\.file,/,'a set loads from the Studio\'s own address');
 assert.match(panel,/once\(indexes,'index',ICON_INDEX_FILE,/);
 assert.match(panel,/`\/icons\/\$\{set\}\/\$\{n\}\.json`/);
 assert.equal((panel.match(/fetch\(/g)||[]).length,1,'one fetch, inside once()');
 assert.equal(iconSets.ICON_INDEX_FILE,'/icons/index.json');
});
