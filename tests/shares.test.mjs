// Share (lib/shares.ts, migration 0011): access per piece of work and the public
// view link, against the Studio's real route handlers and the public page.
// Stand-ins replace only: the verified session and company list
// (tests/support/stub-context.mjs, the real resolveContext), Postgres (SQLite
// built from the migrations; the public lookup, a SECURITY DEFINER function in
// Postgres, by the same query here), the team store (tests/support/stub-team.mjs)
// and S3 (the local stand-in from scripts/verify). tests/postgres.test.mjs runs
// the tables and studio.public_share under row level security.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {studioSchemaSql} from './sqlite-schema.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 '@/lib/accounts/team-store':new URL('./support/stub-team.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
 // Next's own notFound() (its CommonJS entry; Node's ES loader cannot name 'next/navigation' without the extension).
 'next/navigation':'data:text/javascript,'+encodeURIComponent(`import {createRequire} from 'node:module';export const notFound=createRequire(${JSON.stringify(new URL('../package.json',import.meta.url).href)})('next/navigation').notFound;`),
}}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0x81),ORG_B=id(0x82);
const A1={id:id(0x811),email:'owner@example.test'},A2={id:id(0x812),email:'creator@example.test'},A3={id:id(0x813),email:'viewer@example.test'},A4={id:id(0x814),email:'second.creator@example.test'};
const B1={id:id(0x821),email:'b.owner@example.test'},T={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const prefix=(org,user)=>`orgs/${org}/users/${user.id}/`;
const pA1=prefix(ORG_A,A1),pA2=prefix(ORG_A,A2),pB1=prefix(ORG_B,B1);
const ORIGIN='http://studio.test',DAY=86_400_000;
const flags=['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'];
const FULL={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'8k',...Object.fromEntries(flags.map(k=>[k,true]))}};
const SHARES='app/api/shares/[kind]/[id]/route.ts',LINK='app/api/shares/[kind]/[id]/link/route.ts',LIBRARY='app/api/library/route.ts',VISUAL='app/api/visuals/[id]/route.ts',ASSET='app/api/assets/[id]/route.ts';
let s3,store,shares,View,routes={};const realFetch=globalThis.fetch;
// studio.public_share (0011) on SQLite: the same conditions as the function.
const EMULATED="SELECT s.org_id,s.item_kind,s.item_id,li.owner,li.title,li.asset_id,s.expires_at FROM share_links s JOIN library_items li ON li.environment=s.environment AND li.org_id=s.org_id AND li.kind=s.item_kind AND li.id=s.item_id WHERE s.token_hash=? AND s.environment=? AND s.revoked_at IS NULL AND s.expires_at>? AND li.deleted_at IS NULL AND li.status='ready' LIMIT 1";
before(async()=>{
 s3=await startS3();
 // The SQLite rows are written as 'production' (the column default), so this process is Production.
 Object.assign(process.env,{VERCEL_ENV:'production',S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('No calls outside the Studio in this test.')};
 state.db=sqliteDatabase();
 const prepare=state.db.prepare;
 state.db.prepare=text=>text===shares?.PUBLIC_SHARE_SQL?{bind:(hash,env)=>prepare(EMULATED).bind(hash,env,Date.now())}:prepare(text);
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Demo Company',kind:'client'},{id:ORG_B,name:'Other Company',kind:'client'}],
  members:[{userId:A1.id,orgId:ORG_A,role:'owner',status:'active'},{userId:A2.id,orgId:ORG_A,role:'creator',status:'active'},{userId:A3.id,orgId:ORG_A,role:'viewer',status:'active'},{userId:A4.id,orgId:ORG_A,role:'creator',status:'active'},{userId:B1.id,orgId:ORG_B,role:'owner',status:'active'}],
  staff:{[T.id]:'ops'},entitlements:{[ORG_A]:FULL,[ORG_B]:FULL},grants:{[ORG_A]:Date.now()+DAY},
 });
 const {memoryTeam}=await import('./support/stub-team.mjs');
 state.team=memoryTeam({members:[A1,A2,A3,A4].map((u,i)=>({orgId:ORG_A,userId:u.id,email:u.email,role:['owner','creator','viewer','creator'][i],status:'active'})).concat([{orgId:ORG_B,userId:B1.id,email:B1.email,role:'owner',status:'active'}])});
 for(const f of [SHARES,LINK,LIBRARY,VISUAL,ASSET])routes[f]=await import('@/'+f);
 shares=await import('@/lib/shares.ts');
 View=(await import('@/app/view/[token]/page.tsx')).default;
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 const png=Buffer.alloc(64);png.set([137,80,78,71,13,10,26,10]);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
 const img={httpMetadata:{contentType:'image/png'}},meta={httpMetadata:{contentType:'application/json'}},now=new Date().toISOString();
 const visual=(vid,title)=>JSON.stringify({id:vid,title,src:'/api/assets/'+vid,status:'ready',createdAt:now,provider:'openai',sourceId:vid,moodId:vid});
 for(const [p,vid,title] of [[pA2,'avisual-002','Demo SUV at dusk'],[pA1,'avisual-001','Demo Saloon'],[pB1,'bvisual-001','B visual']]){await store.put(p+'images/'+vid,png,img);await store.put(p+'visuals/'+vid+'.json',visual(vid,title),meta)}
 const row=state.db.raw.prepare('INSERT INTO library_items(org_id,kind,id,owner,title,tool,car,status,thumb_key,asset_id,width,height,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)');
 row.run(ORG_A,'visual','avisual-002',pA2,'Demo SUV at dusk','Key visual','Demo SUV','ready',pA2+'thumbs/avisual-002.webp','avisual-002',1920,1080,2,2);
 row.run(ORG_A,'visual','avisual-001',pA1,'Demo Saloon','Key visual','Demo Saloon','ready',null,'avisual-001',1920,1080,1,1);
 row.run(ORG_A,'visual','avisual-003',pA2,'Demo Hatch draft','Key visual',null,'working',null,null,null,null,3,3);
 row.run(ORG_B,'visual','bvisual-001',pB1,'B visual','Key visual',null,'ready',null,'bvisual-001',1920,1080,1,1);
 state.db.raw.prepare('INSERT INTO library_backfills(org_id,started_at,done_at) VALUES(?,1,2),(?,1,2)').run(ORG_A,ORG_B);
 state.db.raw.prepare("INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES('folder-launch',?,NULL,'Launch',?,1,1)").run(ORG_A,pA1);
 state.db.raw.prepare("INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,'visual','avisual-002','folder-launch',1)").run(ORG_A);
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});
function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg}
async function call(method,path,file,{body,params}={}){
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+path,{method,headers,redirect:'manual',...body!==undefined?{body:JSON.stringify(body)}:{}}),params?{params:Promise.resolve(params)}:undefined);
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,location:response.headers.get('location')};
}
const share=(method,vid,body,kind='visual')=>call(method,`/api/shares/${kind}/${vid}`,SHARES,{params:{kind,id:vid},body});
const link=(method,vid,body,kind='visual')=>call(method,`/api/shares/${kind}/${vid}/link`,LINK,{params:{kind,id:vid},body});
const library=()=>call('GET','/api/library',LIBRARY);
const tokenOf=url=>new URL(url).pathname.split('/').pop();
const tableRows=()=>state.db.raw.prepare('SELECT * FROM share_links').all();
// The parts of a React element tree, depth first.
function* walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const n of node)yield* walk(n);return}yield node;yield* walk(node.props?.children)}
async function page(token){
 try{const el=await View({params:Promise.resolve({token})});const img=[...walk(el)].find(n=>n.type==='img');return {status:200,img:img?.props,text:JSON.stringify(el)}}
 catch(e){if(String(e?.digest||'').includes('404'))return {status:404};throw e}
}

