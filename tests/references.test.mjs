// Reference photos (lib/references, app/api/references, the References panel).
// The providers run against a fake fetch: nothing here reaches a real library.
// The routes run with the same stand-ins as tests/accounts-access.test.mjs: the
// verified session and company list (tests/support), SQLite for Postgres and
// the local S3 stand-in; every other request is answered by the fake library or
// refused and counted. All data is synthetic.
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import {tsxLoader} from './support/load-tsx.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const KEY='demo-access-key-0123456789abcdef';
const ENV={UNSPLASH_ACCESS_KEY:KEY};
const UTM='utm_source=nmesis_studio&utm_medium=referral';
const Q={query:'demo suv',page:1,perPage:24};
// A JPEG's first bytes, then padding: enough for the Studio's magic-byte check.
const JPEG=new Uint8Array(2048);JPEG.set([255,216,255,224,0,16,74,70,73,70,0,1]);

const json=(value,init={})=>new Response(JSON.stringify(value),{status:200,...init,headers:{'content-type':'application/json',...init.headers}});
const jpeg=(headers={},body=JPEG)=>new Response(body,{status:200,headers:{'content-type':'image/jpeg',...headers}});
const rawPhoto=(id,extra={})=>({
 id,width:4000,height:3000,alt_description:'A demo SUV on a coastal road',description:null,
 urls:{raw:`https://images.unsplash.com/photo-${id}?ixid=demo&ixlib=rb-4.0.3`,full:`https://images.unsplash.com/photo-${id}?ixid=demo&q=85`,regular:`https://images.unsplash.com/photo-${id}?ixid=demo&w=1080`,small:`https://images.unsplash.com/photo-${id}?ixid=demo&w=400`,thumb:`https://images.unsplash.com/photo-${id}?ixid=demo&w=200`},
 links:{html:`https://unsplash.com/photos/${id}`,download_location:`https://api.unsplash.com/photos/${id}/download?ixid=demo`},
 user:{name:'Demo Photographer',username:'demo_photographer'},
 ...extra,
});
/** A fetch that answers from `answer(url, init)` and records every request; undefined → refused. */
function fakeFetch(answer){
 const calls=[];
 const f=async(url,init={})=>{
  const u=new URL(String(url));calls.push({url:u.href,host:u.hostname,headers:new Headers(init.headers||{}),redirect:init.redirect});
  const r=await answer(u,init);if(!r)throw new Error('Unexpected request to '+u.hostname);return r;
 };
 f.calls=calls;return f;
}
/** Runs fn with console.error silenced (the providers log failures by status). */
async function quiet(fn){const real=console.error;console.error=()=>{};try{return await fn()}finally{console.error=real}}

let lib,unsplash,pinterest,providers,s3,store,routes={};
const realFetch=globalThis.fetch;let libraryCalls=[],libraryAnswer=null;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0xa),OWNER={id:id(0xa1),email:'owner@example.test'},VIEWER={id:id(0xa3),email:'viewer@example.test'};
const ORIGIN='http://studio.test';
before(async()=>{
 lib=await import('@/lib/references/unsplash.ts');unsplash=lib.unsplash;
 pinterest=(await import('@/lib/references/pinterest.ts')).pinterest;
 providers=await import('@/lib/references/index.ts');
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);libraryCalls.push(u);if(libraryAnswer){const r=await libraryAnswer(new URL(u),init);if(r)return r}throw new Error('Requests to this host are not allowed in this test.')};
 const features=Object.fromEntries(['studio.enabled','studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'].map(k=>[k,true]));
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Company A',kind:'client'}],
  members:[{userId:OWNER.id,orgId:ORG_A,role:'owner',status:'active'},{userId:VIEWER.id,orgId:ORG_A,role:'viewer',status:'active'}],
  entitlements:{[ORG_A]:{legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{...features,'studio.max_output':'8k'}}},
 });
 for(const p of ['app/api/references/route.ts','app/api/references/import/route.ts'])routes[p]=await import('@/'+p);
 store=(await import('@/lib/portable/storage.ts')).getStorage();
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});
beforeEach(()=>{lib.forgetUnsplash();libraryCalls=[];libraryAnswer=null;state.user=OWNER;state.chosenOrg=null;state.chosenBrand=null;process.env.UNSPLASH_ACCESS_KEY=KEY});

