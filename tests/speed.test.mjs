// Speed (finish pass): the workspace draws at once and the credits load on their
// own. What is tested here is the logic without timing: the credit overview is
// read once per request context and never shared; it calls storage only when an
// answer needs it, and never waits on it for long; the meter's two statements go
// together once the period is known; the notices' remembered room; the brand
// mark's name-only rule after a 204; the Server-Timing header.
// (Round trips against a real Postgres: tests/postgres.test.mjs in CI.)
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('../scripts/verify/hooks.mjs',import.meta.url);
import {sqliteDatabase} from './support/state.mjs';
const {creditOverview,keyPresence}=await import('../lib/credits/usage.ts');
const {CreditStore,clearPriceBookCache}=await import('../lib/credits/store.ts');
const {readNoticeSpace,rememberNoticeSpace,noticeSpace,NOTICE_SPACE_KEY}=await import('../lib/notice-space.ts');
const {logoView,logoMissing,logoSrc,forgetLogoMisses,LOGO_MISSING_KEY}=await import('../lib/brand-logo.ts');
const {serverTiming,timed}=await import('../lib/server-timing.ts');

const ORG='0000000a-0000-4000-8000-00000000000a',OWNER='00000000-0000-4000-8000-0000000000a1',CREATOR='00000000-0000-4000-8000-0000000000a2';
const plan=own=>({legacy:false,status:'active',planId:own?'enterprise':'growth',planName:own?'Enterprise':'Growth',endsOn:null,features:{'studio.enabled':true,'studio.own_keys':own}});
beforeEach(()=>clearPriceBookCache());
// A bucket that counts what it is asked; `files` are the saved keys.
function bucket(files=[],{slow=0,listFails=false}={}){
 const calls={list:0,head:0};
 return {calls,
  list:async({prefix})=>{calls.list++;if(slow)await new Promise(r=>setTimeout(r,slow));if(listFails)throw Object.assign(new Error('denied'),{name:'AccessDenied'});return {objects:files.filter(k=>k.startsWith(prefix)).map(key=>({key}))}},
  head:async k=>{calls.head++;return files.includes(k)?{key:k}:null}};
}
function company({role='creator',own=false,files=[],slow=0}={}){
 const clock={now:()=>Date.parse('2026-11-14T10:00:00Z')};
 const db=sqliteDatabase({clock});db.ledger.allowance(ORG,100,'2026-11-01');
 const BUCKET=bucket(files,{slow});
 const ctx={DB:db,BUCKET,org:ORG,userId:role==='owner'?OWNER:CREATOR,role,entitlements:plan(own),account:{org:{id:ORG,name:'Demo Company',kind:'client'},viewingAs:false}};
 return {ctx,BUCKET,db};
}
const key=p=>`orgs/${ORG}/keys/credentials/${p}.json`;

test('the credit overview is read once per request context, and never shared between contexts',async()=>{
 const {ctx}=company();
 const a=creditOverview(ctx),b=creditOverview(ctx);
 assert.equal(a,b,'the same request asks once');
 const other=creditOverview({...ctx});
 assert.notEqual(other,a,'another request (another context) reads again');
 assert.deepEqual(await a,await other,'with the same answer for the same company');
 const o=await a;
 assert.equal(o.unlimited,false);assert.equal(o.meter.left,100);assert.equal(o.meter.used,0);assert.equal(o.billing.openai,'credits');assert.equal(o.ignoredKeys,null);assert.equal(o.usage,false);
});

test('storage is asked only when the answer needs it: once (a listing), never per provider',async()=>{
 // A creator on a plan without own keys: no storage call at all.
 const creator=company({role:'creator',files:[key('openai')]});
 await creditOverview(creator.ctx);
 assert.deepEqual(creator.BUCKET.calls,{list:0,head:0});
 // The owner of that company may be told a saved key is ignored: one listing.
 const owner=company({role:'owner',files:[key('openai')]});
 const o=await creditOverview(owner.ctx);
 assert.deepEqual(owner.BUCKET.calls,{list:1,head:0});
 assert.match(o.ignoredKeys,/kept, not deleted/);assert.equal(o.billing.openai,'credits','ignored: paid with credits');
 // A plan with its own keys: one listing; the saved provider is "own key".
 const ent=company({role:'creator',own:true,files:[key('google')]});
 const e=await creditOverview(ent.ctx);
 assert.deepEqual(ent.BUCKET.calls,{list:1,head:0});
 assert.equal(e.billing.google,'own key');assert.equal(e.billing.openai,'credits');assert.equal(e.ignoredKeys,null);
});

test('saved keys that are late or unreadable read as none for this answer; a failed listing falls back to one check each',async()=>{
 const late=company({role:'owner',files:[key('openai')],slow:200});
 const warn=console.warn;const warned=[];console.warn=(...a)=>warned.push(a.join(' '));
 try{
  assert.deepEqual(await keyPresence(late.ctx,20),{openai:false,google:false,higgsfield:false,topaz:false});
  assert.ok(warned.some(w=>/took too long/.test(w)));
  const denied={org:ORG,BUCKET:bucket([key('topaz')],{listFails:true})};
  assert.deepEqual(await keyPresence(denied),{openai:false,google:false,higgsfield:false,topaz:true});
  assert.deepEqual(denied.BUCKET.calls,{list:1,head:4});
  assert.deepEqual(await keyPresence({org:ORG}),{openai:false,google:false,higgsfield:false,topaz:false},'no storage: none');
 }finally{console.warn=warn}
});

