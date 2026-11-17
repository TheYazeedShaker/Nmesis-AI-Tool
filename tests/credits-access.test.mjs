// Route-level checks for S3, against the Studio's real route handlers: plans and
// credits per company (V7), own keys (V5), opt-in support access (V8), the Usage
// page and the credits overview (no provider costs, V3 banner). Stand-ins replace
// only the verified session and company list (tests/support/stub-context.mjs,
// which runs the real resolveContext), Postgres (SQLite with the credits ledger
// stand-in) and S3 (the local stand-in). Every provider call is answered here.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_S=id(0x51),ORG_G=id(0x52),ORG_E=id(0x53),ORG_X=id(0x54),ORG_N=id(0x1);
const S1={id:id(0x511),email:'starter@example.test'},G1={id:id(0x521),email:'growth.owner@example.test'},G2={id:id(0x522),email:'growth.creator@example.test'};
const E1={id:id(0x531),email:'enterprise@example.test'},X1={id:id(0x541),email:'noplan@example.test'};
const T={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const ORIGIN='http://studio.test';
// The three plans as the admin seeds them (Starter, Growth, Enterprise), with their allowances.
const flags=on=>Object.fromEntries(['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'].map(k=>[k,on.includes(k)]));
const plan=(planId,planName,maxOutput,on,monthly)=>({e:{legacy:false,status:'active',planId,planName,endsOn:null,features:{'studio.enabled':true,'studio.max_output':maxOutput,'studio.credits_monthly':monthly,...flags(on)}},monthly});
const STARTER=plan('starter','Starter','2k',['studio.key_visuals'],300);
const GROWTH=plan('growth','Growth','4k',['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale'],1500);
const ENTERPRISE=plan('enterprise','Enterprise','8k',['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'],5000);
const legacy={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
let s3,store,routes={},providerCalls=[];const realFetch=globalThis.fetch;
const png=(()=>{const b=Buffer.alloc(64);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(1920,16);b.writeUInt32BE(1080,20);return b})();
before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32),OPENAI_API_KEY:'nmesis-openai-test-key'});
 // OpenAI answers every image edit with a small PNG; anything else is a test failure.
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);providerCalls.push({url:u,auth:init?.headers?.Authorization||init?.headers?.authorization});if(u==='https://api.openai.com/v1/images/edits')return Response.json({data:[{b64_json:png.toString('base64')}]});throw new Error('Unexpected provider call '+u)};
 state.db=sqliteDatabase();
 for(const [org,p] of [[ORG_S,STARTER],[ORG_G,GROWTH],[ORG_E,ENTERPRISE]])state.db.ledger.allowance(org,p.monthly,new Date().toISOString().slice(0,10));
 state.db.ledger.person(ORG_G,G1.id,'owner',G1.email);state.db.ledger.person(ORG_G,G2.id,'creator',G2.email);
 state.directory=memoryDirectory({
  orgs:[{id:ORG_S,name:'Starter Co',kind:'client'},{id:ORG_G,name:'Growth Co',kind:'client'},{id:ORG_E,name:'Enterprise Co',kind:'client'},{id:ORG_X,name:'No Plan Co',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:S1.id,orgId:ORG_S,role:'owner',status:'active'},{userId:G1.id,orgId:ORG_G,role:'owner',status:'active'},{userId:G2.id,orgId:ORG_G,role:'creator',status:'active'},{userId:E1.id,orgId:ORG_E,role:'owner',status:'active'},{userId:X1.id,orgId:ORG_X,role:'owner',status:'active'}],
  staff:{[T.id]:'ops'},
  entitlements:{[ORG_S]:STARTER.e,[ORG_G]:GROWTH.e,[ORG_E]:ENTERPRISE.e,[ORG_X]:legacy,[ORG_N]:legacy},
 });
 for(const p of ['app/api/me/route.ts','app/api/credits/route.ts','app/api/usage/route.ts','app/api/company/support/route.ts','app/api/generate/route.ts','app/api/films/route.ts','app/api/connection/route.ts','app/api/status/route.ts','app/api/visuals/route.ts','app/api/auth/org/route.ts','app/auth/open/route.ts'])routes[p]=await import('@/'+p);
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 for(const [org,user] of [[ORG_S,S1],[ORG_G,G2],[ORG_E,E1],[ORG_X,X1]])for(const vid of ['car-000001','mood-000001'])await store.put(`orgs/${org}/users/${user.id}/images/${vid}`,png,{httpMetadata:{contentType:'image/png'}});
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});
function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg}
async function call(method,path,file,{body}={}){
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+path,{method,headers,redirect:'manual',...body!==undefined?{body:JSON.stringify(body)}:{}}));
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,location:response.headers.get('location')};
}
const generate=(n,extra={})=>call('POST','/api/generate','app/api/generate/route.ts',{body:{id:'visual-'+String(n).padStart(6,'0'),sourceId:'car-000001',moodId:'mood-000001',brief:'A premium key visual of the car at dusk',size:'2048x1152',...extra}});
const NO_COST=/\$|usd|provider_cost|credit_basis|costMicros|cost_micros|0\.04/i;