// ── The providers ───────────────────────────────────────────────────────────
test('the registry offers Unsplash first, then Pinterest, and knows no other id',()=>{
 assert.deepEqual(providers.REFERENCE_PROVIDERS.map(p=>p.id),['unsplash','pinterest']);
 assert.equal(providers.referenceProvider('unsplash'),unsplash);
 for(const v of ['nope','',null,undefined,{},'UNSPLASH'])assert.equal(providers.referenceProvider(v),null);
});

test('without a key Unsplash is unavailable and makes no request',async()=>{
 const f=fakeFetch(()=>undefined);
 for(const env of [{},{UNSPLASH_ACCESS_KEY:''},{UNSPLASH_ACCESS_KEY:'short'},{UNSPLASH_ACCESS_KEY:'a key with spaces in it, 12345'}])assert.equal(unsplash.available(env),false,JSON.stringify(env));
 assert.equal(unsplash.available(ENV),true);
 await assert.rejects(unsplash.search(Q,{env:{},fetch:f}),e=>e.status===503&&e.message==='The photo library isn\'t set up yet.');
 await assert.rejects(unsplash.fetchForUse('demo-photo-1',{env:{},fetch:f}),{status:503});
 assert.equal(f.calls.length,0);
});

test('a search maps Unsplash\'s fields, keeps only photos on its own image host, and credits each one with the utm links',async()=>{
 const results=[
  rawPhoto('demo-photo-1'),
  rawPhoto('demo-photo-2',{alt_description:null,description:'Demo hatch at dusk',user:{name:'  Second   Person ',username:'second.person'}}),
  rawPhoto('demo-premium-1',{urls:{raw:'https://plus.unsplash.com/premium_photo-1',regular:'https://plus.unsplash.com/premium_photo-1?w=1080',small:'https://plus.unsplash.com/premium_photo-1?w=400'}}),
  rawPhoto('demo-elsewhere',{urls:{raw:'https://images.example.test/a.jpg',regular:'https://images.example.test/a.jpg',small:'https://images.example.test/a.jpg'}}),
  rawPhoto('demo-plain-http',{urls:{raw:'http://images.unsplash.com/photo-x',regular:'http://images.unsplash.com/photo-x',small:'http://images.unsplash.com/photo-x'}}),
  rawPhoto('demo-nobody',{user:{}}),
  {id:'not an id!',urls:{}},null,'text',
 ];
 const f=fakeFetch(u=>u.hostname==='api.unsplash.com'&&u.pathname==='/search/photos'?json({total:60,total_pages:3,results}):undefined);
 const page=await unsplash.search({...Q,query:'  demo suv  '},{env:ENV,fetch:f});
 assert.deepEqual(page.photos.map(p=>p.id),['demo-photo-1','demo-photo-2']);
 assert.equal(page.nextPage,2);
 assert.deepEqual(page.photos[0],{
  id:'demo-photo-1',provider:'unsplash',
  thumb:'https://images.unsplash.com/photo-demo-photo-1?ixid=demo&w=400',src:'https://images.unsplash.com/photo-demo-photo-1?ixid=demo&w=1080',
  width:4000,height:3000,alt:'A demo SUV on a coastal road',
  credit:{name:'Demo Photographer',href:`https://unsplash.com/@demo_photographer?${UTM}`,source:'Unsplash',sourceHref:`https://unsplash.com/?${UTM}`},
 });
 assert.equal(page.photos[1].alt,'Demo hatch at dusk');
 assert.deepEqual(page.photos[1].credit,{name:'Second Person',href:`https://unsplash.com/@second.person?${UTM}`,source:'Unsplash',sourceHref:`https://unsplash.com/?${UTM}`});
 // One request, to the official API, with the key in the header only.
 assert.equal(f.calls.length,1);
 const [call]=f.calls,url=new URL(call.url);
 assert.equal(url.origin+url.pathname,'https://api.unsplash.com/search/photos');
 assert.deepEqual(Object.fromEntries(url.searchParams),{query:'demo suv',page:'1',per_page:'24',content_filter:'high'});
 assert.equal(call.headers.get('authorization'),'Client-ID '+KEY);
 assert.equal(call.headers.get('accept-version'),'v1');
 assert.equal(call.redirect,'manual');
 // What the browser gets has neither the key nor the tracking address.
 const sent=JSON.stringify(page);
 assert.ok(!sent.includes(KEY)&&!sent.includes('/download')&&!sent.includes('ixlib'),sent);
 // The same search again is remembered (the hourly allowance is per key).
 await unsplash.search({...Q,query:'Demo SUV'},{env:ENV,fetch:f});
 assert.equal(f.calls.length,1);
 // The last page has no next one.
 const last=fakeFetch(()=>json({total_pages:3,results:[rawPhoto('demo-photo-9')]}));
 assert.equal((await unsplash.search({...Q,page:3},{env:ENV,fetch:last})).nextPage,null);
 assert.equal((await unsplash.search({...Q,page:4},{env:ENV,fetch:fakeFetch(()=>json({total_pages:3,results:[]}))})).nextPage,null);
});