test('tokens: 32 random bytes as base64url; only their SHA-256 is ever stored',()=>{
 const a=shares.newToken(),b=shares.newToken();
 assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
 assert.equal(Buffer.from(a,'base64url').length,32);
 assert.match(a,shares.TOKEN_SHAPE,'proxy.ts and the page accept it');
 assert.equal(shares.hashToken(a),createHash('sha256').update(a).digest('hex'));
 assert.match(shares.hashToken(a),/^[0-9a-f]{64}$/);
});

test('expiry and turning off: a link is on until it expires or is revoked',()=>{
 const now=1_800_000_000_000;
 assert.equal(shares.linkState(null,now),'off');
 assert.equal(shares.linkState({expires_at:now+1,revoked_at:null},now),'on');
 assert.equal(shares.linkState({expires_at:now,revoked_at:null},now),'expired');
 assert.equal(shares.linkState({expires_at:now+DAY,revoked_at:now-1},now),'off');
 assert.equal(shares.cleanDays(undefined),7,'7 days by default');
 for(const d of [1,7,30])assert.equal(shares.cleanDays(d),d);
 for(const d of [0,2,31,'7',-1,7.5])assert.throws(()=>shares.cleanDays(d),/1, 7 or 30 days/);
 assert.throws(()=>shares.cleanAccess('public'),/Only me, Company can view or Company can edit/);
});