test('V7: Starter, Growth and Enterprise see only their tools, their own-key rule and their allowance; no plan sees the notice',async()=>{
 const seen={};
 for(const [user,p] of [[S1,STARTER],[G1,GROWTH],[E1,ENTERPRISE]]){
  as(user);
  const me=await call('GET','/api/me','app/api/me/route.ts');assert.equal(me.status,200);assert.equal(me.body.workspace.open,true);
  const on=Object.entries(me.body.features).filter(([,v])=>v).map(([k])=>k).sort();
  assert.deepEqual(on,Object.entries(p.e.features).filter(([k,v])=>k!=='studio.enabled'&&v===true).map(([k])=>k).sort(),p.e.planName+': only its tools');
  const credits=await call('GET','/api/credits','app/api/credits/route.ts');assert.equal(credits.status,200);
  assert.equal(credits.body.meter.left,p.monthly,p.e.planName+': its allowance');assert.equal(credits.body.unlimited,false);
  assert.doesNotMatch(credits.text,NO_COST,'credits only');
  seen[p.e.planName]={tools:on.length,ownKeys:me.body.features['studio.own_keys'],allowance:credits.body.meter.left,billing:credits.body.billing.openai};
  // Own keys: only Enterprise may save one.
  const key=await call('POST','/api/connection','app/api/connection/route.ts',{body:{key:'sk-'+'a'.repeat(40)}});
  if(p===ENTERPRISE)assert.notEqual(key.status,403,'Enterprise may connect its own key');
  else{assert.equal(key.status,403);assert.match(key.body.error,/not on your company's plan/)}
 }
 console.log('# V7',JSON.stringify(seen));
 // A Starter company cannot call a Growth tool even with the UI bypassed.
 as(S1);const film=await call('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'car-000001'}});assert.equal(film.status,403);assert.match(film.body.error,/Film Studio is not on your company's plan/);
 // A client with no active subscription: the Studio is off, with the plain notice.
 providerCalls.length=0;as(X1);
 const me=await call('GET','/api/me','app/api/me/route.ts');assert.equal(me.status,200);assert.equal(me.body.workspace.open,false);assert.equal(me.body.workspace.noPlan,true);assert.equal(me.body.plan.none,true);
 assert.ok(Object.values(me.body.features).every(v=>v===false),'every tool off, whatever the admin\'s "legacy" says');
 const g=await generate(1);assert.equal(g.status,403);assert.equal(g.body.error,'Your Studio isn’t part of your plan yet. Ask Nmesis.');
 const lib=await call('GET','/api/visuals','app/api/visuals/route.ts');assert.equal(lib.status,200,'the library stays viewable');
 assert.equal(providerCalls.length,0);
 // Nmesis's own workspace is exempt.
 as(T,ORG_N);const n=await call('GET','/api/me','app/api/me/route.ts');assert.equal(n.body.workspace.open,true);assert.equal(n.body.internal,true);
 const nc=await call('GET','/api/credits','app/api/credits/route.ts');assert.equal(nc.body.unlimited,true);assert.equal(nc.body.meter,null);
});

test('V7/V5: a Growth creator generates on Nmesis\'s key; the cost shows first, the result shows its credits, the ledger records the person',async()=>{
 as(G2);providerCalls.length=0;
 const before=await call('GET','/api/credits','app/api/credits/route.ts');
 const price=before.body.prices['openai.image.2k'];assert.equal(price,8,'shown before it starts');assert.equal(before.body.billing.openai,'credits');
 const r=await generate(2);assert.equal(r.status,200,r.text);assert.equal(r.body.visual.status,'ready');assert.equal(r.body.visual.credits,price,'the result shows what it used');
 assert.equal(providerCalls.length,1);assert.equal(providerCalls[0].auth,'Bearer nmesis-openai-test-key','Nmesis\'s key made the call');
 const rows=state.db.ledger.rows(ORG_G);assert.equal(rows.length,1);assert.deepEqual({actor:rows[0].actor,feature:rows[0].feature_key,credits:rows[0].credits,provider:rows[0].provider},{actor:G2.id,feature:'studio.key_visuals',credits:-8,provider:'openai'});
 const after=await call('GET','/api/credits','app/api/credits/route.ts');assert.equal(after.body.meter.used,8);assert.equal(after.body.meter.left,GROWTH.monthly-8);
 // Usage is for owners: the creator is refused, the owner sees credits by person and tool, never a provider cost.
 const refused=await call('GET','/api/usage','app/api/usage/route.ts');assert.equal(refused.status,403);
 as(G1);const u=await call('GET','/api/usage','app/api/usage/route.ts');assert.equal(u.status,200,u.text);
 assert.deepEqual(u.body.byPerson,[{who:G2.email,credits:8,actions:1}]);assert.deepEqual(u.body.byTool,[{tool:'Key visuals',credits:8,actions:1}]);
 assert.equal(u.body.recent.length,1);assert.deepEqual({what:u.body.recent[0].action,who:u.body.recent[0].who,credits:u.body.recent[0].credits},{what:'Key visual',who:G2.email,credits:8});
 assert.doesNotMatch(u.text,NO_COST,'no provider costs on the Usage page');assert.doesNotMatch(u.text,/openai|higgsfield|topaz|google/i,'no provider names either');
});

test('V3 (routes): at 100% generation stops with the plain sentence and the banner level is 100',async()=>{
 as(S1);providerCalls.length=0;
 // Starter: 300 credits; a 4K OpenAI image is not on Starter (2K max), so 2K at 8 credits: 37 fit, the 38th does not.
 const spent=[];for(let i=0;i<38;i++){const r=await generate(100+i);spent.push(r.status)}
 assert.deepEqual([spent.filter(s=>s===200).length,spent.at(-1)],[37,402]);
 const last=await generate(200);assert.equal(last.status,402);assert.equal(last.body.error,'This needs 8 credits and your company has 4 left this month. Ask Nmesis to add a pack.');
 const c=await call('GET','/api/credits','app/api/credits/route.ts');assert.equal(c.body.meter.left,4);assert.equal(c.body.meter.level,80);
 state.db.ledger.pack(ORG_S,4,'2099-12-31');
 const fits=await generate(201);assert.equal(fits.status,200,'a pack is used after the allowance');
 const out=await generate(202);assert.equal(out.body.error,'Your credits for this month are used. Ask Nmesis to add a pack.');
 assert.equal((await call('GET','/api/credits','app/api/credits/route.ts')).body.meter.level,100);
 assert.equal(providerCalls.length,38,'refused actions never reach the provider');
});

test('V8: support access: no grant → staff cannot list or open the client; an expired grant is refused; a grant is read-only; the owner sees the log',async()=>{
 const open=async org=>{state.cookies=new Map();return call('GET','/auth/open?org='+org,'app/auth/open/route.ts')};
 // No grant.
 as(T,ORG_G);let me=await call('GET','/api/me?page=/','app/api/me/route.ts');
 assert.equal(me.body.org.id,ORG_N,'not opened');assert.deepEqual(me.body.switcher.clients,[],'not listed');
 assert.equal((await open(ORG_G)).location,ORIGIN+'/?opened=support','"Support access not granted"');
 as(T,null);let sw=await call('POST','/api/auth/org','app/api/auth/org/route.ts',{body:{orgId:ORG_G}});assert.equal(sw.status,403);assert.match(sw.body.error,/Support access not granted/);
 // Only the client's owner grants it: a creator cannot, staff cannot.
 as(G2);assert.equal((await call('POST','/api/company/support','app/api/company/support/route.ts',{body:{}})).status,403);
 as(G1);const granted=await call('POST','/api/company/support','app/api/company/support/route.ts',{body:{note:'Please check the line-up'}});
 assert.equal(granted.status,200,granted.text);assert.equal(granted.body.active,true);assert.equal(granted.body.grant.note,'Please check the line-up');
 const days=(Date.parse(granted.body.grant.until)-Date.now())/86_400_000;assert.ok(days>6.99&&days<=7,'for 7 days');
 // Mirror of studio.support_grants for the stand-in directory (the real one reads that table).
 const row=state.db.raw.prepare('SELECT until FROM support_grants WHERE org_id=?').get(ORG_G);state.directory.grants[ORG_G]=row.until;
 // Granted: listed, opened read-only, logged.
 as(T,ORG_G);me=await call('GET','/api/me?page=/usage','app/api/me/route.ts');
 assert.equal(me.body.org.id,ORG_G);assert.equal(me.body.viewingAs,true);assert.equal(me.body.role,'viewer');assert.deepEqual(me.body.switcher.clients.map(c=>c.name),['Growth Co']);
 const write=await generate(300);assert.equal(write.status,403);assert.match(write.body.error,/Your role is viewer/);
 const usage=await call('GET','/api/usage','app/api/usage/route.ts');assert.equal(usage.status,200,'staff with access see Usage');
 assert.equal((await call('POST','/api/company/support','app/api/company/support/route.ts',{body:{}})).status,403,'staff cannot extend their own access');
 // The owner sees "Nmesis opened your workspace at …".
 as(G1);const log=await call('GET','/api/company/support','app/api/company/support/route.ts');
 assert.equal(log.body.log.length,1);assert.equal(log.body.log[0].page,'Usage','the page’s name, not its address');assert.equal(log.body.log[0].path,'/usage');assert.ok(Date.parse(log.body.log[0].at)>Date.now()-60_000);
 // Expired: refused again.
 state.directory.grants[ORG_G]=Date.now()-1;
 as(T,ORG_G);me=await call('GET','/api/me','app/api/me/route.ts');assert.equal(me.body.org.id,ORG_N,'an expired grant is refused');
 // The owner turns it off.
 as(G1);const off=await call('DELETE','/api/company/support','app/api/company/support/route.ts');assert.equal(off.body.active,false);
});

test('V5 (routes): Connections show "Nmesis provides the AI" without own keys; a stored key is ignored with a note the owner can see',async()=>{
 // Growth has no own keys but saved one earlier (when it was on Enterprise).
 await store.put(`orgs/${ORG_G}/keys/credentials/openai.json`,JSON.stringify({sealed:'from an earlier plan'}),{httpMetadata:{contentType:'application/json'}});
 as(G1);
 const status=await call('GET','/api/status','app/api/status/route.ts');assert.equal(status.body.ownKeys,false);assert.equal(status.body.personalKey,false,'the stored key is not used');assert.equal(status.body.nmesis,true);
 const check=await call('GET','/api/connection','app/api/connection/route.ts');assert.equal(check.body.notice,'Nmesis provides the AI for your plan.');
 const c=await call('GET','/api/credits','app/api/credits/route.ts');assert.match(c.body.ignoredKeys,/kept, not deleted/);
 as(G2);assert.equal((await call('GET','/api/credits','app/api/credits/route.ts')).body.ignoredKeys,null,'the note is for owners');
 assert.ok(await store.head(`orgs/${ORG_G}/keys/credentials/openai.json`),'still stored');
 providerCalls.length=0;const r=await generate(400);assert.equal(r.status,200);assert.equal(providerCalls[0].auth,'Bearer nmesis-openai-test-key','and Nmesis\'s key is used instead');
});