test('the credit never links anywhere but Unsplash, and names nobody without a name',()=>{
 assert.equal(lib.unsplashCredit({name:'Demo Photographer',username:'evil"><script>'}).href,`https://unsplash.com/?${UTM}`);
 assert.equal(lib.unsplashCredit({username:'only_username'}).name,'only_username');
 assert.equal(lib.unsplashCredit({}),null);
 assert.equal(lib.unsplashCredit(undefined),null);
 for(const c of [lib.unsplashCredit({name:'A',username:'a'}),lib.unsplashCredit({name:'B'})]){
  assert.ok(c.href.startsWith('https://unsplash.com/')&&c.href.endsWith('?'+UTM));
  assert.ok(c.sourceHref.endsWith('?'+UTM));
 }
});

test('using a photo fetches it from Unsplash\'s image host and calls its download_location',async()=>{
 const f=fakeFetch(u=>{
  if(u.hostname==='api.unsplash.com'&&u.pathname==='/photos/demo-photo-1')return json(rawPhoto('demo-photo-1'));
  if(u.hostname==='images.unsplash.com'&&u.pathname==='/photo-demo-photo-1')return jpeg();
  if(u.hostname==='api.unsplash.com'&&u.pathname==='/photos/demo-photo-1/download')return json({url:'https://images.unsplash.com/photo-demo-photo-1?ixid=demo'});
 });
 const got=await unsplash.fetchForUse('demo-photo-1',{env:ENV,fetch:f});
 assert.equal(got.type,'image/jpeg');
 assert.deepEqual([...got.bytes.slice(0,3)],[255,216,255]);
 assert.equal(got.bytes.byteLength,JPEG.byteLength);
 assert.equal(got.photo.credit.href,`https://unsplash.com/@demo_photographer?${UTM}`);
 const [details,picture,tracked]=f.calls;
 assert.equal(f.calls.length,3);
 assert.equal(details.url,'https://api.unsplash.com/photos/demo-photo-1');
 const p=new URL(picture.url);
 assert.equal(p.hostname,'images.unsplash.com');
 assert.equal(p.searchParams.get('ixid'),'demo','Unsplash\'s own parameters are kept');
 assert.equal(p.searchParams.get('w'),'2048');assert.equal(p.searchParams.get('fm'),'jpg');
 assert.equal(picture.headers.get('authorization'),null,'the key is never sent to the image host');
 assert.equal(tracked.url,'https://api.unsplash.com/photos/demo-photo-1/download?ixid=demo');
 assert.equal(tracked.headers.get('authorization'),'Client-ID '+KEY);
});

test('a photo seen in a search is used without asking for its details again, and still tracked',async()=>{
 const f=fakeFetch(u=>{
  if(u.pathname==='/search/photos')return json({total_pages:1,results:[rawPhoto('demo-photo-3')]});
  if(u.hostname==='images.unsplash.com')return jpeg();
  if(u.pathname==='/photos/demo-photo-3/download')return json({});
 });
 await unsplash.search(Q,{env:ENV,fetch:f});
 await unsplash.fetchForUse('demo-photo-3',{env:ENV,fetch:f});
 assert.deepEqual(f.calls.map(c=>c.host+new URL(c.url).pathname),['api.unsplash.com/search/photos','images.unsplash.com/photo-demo-photo-3','api.unsplash.com/photos/demo-photo-3/download']);
});