test('access: the creator or a company owner changes it; a viewer and another creator get 403; another company gets 404',async()=>{
 as(A2);let r=await share('GET','avisual-002');
 assert.equal(r.status,200,r.text);
 assert.equal(r.body.access,'view','Company can view when nothing is stored');
 assert.equal(r.body.canManage,true);assert.equal(r.body.mine,true);assert.equal(r.body.link,null);
 r=await share('PUT','avisual-002',{access:'edit'});assert.equal(r.status,200,r.text);assert.equal(r.body.access,'edit');
 as(A1);r=await share('PUT','avisual-002',{access:'view'});assert.equal(r.status,200,'a company owner may change it');assert.equal(r.body.access,'view');assert.equal(r.body.mine,false);
 as(A3);r=await share('PUT','avisual-002',{access:'private'});assert.equal(r.status,403,'a viewer');
 r=await share('GET','avisual-002');assert.equal(r.status,200);assert.equal(r.body.canManage,false);
 as(A4);r=await share('PUT','avisual-002',{access:'private'});assert.equal(r.status,403,'another creator');assert.match(r.body.error,/Only the person who made this, or an owner/);
 r=await link('POST','avisual-002',{days:7});assert.equal(r.status,403,'another creator makes no link');
 as(A3);r=await link('POST','avisual-002',{days:7});assert.equal(r.status,403,'a viewer makes no link');
 as(T,ORG_A);r=await share('GET','avisual-002');assert.equal(r.status,200);assert.equal(r.body.canManage,false,'staff viewing with support access look only');
 r=await share('PUT','avisual-002',{access:'private'});assert.equal(r.status,403);
 as(B1);
 for(const res of [await share('GET','avisual-002'),await share('PUT','avisual-002',{access:'private'}),await link('POST','avisual-002',{days:7}),await link('DELETE','avisual-002')]){assert.equal(res.status,404,res.text);assert.ok(!res.text.includes('Demo SUV'))}
 as(A1);r=await share('GET','bvisual-001');assert.equal(r.status,404);assert.ok(!r.text.includes('B visual'));
 r=await share('GET','not-a-real-id');assert.equal(r.status,404);
 as(A2);r=await share('PUT','avisual-002',{access:'everyone'});assert.equal(r.status,400);
 r=await share('GET','avisual-002');assert.equal(r.body.access,'view','unchanged by the refused requests');
});

test('people with access: owners see every address; others see the owners and themselves, and the rest as a count',async()=>{
 as(A1);let r=await share('GET','avisual-002');
 assert.deepEqual(r.body.people.map(p=>[p.label,p.maker,p.canView,p.canEdit]),[[A2.email,true,true,true],[A1.email,false,true,false],[A4.email,false,true,false],[A3.email,false,true,false]]);
 assert.equal(r.body.people.find(p=>p.you).label,A1.email);
 as(A3);r=await share('GET','avisual-002');
 for(const hidden of [A2.email,A4.email])assert.ok(!r.text.includes(hidden),'a viewer does not see a teammate’s address');
 assert.deepEqual(r.body.people.map(p=>[p.label,p.maker,p.you]),[['The person who made it',true,false],[A3.email,false,true],[A1.email,false,false],['1 other person in your company',false,false]]);
 as(A2);await share('PUT','avisual-002',{access:'edit'});
 as(A1);r=await share('GET','avisual-002');
 assert.deepEqual(r.body.people.map(p=>[p.label,p.canEdit]),[[A2.email,true],[A1.email,true],[A4.email,true],[A3.email,false]],'Company can edit: owners and creators, never viewers');
 as(A2);r=await share('PUT','avisual-002',{access:'view'});assert.equal(r.status,200);
});