test('the meter reads its two statements together once the period start is known; a moved period is read again',async()=>{
 const {db}=company();
 // Records when each statement starts and ends, to see what overlaps.
 const events=[];
 const watched={...db,prepare:text=>{const s=db.prepare(text),kind=/credits_balance/.test(text)?'balance':/studio_usage/.test(text)?'packs':'other';
  const wrap=st=>({bind:(...v)=>wrap(st.bind(...v)),first:async c=>{events.push('start '+kind);await new Promise(r=>setTimeout(r,5));const out=await st.first(c);events.push('end '+kind);return out}});return wrap(s)}};
 const store=new CreditStore(watched);
 const now=Date.parse('2026-11-14T10:00:00Z');
 const first=await store.meter(ORG,now);
 assert.deepEqual(events,['start balance','end balance','start packs','end packs'],'the first time: the period start comes from the balance');
 events.length=0;
 const second=await store.meter(ORG,now);
 assert.deepEqual(events.slice(0,2).sort(),['start balance','start packs'],'then both start together (one round trip)');
 assert.equal(events.length,4,'and nothing more');
 assert.deepEqual(second,first);
 // The period moved (another billing day): the packs are read again for the new start.
 db.ledger.allowance(ORG,100,'2026-10-20');events.length=0;
 const moved=await store.meter(ORG,now);
 assert.equal(moved.periodFrom,'2026-10-20');
 assert.equal(events.filter(e=>e==='start packs').length,2,'read again with the new start');
});

test('the notices\' room: remembered per width, only as a number, and read back only for the same width',()=>{
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 assert.equal(readNoticeSpace(1440,store),null,'nothing known: the page waits for its notices');
 rememberNoticeSpace(1440,52.4,store);
 assert.equal(data.get(NOTICE_SPACE_KEY),'{"w":1440,"h":52}');
 assert.equal(readNoticeSpace(1440,store),52);
 assert.equal(readNoticeSpace(390,store),null,'another width wraps differently: not used');
 rememberNoticeSpace(390,0,store);assert.equal(readNoticeSpace(390,store),0,'no notices is a known room too');
 rememberNoticeSpace(1440,64,store,'ds');
 assert.equal(readNoticeSpace(1440,store,'ds'),64);assert.equal(readNoticeSpace(1440,store,'plain'),null,'the older screens\' notices look different: kept apart');assert.equal(readNoticeSpace(390,store),0);
 for(const bad of ['nonsense','{"w":390}','{"w":390,"h":-5}','{"w":390,"h":99999}'])assert.equal(readNoticeSpace(390,{getItem:()=>bad}),null,bad);
 assert.equal(readNoticeSpace(390,{getItem:()=>{throw new Error('blocked')}}),null,'storage off');
 rememberNoticeSpace(390,40,{getItem:()=>null,setItem:()=>{throw new Error('full')}});
 assert.equal(readNoticeSpace(390,null),null);
 assert.deepEqual(noticeSpace(51.6),{height:52});
});

test('a brand with no logo (204) shows its name alone, from then on in this session',()=>{
 forgetLogoMisses();
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const brand={id:'demo',name:'Demo Motors'};
 assert.equal(logoSrc('demo motors'),'/api/brands/demo%20motors/logo');
 assert.equal(logoView(brand,false,store),'logo','first, the logo is asked for');
 assert.equal(logoView(brand,true,store),'name','the image failed (a 204 has no picture): the name alone');
 assert.equal(logoView(null,false,store),'name','no brand (Nmesis\'s own workspace): the name alone');
 logoMissing('demo',store);
 assert.deepEqual(JSON.parse(data.get(LOGO_MISSING_KEY)),['demo']);
 assert.equal(logoView(brand,false,store),'name','remembered: no plate is drawn and then taken away');
 forgetLogoMisses();
 assert.equal(logoView(brand,false,store),'name','the next page of the session knows it too');
 assert.equal(logoView({id:'other',name:'Other'},false,store),'logo');
 forgetLogoMisses();
});

test('Server-Timing: fixed names and durations only, a total, and measured even when a part fails',async()=>{
 let t=0;const timing=serverTiming(()=>t);
 await timing.time('auth',async()=>{t+=12.34});
 await assert.rejects(timing.time('account',async()=>{t+=3;throw new Error('down')}));
 timing.add('Not A Name',5);timing.add('db',Number.NaN);
 t+=1;
 assert.equal(timing.header(),'auth;dur=12.3, account;dur=3.0, total;dur=16.3');
 const r=timed(Response.json({ok:true}),timing);
 assert.equal(r.headers.get('Server-Timing'),'auth;dur=12.3, account;dur=3.0, total;dur=16.3');
 assert.equal(timed(Response.json({}),undefined).headers.get('Server-Timing'),null);
});