test('hosts other than Unsplash\'s are refused, including by redirect, and never contacted',async()=>{
 const details=extra=>u=>u.pathname.startsWith('/photos/')&&!u.pathname.endsWith('/download')&&u.hostname==='api.unsplash.com'?json(rawPhoto(u.pathname.split('/')[2],extra)):undefined;
 // A redirect from the image host to another host.
 let f=fakeFetch(u=>details()(u)??(u.hostname==='images.unsplash.com'?new Response(null,{status:302,headers:{location:'https://images.example.test/photo.jpg'}}):undefined));
 await quiet(()=>assert.rejects(unsplash.fetchForUse('demo-photo-4',{env:ENV,fetch:f}),{status:502}));
 assert.ok(f.calls.every(c=>c.host.endsWith('unsplash.com')),JSON.stringify(f.calls.map(c=>c.host)));
 assert.ok(!f.calls.some(c=>c.url.includes('/download')),'nothing used, nothing tracked');
 // A redirect to plain http on the right host.
 lib.forgetUnsplash();
 f=fakeFetch(u=>details()(u)??(u.protocol==='https:'&&u.hostname==='images.unsplash.com'?new Response(null,{status:301,headers:{location:'http://images.unsplash.com/photo.jpg'}}):undefined));
 await quiet(()=>assert.rejects(unsplash.fetchForUse('demo-photo-5',{env:ENV,fetch:f}),{status:502}));
 assert.ok(f.calls.every(c=>c.url.startsWith('https://')));
 // A redirect that stays on the image host is followed.
 lib.forgetUnsplash();
 f=fakeFetch(u=>details()(u)??(u.hostname==='images.unsplash.com'?(u.pathname==='/moved.jpg'?jpeg():new Response(null,{status:307,headers:{location:'/moved.jpg'}})):undefined)??(u.pathname.endsWith('/download')?json({}):undefined));
 assert.equal((await unsplash.fetchForUse('demo-photo-6',{env:ENV,fetch:f})).type,'image/jpeg');
 // An answer whose picture lives elsewhere is not used, and that host is not asked.
 lib.forgetUnsplash();
 f=fakeFetch(details({urls:{raw:'https://images.example.test/a.jpg',regular:'https://images.example.test/a.jpg',small:'https://images.example.test/a.jpg'}}));
 await assert.rejects(unsplash.fetchForUse('demo-photo-7',{env:ENV,fetch:f}),{status:422});
 assert.deepEqual(f.calls.map(c=>c.host),['api.unsplash.com']);
 // A download_location on another host is replaced by Unsplash's own address.
 lib.forgetUnsplash();
 f=fakeFetch(u=>details({links:{download_location:'https://tracker.example.test/hit'}})(u)??(u.hostname==='images.unsplash.com'?jpeg():undefined)??(u.hostname==='api.unsplash.com'&&u.pathname.endsWith('/download')?json({}):undefined));
 await unsplash.fetchForUse('demo-photo-8',{env:ENV,fetch:f});
 assert.equal(f.calls.at(-1).url,'https://api.unsplash.com/photos/demo-photo-8/download');
 // An id that is not an id is refused before any request.
 f=fakeFetch(()=>undefined);
 for(const bad of ['../me','a b','x'.repeat(65),''])await assert.rejects(unsplash.fetchForUse(bad,{env:ENV,fetch:f}),{status:404});
 assert.equal(f.calls.length,0);
});