test('Only me: left out of the library, its folder and its count for everyone but its creator; its picture answers 404',async()=>{
 as(A4);let before=await library();assert.equal(before.status,200,before.text);
 assert.ok(before.body.items.some(i=>i.id==='avisual-002'));
 const launch=before.body.folders.find(f=>f.id==='folder-launch');assert.equal(launch.count,1);assert.equal(launch.covers.length,1);
 as(A2);let r=await share('PUT','avisual-002',{access:'private'});assert.equal(r.status,200,r.text);
 for(const who of [A4,A1,A3]){
  as(who);const after=await library();assert.equal(after.status,200);
  assert.ok(!after.text.includes('avisual-002')&&!after.text.includes('Demo SUV at dusk'),'hidden from '+who.email);
  assert.equal(after.body.counts.all,before.body.counts.all-1);
  const f=after.body.folders.find(x=>x.id==='folder-launch');assert.equal(f.count,0);assert.deepEqual(f.covers,[],'no cover of it either');
  assert.ok(!after.body.cars.includes('Demo SUV'),'nor its car');
  assert.equal((await call('GET','/api/visuals/avisual-002',VISUAL,{params:{id:'avisual-002'}})).status,404);
  const asset=await call('GET','/api/assets/avisual-002',ASSET,{params:{id:'avisual-002'}});assert.equal(asset.status,404);assert.equal(asset.location,null,'no signed link');
  assert.equal((await call('GET','/api/assets/avisual-002?thumb=1',ASSET,{params:{id:'avisual-002'}})).location,null);
  assert.equal((await call('GET','/api/assets/avisual-001',ASSET,{params:{id:'avisual-001'}})).status,307,'other work opens as before');
 }
 as(A4);r=await share('GET','avisual-002');assert.equal(r.status,404,'another creator: as if it were not there');
 as(A1);r=await share('GET','avisual-002');assert.equal(r.status,200,'an owner may still change who sees it');assert.equal(r.body.canManage,true);
 for(const who of [[A2,null],[T,ORG_A]]){
  as(...who);const mine=await library();assert.ok(mine.body.items.some(i=>i.id==='avisual-002'),'the creator and staff viewing with support access still see it');
  assert.equal((await call('GET','/api/visuals/avisual-002',VISUAL,{params:{id:'avisual-002'}})).status,200);
  assert.equal((await call('GET','/api/assets/avisual-002',ASSET,{params:{id:'avisual-002'}})).status,307);
 }
 as(A2);r=await share('PUT','avisual-002',{access:'view'});assert.equal(r.status,200);
 as(A4);assert.ok((await library()).body.items.some(i=>i.id==='avisual-002'),'back for everyone');
});