test('a picture must say it is a picture and stay under the size limit',async()=>{
 const with_=picture=>fakeFetch(u=>u.hostname==='api.unsplash.com'&&!u.pathname.endsWith('/download')?json(rawPhoto(u.pathname.split('/')[2])):u.hostname==='images.unsplash.com'?picture():json({}));
 let f=with_(()=>new Response('<html></html>',{status:200,headers:{'content-type':'text/html'}}));
 await quiet(()=>assert.rejects(unsplash.fetchForUse('demo-photo-10',{env:ENV,fetch:f}),{status:502}));
 assert.ok(!f.calls.some(c=>c.url.includes('/download')));
 lib.forgetUnsplash();
 f=with_(()=>jpeg({'content-length':String(lib.IMAGE_LIMIT+1)}));
 await assert.rejects(unsplash.fetchForUse('demo-photo-11',{env:ENV,fetch:f}),e=>e.status===422&&/too large/.test(e.message));
 // No length given: the reading stops once the limit is passed.
 lib.forgetUnsplash();
 const chunk=new Uint8Array(1_000_000);chunk.set([255,216,255]);let sent=0;
 const stream=()=>new ReadableStream({pull(c){sent++;if(sent>20)c.close();else c.enqueue(chunk)}});
 f=with_(()=>new Response(stream(),{status:200,headers:{'content-type':'image/jpeg'}}));
 await assert.rejects(unsplash.fetchForUse('demo-photo-12',{env:ENV,fetch:f}),{status:422});
 assert.ok(sent<=10,'stopped reading at '+sent+' MB');
 assert.ok(!f.calls.some(c=>c.url.includes('/download')),'nothing used, nothing tracked');
 // A failing download tracking is logged and does not undo the photo.
 lib.forgetUnsplash();
 f=fakeFetch(u=>u.hostname==='images.unsplash.com'?jpeg():u.pathname.endsWith('/download')?new Response('',{status:500}):json(rawPhoto('demo-photo-13')));
 assert.equal((await quiet(()=>unsplash.fetchForUse('demo-photo-13',{env:ENV,fetch:f}))).type,'image/jpeg');
});

test('Unsplash\'s refusals become plain sentences, and nothing logged carries the key',async()=>{
 const logged=[];const real=console.error;console.error=(...a)=>logged.push(a.join(' '));
 try{
  const answer=(status,headers={})=>fakeFetch(()=>json({errors:['Rate Limit Exceeded']},{status,headers}));
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:answer(403,{'x-ratelimit-remaining':'0'})}),e=>e.status===429&&/a lot of searches/.test(e.message));
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:answer(429)}),{status:429});
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:answer(401)}),e=>e.status===503&&/access key/.test(e.message));
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:answer(500)}),{status:502});
  await assert.rejects(unsplash.fetchForUse('demo-gone',{env:ENV,fetch:answer(404)}),{status:404});
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:fakeFetch(()=>new Response('not json',{status:200}))}),{status:502});
  await assert.rejects(unsplash.search(Q,{env:ENV,fetch:async()=>{throw new TypeError('fetch failed')}}),{status:502});
  const gone=new AbortController();gone.abort();
  await assert.rejects(unsplash.search(Q,{env:ENV,signal:gone.signal,fetch:(u,init)=>Promise.reject(init.signal.reason)}),{status:502});
 }finally{console.error=real}
 assert.ok(logged.length>=5);
 assert.ok(logged.every(l=>!l.includes(KEY)&&!l.includes('demo suv')),logged.join('\n'));
});

test('the Pinterest stub is off whatever the environment says, and makes no request',async()=>{
 const f=fakeFetch(()=>undefined);
 for(const env of [{},{PINTEREST_API_TOKEN:'demo-token'},process.env])assert.equal(pinterest.available(env),false);
 const page=await pinterest.search(Q,{env:{PINTEREST_API_TOKEN:'demo-token'},fetch:f});
 assert.deepEqual(page.photos,[]);assert.equal(page.nextPage,null);
 assert.equal(page.notice,'Pinterest search isn\'t available in the Studio.');
 await assert.rejects(pinterest.fetchForUse('demo-pin',{env:{PINTEREST_API_TOKEN:'demo-token'},fetch:f}),{status:503});
 assert.equal(f.calls.length,0);
 assert.deepEqual(libraryCalls,[]);
});

// ── The routes ──────────────────────────────────────────────────────────────
async function call(method,path,{body,raw}={}){
 const file=path.startsWith('/api/references/import')?'app/api/references/import/route.ts':'app/api/references/route.ts';
 const headers={origin:ORIGIN};if(body!==undefined||raw!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+path,{method,headers,...body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{}}));
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,headers:response.headers};
}
const library=u=>{
 if(u.hostname==='api.unsplash.com'&&u.pathname==='/search/photos')return json({total_pages:5,results:[rawPhoto('demo-route-1'),rawPhoto('demo-route-2')]});
 if(u.hostname==='api.unsplash.com'&&/^\/photos\/[\w-]+$/.test(u.pathname))return json(rawPhoto(u.pathname.split('/')[2]));
 if(u.hostname==='images.unsplash.com')return jpeg();
 if(u.hostname==='api.unsplash.com'&&u.pathname.endsWith('/download'))return json({});
};