test('public link: made by the creator, the address shown once, the page works until it is turned off, replaced or expired',async()=>{
 as(A2);let r=await link('POST','avisual-002',{days:30});
 assert.equal(r.status,200,r.text);
 assert.match(r.body.url,/^http:\/\/studio\.test\/view\/[A-Za-z0-9_-]{43}$/);
 assert.ok(Math.abs(r.body.expiresAt-(Date.now()+30*DAY))<60_000);
 const token=tokenOf(r.body.url);
 const rows=tableRows();assert.equal(rows.length,1);
 assert.equal(rows[0].token_hash,shares.hashToken(token));
 assert.ok(!JSON.stringify(rows).includes(token),'the token itself is never stored');
 assert.ok(!(await share('GET','avisual-002')).text.includes(token),'nor shown again');
 as(A4);r=await share('GET','avisual-002');assert.deepEqual(r.body.link,{on:true,expiresAt:rows[0].expires_at},'everyone in the company sees that it is on');

 state.user=null;// The page: no sign-in.
 let p=await page(token);assert.equal(p.status,200);
 assert.match(p.img.src,new RegExp('^'+s3.url+'/studio-test/'+pA2.replace(/\//g,'\\/')+'images/avisual-002\\?.*X-Amz-Signature'));
 assert.equal(p.img.alt,'Demo SUV at dusk');assert.equal(p.img.referrerPolicy,'no-referrer');
 assert.ok(p.text.includes('Shared from Nmesis Studio'));
 // Beyond the signed picture address (whose storage key carries the ids, as every signed link does): nothing about the company or the person.
 const words=p.text.split(p.img.src).join('');
 for(const x of [ORG_A,A2.id,A2.email,'Demo Company','folder-launch'])assert.ok(!words.includes(x),'leaked '+x);
 assert.equal((await shares.publicShare(state.db,token,'preview')),null,'another environment’s link is not found');
 assert.equal((await page('x'.repeat(43))).status,404,'an unknown token');
 assert.equal((await page('short')).status,404,'a malformed token');

 // A new link replaces the old one.
 as(A2);r=await link('POST','avisual-002',{});assert.equal(r.status,200);assert.ok(Math.abs(r.body.expiresAt-(Date.now()+7*DAY))<60_000,'7 days by default');
 const second=tokenOf(r.body.url);state.user=null;
 assert.equal((await page(token)).status,404,'the replaced link stops');assert.equal((await page(second)).status,200);
 // Turned off.
 as(A1);r=await link('DELETE','avisual-002');assert.equal(r.status,200,'a company owner may turn it off');
 as(A2);assert.equal((await share('GET','avisual-002')).body.link,null);
 state.user=null;assert.equal((await page(second)).status,404,'turned off');
 // Expired.
 as(A2);r=await link('POST','avisual-002',{days:1});const third=tokenOf(r.body.url);
 state.db.raw.prepare('UPDATE share_links SET expires_at=? WHERE token_hash=?').run(Date.now()-1,shares.hashToken(third));
 state.user=null;assert.equal((await page(third)).status,404,'expired');
 as(A2);assert.deepEqual((await share('GET','avisual-002')).body.link?.on,false,'shown as expired');
 // Deleted work: its link stops too.
 r=await link('POST','avisual-002',{days:7});const fourth=tokenOf(r.body.url);
 state.db.raw.prepare("UPDATE library_items SET deleted_at=5 WHERE id='avisual-002'").run();
 state.user=null;assert.equal((await page(fourth)).status,404,'deleted work');
 state.db.raw.prepare("UPDATE library_items SET deleted_at=NULL WHERE id='avisual-002'").run();
 as(A2);await link('DELETE','avisual-002');
 // Refused links.
 assert.equal((await link('POST','avisual-002',{days:3})).status,400,'only 1, 7 or 30 days');
 assert.equal((await link('POST','avisual-003',{days:7})).status,409,'unfinished work');
 assert.equal((await link('POST','avisual-001',{days:7})).status,403,'someone else’s work, as a creator');
});

test('the page checks the database’s answer again and fails closed',async()=>{
 const token=shares.newToken(),good={org_id:ORG_A,item_kind:'visual',item_id:'avisual-002',owner:pA2,title:'Demo SUV at dusk',asset_id:'avisual-002',expires_at:Date.now()+DAY};
 const db=row=>({prepare:sql=>{assert.equal(sql,shares.PUBLIC_SHARE_SQL);return {bind:(hash,env)=>{assert.equal(hash,shares.hashToken(token),'looked up by its hash');assert.equal(env,'production');return {first:async()=>row}}}}});
 assert.ok(await shares.publicShare(db(good),token,'production'));
 assert.equal(await shares.publicShare(db({...good,expires_at:Date.now()-1}),token,'production'),null,'expired');
 assert.equal(await shares.publicShare(db({...good,owner:pB1}),token,'production'),null,'an owner of another company');
 assert.equal(await shares.publicShare(db({...good,owner:'orgs/../'}),token,'production'),null,'not a member prefix');
 assert.equal(await shares.publicShare(db({...good,asset_id:'../x'}),token,'production'),null);
 assert.equal(await shares.publicShare(db(null),token,'production'),null);
 assert.equal(await shares.publicShare(undefined,token,'production'),null,'no database');
});

test('migration 0011: client tables with environment and forced row level security; one SECURITY DEFINER lookup with a fixed search_path',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/0011_shares.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
 for(const t of ['work_access','share_links']){
  assert.match(sql,new RegExp(`create table if not exists studio\\.${t} \\([^;]*environment text not null default 'production'`));
  assert.match(sql,new RegExp(`array\\['work_access', 'share_links'\\]`));
 }
 assert.match(sql,/alter table studio\.%I alter column environment set default studio\.request_env\(\)/);
 assert.match(sql,/alter table studio\.%I force row level security/);
 assert.match(sql,/create policy member_orgs on studio\.%I for all using \(environment = \(select studio\.request_env\(\)\)/);
 assert.match(sql,/primary key \(environment, item_kind, item_id\)/);
 assert.match(sql,/create unique index if not exists share_links_token_hash on studio\.share_links \(token_hash\)/);
 assert.match(sql,/check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
 assert.match(sql,/create or replace function studio\.public_share\(p_hash text, p_env text\)[\s\S]*?security definer\s+set search_path = ''/);
 assert.match(sql,/revoke all on function studio\.public_share\(text, text\) from public/);
 assert.match(sql,/grant execute on function studio\.public_share\(text, text\) to studio_app/);
 assert.match(sql,/s\.revoked_at is null[\s\S]*s\.expires_at > /);
 assert.doesNotMatch(sql,/\btoken text\b/,'no column holds a token');
 // The fast tests' SQLite schema has both tables and none of the Postgres-only parts.
 const schema=studioSchemaSql();
 assert.match(schema,/create table if not exists work_access/);assert.match(schema,/create table if not exists share_links/);
 assert.doesNotMatch(schema,/public_share|policy/i);
 const columns=state.db.raw.prepare("SELECT name FROM pragma_table_info('share_links')").all().map(c=>c.name);
 assert.deepEqual(columns.sort(),['created_at','created_by','environment','expires_at','id','item_id','item_kind','org_id','revoked_at','token_hash']);
});