test('GET /api/references: one page of search results for a signed-in member',async()=>{
 libraryAnswer=library;
 const r=await call('GET','/api/references?q=demo%20suv&page=2');
 assert.equal(r.status,200,r.text);
 assert.equal(r.body.provider,'unsplash');assert.equal(r.body.available,true);assert.equal(r.body.nextPage,3);
 assert.deepEqual(r.body.photos.map(p=>p.id),['demo-route-1','demo-route-2']);
 assert.equal(r.body.photos[0].credit.sourceHref,`https://unsplash.com/?${UTM}`);
 assert.ok(!r.text.includes(KEY));
 assert.equal(new URL(libraryCalls[0]).searchParams.get('page'),'2');
 // A viewer may look.
 state.user=VIEWER;assert.equal((await call('GET','/api/references?q=demo%20hatch')).status,200);
 // Nobody signed in may not.
 state.user=null;assert.equal((await call('GET','/api/references?q=demo')).status,401);
});

test('GET /api/references checks what it is asked before asking the library',async()=>{
 libraryAnswer=library;
 for(const q of ['','q=','q=%20%20','q='+'x'.repeat(101),'q=demo&page=0','q=demo&page=51','q=demo&page=x','q=demo&page=1.5','q=demo&page=-1','q=demo&provider=elsewhere']){
  const r=await call('GET','/api/references?'+q);
  assert.equal(r.status,400,q+' '+r.text);assert.equal(typeof r.body.error,'string');
 }
 assert.deepEqual(libraryCalls,[]);
});

test('without a key the search says so plainly (a state, not an error), adding answers 503, and nothing is asked of the library',async()=>{
 delete process.env.UNSPLASH_ACCESS_KEY;libraryAnswer=library;
 const search=await call('GET','/api/references?q=demo');
 assert.equal(search.status,200);
 assert.deepEqual(search.body,{error:'The photo library isn\'t set up yet.',provider:'unsplash',available:false,photos:[],nextPage:null});
 const used=await call('POST','/api/references/import',{body:{provider:'unsplash',id:'demo-route-1'}});
 assert.equal(used.status,503);assert.equal(used.body.error,'The photo library isn\'t set up yet.');
 const pin=await call('GET','/api/references?q=demo&provider=pinterest');
 assert.equal(pin.status,200);assert.equal(pin.body.available,false);
 assert.deepEqual(libraryCalls,[]);
});

test('POST /api/references/import stores the photo as the person\'s own asset, tracked, with its credit',async()=>{
 libraryAnswer=library;
 // Anything else in the body is ignored: the owner is always the signed-in person.
 const r=await call('POST','/api/references/import',{body:{provider:'unsplash',id:'demo-route-7',owner:'someone-else',orgId:id(0xb),url:'https://images.example.test/x.jpg'}});
 assert.equal(r.status,200,r.text);
 assert.match(r.body.id,/^[a-z0-9-]{8,80}$/);
 assert.equal(r.body.url,'/api/assets/'+r.body.id);
 assert.deepEqual(r.body.credit,{name:'Demo Photographer',href:`https://unsplash.com/@demo_photographer?${UTM}`,source:'Unsplash',sourceHref:`https://unsplash.com/?${UTM}`});
 const head=await store.head(`orgs/${ORG_A}/users/${OWNER.id}/images/${r.body.id}`);
 assert.ok(head,'stored under the person\'s own prefix');
 assert.equal(head.httpMetadata.contentType,'image/jpeg');
 assert.equal(head.size,JPEG.byteLength);
 assert.ok(libraryCalls.includes('https://api.unsplash.com/photos/demo-route-7/download?ixid=demo'),'download_location was called');
 assert.ok(!libraryCalls.some(u=>u.includes('example.test')));
});

test('POST /api/references/import refuses viewers, bad input, other libraries and what is not a picture',async()=>{
 libraryAnswer=library;
 state.user=VIEWER;
 const viewer=await call('POST','/api/references/import',{body:{provider:'unsplash',id:'demo-route-1'}});
 assert.equal(viewer.status,403);assert.match(viewer.body.error,/viewer/);
 state.user=OWNER;
 for(const body of [{},{provider:'unsplash'},{provider:'unsplash',id:'../x'},{provider:'unsplash',id:42},{provider:'elsewhere',id:'demo-route-1'},{id:'demo-route-1'}])assert.equal((await call('POST','/api/references/import',{body})).status,400,JSON.stringify(body));
 assert.equal((await call('POST','/api/references/import',{raw:'not json'})).status,400);
 assert.equal((await call('POST','/api/references/import',{raw:JSON.stringify({provider:'unsplash',id:'demo-route-1',pad:'x'.repeat(2000)})})).status,413);
 assert.deepEqual(libraryCalls,[]);
 assert.equal((await call('POST','/api/references/import',{body:{provider:'pinterest',id:'demo-pin'}})).status,503);
 // The library says JPEG but sends something else: the magic bytes decide, nothing is stored.
 libraryAnswer=u=>u.hostname==='images.unsplash.com'?jpeg({},new TextEncoder().encode('<html>not a picture</html>')):library(u);
 const before=(await store.list?.({prefix:`orgs/${ORG_A}/users/${OWNER.id}/images/`}))?.objects?.length;
 const fake=await call('POST','/api/references/import',{body:{provider:'unsplash',id:'demo-route-8'}});
 assert.equal(fake.status,422);assert.equal(fake.body.error,'That photo could not be used. Choose another.');
 if(before!==undefined)assert.equal((await store.list({prefix:`orgs/${ORG_A}/users/${OWNER.id}/images/`})).objects.length,before);
 // The library is down: a plain sentence, not a stack.
 libraryAnswer=()=>new Response('',{status:503});
 const down=await quiet(()=>call('POST','/api/references/import',{body:{provider:'unsplash',id:'demo-route-9'}}));
 assert.equal(down.status,502);assert.equal(down.body.error,'The photo library didn’t answer. Try again.');
});

// ── The panel ───────────────────────────────────────────────────────────────
const load=tsxLoader({'@/components/ds/toast':{useToast:()=>({toast:()=>0,undo:()=>0,dismiss:()=>{}})}});
const draw=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('ReferenceCredit says "Photo by <name> on Unsplash" with both links, and never links anything but https',()=>{
 const {ReferenceCredit}=load('components/references/references-panel.tsx');
 const credit={name:'Demo Photographer',href:`https://unsplash.com/@demo_photographer?${UTM}`,source:'Unsplash',sourceHref:`https://unsplash.com/?${UTM}`};
 const html=draw(ReferenceCredit,{credit});
 assert.match(html,/^<p class="refs-credit">Photo by <a [^>]*href="https:\/\/unsplash\.com\/@demo_photographer\?utm_source=nmesis_studio&amp;utm_medium=referral"[^>]*>Demo Photographer<\/a> on <a [^>]*href="https:\/\/unsplash\.com\/\?utm_source=nmesis_studio&amp;utm_medium=referral"[^>]*>Unsplash<\/a><\/p>$/);
 assert.match(html,/rel="noopener noreferrer"/);
 const odd=draw(ReferenceCredit,{credit:{...credit,href:'javascript:alert(1)',sourceHref:'http://unsplash.example.test/'}});
 assert.doesNotMatch(odd,/<a |javascript:|example\.test/);
 assert.match(odd,/Photo by Demo Photographer on Unsplash/);
});

test('the panel opens on the chosen car\'s name, loading, with the search and the tray count',()=>{
 const {ReferencesPanel}=load('components/references/references-panel.tsx');
 const html=draw(ReferencesPanel,{initialQuery:'  Demo SUV '});
 assert.match(html,/<form class="refs-search" role="search">/);
 assert.match(html,/<input class="ds-input" type="search" maxLength="100"[^>]*value="Demo SUV"\/>/);
 assert.match(html,/role="status" aria-busy="true"><span class="ds-sr-only">Loading photos<\/span>/);
 assert.equal((html.match(/ds-skel-tile/g)||[]).length,8);
 assert.match(html,/0 of 6 references chosen/);
 const none=draw(ReferencesPanel,{initialQuery:''});
 assert.match(none,/Search for photos/);
 assert.doesNotMatch(none,/Loading photos/);
});
