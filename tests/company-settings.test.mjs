// Company settings and Usage (design finish pass), against the Studio's real
// route handlers. Stand-ins replace only: the verified session and company list
// (tests/support/stub-context.mjs, which runs the real resolveContext), Postgres
// (SQLite with the credits ledger stand-in), and the team store
// (tests/support/stub-team.mjs, the setup SQL section 7 rules in memory; the real
// functions run in tests/postgres.test.mjs). Also the pure parts: the date words,
// the support log's page names, the use-over-time buckets and the page titles.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 '@/lib/accounts/team-store':new URL('./support/stub-team.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0x61),ORG_B=id(0x62),ORG_N=id(0x1);
const A1={id:id(0x611),email:'owner@example.test'},A2={id:id(0x612),email:'creator@example.test'},A3={id:id(0x613),email:'viewer@example.test'},A4={id:id(0x614),email:'second.owner@example.test'};
const B1={id:id(0x621),email:'b.owner@example.test'},T={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const ORIGIN='http://studio.test';
const flags=['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'];
const GROWTH={legacy:false,status:'active',planId:'growth',planName:'Growth',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'4k','studio.credits_monthly':1500,'studio.seats':5,...Object.fromEntries(flags.map(k=>[k,!['studio.film','studio.swap','studio.storyboards','studio.own_keys'].includes(k)]))}};
const legacy={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
// Loaded after the hooks are registered (it imports the Studio's TypeScript).
let routes={},mail=[],alerts,memoryTeam;const files=['app/api/company/route.ts','app/api/company/team/route.ts','app/api/company/team/[id]/route.ts','app/api/company/notifications/route.ts','app/api/company/ask/route.ts','app/api/company/support/route.ts','app/api/me/route.ts','app/api/usage/route.ts'];
before(async()=>{
 process.env.NMESIS_ALERT_EMAIL='nmesis@example.test';
 state.db=sqliteDatabase();state.db.ledger.allowance(ORG_A,1500,new Date().toISOString().slice(0,10));
 for(const [u,role] of [[A1,'owner'],[A2,'creator'],[A3,'viewer']])state.db.ledger.person(ORG_A,u.id,role,u.email);
 state.db.ledger.person(ORG_B,B1.id,'owner',B1.email);
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Demo Company Ltd',kind:'client'},{id:ORG_B,name:'Other Company',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:A1.id,orgId:ORG_A,role:'owner',status:'active'},{userId:A2.id,orgId:ORG_A,role:'creator',status:'active'},{userId:A3.id,orgId:ORG_A,role:'viewer',status:'active'},{userId:B1.id,orgId:ORG_B,role:'owner',status:'active'}],
  staff:{[T.id]:'ops'},entitlements:{[ORG_A]:GROWTH,[ORG_B]:GROWTH,[ORG_N]:legacy},
  brands:{[ORG_A]:[{id:'demo',name:'Demo Brand'}]},grants:{[ORG_A]:Date.now()+86_400_000},
 });
 ({memoryTeam}=await import('./support/stub-team.mjs'));
 for(const f of files)routes[f]=await import('@/'+f);
 alerts=await import('@/lib/credits/alerts.ts');alerts.setMailer(async m=>{mail.push(m)});
});
after(()=>{alerts?.setMailer(null)});
const team=()=>memoryTeam({
 members:[{orgId:ORG_A,userId:A1.id,email:A1.email,role:'owner',status:'active'},{orgId:ORG_A,userId:A2.id,email:A2.email,role:'creator',status:'active'},{orgId:ORG_A,userId:A3.id,email:A3.email,role:'viewer',status:'active'},{orgId:ORG_B,userId:B1.id,email:B1.email,role:'owner',status:'active'}],
 accounts:{[A1.email]:A1.id,[A2.email]:A2.id,[A3.email]:A3.id,[B1.email]:B1.id,[A4.email]:A4.id},
 orgs:{[ORG_N]:'internal'},seats:{[ORG_A]:5},
});
function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg}
async function call(method,path,file,{body,params}={}){
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+path,{method,headers,...body!==undefined?{body:JSON.stringify(body)}:{}}),params?{params:Promise.resolve(params)}:undefined);
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text};
}
const TEAM='app/api/company/team/route.ts',PERSON='app/api/company/team/[id]/route.ts';
const invite=body=>call('POST','/api/company/team',TEAM,{body});
const setRole=(user,role)=>call('PATCH','/api/company/team/'+user,PERSON,{params:{id:user},body:{role}});
const remove=user=>call('DELETE','/api/company/team/'+user,PERSON,{params:{id:user}});

test('team: everyone in the company reads it; creators and viewers see the owners and themselves',async()=>{
 state.team=team();
 as(A1);let r=await call('GET','/api/company/team',TEAM);
 assert.equal(r.status,200,r.text);assert.equal(r.body.canEdit,true);assert.equal(r.body.blocked,null);
 assert.deepEqual(r.body.people.map(p=>[p.email,p.role,p.you]),[[A1.email,'owner',true],[A2.email,'creator',false],[A3.email,'viewer',false]]);
 assert.deepEqual(r.body.seats,{taken:3,limit:5});assert.equal(r.body.others,0);
 as(A2);r=await call('GET','/api/company/team',TEAM);
 assert.equal(r.status,200);assert.equal(r.body.canEdit,false);assert.match(r.body.blocked,/Only your company’s owners/);
 assert.deepEqual(r.body.people.map(p=>p.email),[A1.email,A2.email],'the owners and themselves');assert.equal(r.body.others,1);
 assert.ok(!r.text.includes(A3.email),'a teammate’s address stays with the owners');
 assert.ok(!r.text.includes(B1.email),'nothing of another company');
 // Staff with support access read everything, read-only.
 as(T,ORG_A);r=await call('GET','/api/company/team',TEAM);
 assert.equal(r.status,200,r.text);assert.equal(r.body.people.length,3);assert.equal(r.body.canEdit,false);assert.match(r.body.blocked,/support access/);
});

test('team: only the company’s own owners change it; nothing reaches the team functions otherwise',async()=>{
 state.team=team();
 as(A2);let r=await invite({email:'new.person@example.test',role:'creator'});assert.equal(r.status,403);assert.match(r.body.error,/Only your company’s owners/);
 r=await setRole(A3.id,'owner');assert.equal(r.status,403,'a creator cannot promote');
 r=await remove(A1.id);assert.equal(r.status,403,'a creator cannot remove an owner');
 as(A3);r=await invite({email:'new.person@example.test',role:'creator'});assert.equal(r.status,403);assert.match(r.body.error,/Your role is viewer/);
 as(T,ORG_A);r=await invite({email:'new.person@example.test',role:'owner'});assert.equal(r.status,403,'staff viewing with support access are read-only');
 r=await setRole(A2.id,'owner');assert.equal(r.status,403);
 assert.deepEqual(state.team.calls,[],'no change was attempted');
 // An owner of company B cannot touch company A's people: the company is the signed-in one, never the request's.
 as(B1);r=await remove(A2.id);assert.equal(r.status,404);assert.match(r.body.error,/isn’t in your team/);
 r=await setRole(A2.id,'viewer');assert.equal(r.status,404);
 assert.ok(state.team.calls.every(c=>c[1]===ORG_B),'only ever asked about B');
 assert.equal(state.team.members.find(m=>m.userId===A2.id).role,'creator');
 // A bad id is refused before the database.
 as(A1);const before=state.team.calls.length;r=await remove('not-a-person');assert.equal(r.status,404);assert.equal(state.team.calls.length,before);
 r=await setRole(A2.id,'admin');assert.equal(r.status,400);assert.match(r.body.error,/Owner, Creator or Viewer/);
 r=await invite({email:'not an email',role:'creator'});assert.equal(r.status,400);
 // Nmesis's own workspace is managed in the admin.
 as(T,ORG_N);r=await invite({email:'new.person@example.test',role:'creator'});assert.equal(r.status,403);assert.match(r.body.error,/Nmesis admin/);
});

test('team: an owner invites, changes roles and removes; one owner always stays; seats; every change logged',async()=>{
 state.team=team();as(A1);
 // Someone with no sign-in yet: Supabase's invitation first, back to this Studio, then they join as invited.
 let r=await invite({email:'New.Person@Example.test',role:'creator'});
 assert.equal(r.status,200,r.text);assert.match(r.body.said,/Invitation sent to new.person@example.test/);
 assert.deepEqual(state.team.calls.filter(c=>c[0]==='send'),[['send','new.person@example.test',ORIGIN]]);
 assert.ok(r.body.team.people.some(p=>p.email==='new.person@example.test'&&p.status==='invited'));
 // Someone who already signs in elsewhere: added, no second account.
 r=await invite({email:A4.email,role:'owner'});assert.equal(r.status,200,r.text);assert.match(r.body.said,/already has a Nmesis sign-in/);
 assert.equal(state.team.calls.filter(c=>c[0]==='send').length,1);
 r=await invite({email:A2.email,role:'viewer'});assert.equal(r.status,409);assert.match(r.body.error,/already in your team/);
 // Five seats: taken now.
 r=await invite({email:'sixth@example.test',role:'viewer'});assert.equal(r.status,409);assert.match(r.body.error,/Ask Nmesis for more seats/);
 assert.equal(state.team.calls.filter(c=>c[0]==='send').length,1,'no invitation email when no seat is free');
 r=await setRole(A2.id,'viewer');assert.equal(r.status,200,r.text);assert.equal(r.body.said,'Now viewer.');
 r=await remove(A3.id);assert.equal(r.status,200);assert.match(r.body.said,/Their work stays/);
 assert.ok(!r.body.team.people.some(p=>p.userId===A3.id));
 // The last active owner: A4 is only invited, so A1 is the only active owner.
 r=await setRole(A1.id,'creator');assert.equal(r.status,409);assert.match(r.body.error,/at least one owner/);
 r=await remove(A1.id);assert.equal(r.status,409);
 const log=(await call('GET','/api/company/team',TEAM)).body.log;
 assert.deepEqual(log.map(l=>l.action),['remove','role','invite','invite']);
});

test('team: before the owner’s setup step, the team is listed and every change says why it can’t',async()=>{
 state.team=team();state.team.setReady(false);as(A1);
 const r=await call('GET','/api/company/team',TEAM);
 assert.equal(r.status,200);assert.equal(r.body.people.length,3);assert.equal(r.body.canEdit,false);assert.match(r.body.blocked,/Team changes aren’t switched on/);
 for(const res of [await invite({email:'x.person@example.test',role:'creator'}),await setRole(A2.id,'viewer'),await remove(A3.id)]){assert.equal(res.status,503);assert.match(res.body.error,/Team changes aren’t switched on/)}
 assert.deepEqual(state.team.calls,[]);
});

test('credit emails: owners choose among the company’s people; the warning goes to them, else to the owners',async()=>{
 const NOTES='app/api/company/notifications/route.ts';
 as(A2);let r=await call('GET','/api/company/notifications',NOTES);
 assert.equal(r.status,200);assert.equal(r.body.canEdit,false);assert.deepEqual(r.body.people,[],'a creator does not see the addresses');assert.equal(r.body.fallback,true);assert.equal(r.body.you,false);
 r=await call('PUT','/api/company/notifications',NOTES,{body:{userIds:[A2.id]}});assert.equal(r.status,403);
 as(T,ORG_A);r=await call('PUT','/api/company/notifications',NOTES,{body:{userIds:[A2.id]}});assert.equal(r.status,403,'staff with support access read only');
 as(A1);r=await call('GET','/api/company/notifications',NOTES);
 assert.deepEqual(r.body.people.filter(p=>p.chosen).map(p=>p.email),[A1.email],'by default the owners');
 r=await call('PUT','/api/company/notifications',NOTES,{body:{userIds:[B1.id]}});assert.equal(r.status,400,'not someone of another company');
 r=await call('PUT','/api/company/notifications',NOTES,{body:{userIds:[]}});assert.equal(r.status,400);
 r=await call('PUT','/api/company/notifications',NOTES,{body:{userIds:[A2.id,A3.id]}});assert.equal(r.status,200,r.text);
 assert.equal(r.body.fallback,false);assert.deepEqual(r.body.people.filter(p=>p.chosen).map(p=>p.email).sort(),[A2.email,A3.email].sort());
 // The sender (lib/credits/charge.ts warnIfNeeded) uses exactly this choice.
 const {alertRecipients,recipientEmails}=await import('@/lib/credits/recipients.ts');
 const people=[{userId:A1.id,role:'owner',email:A1.email},{userId:A2.id,role:'creator',email:A2.email},{userId:A3.id,role:'viewer',email:A3.email}];
 assert.deepEqual((await alertRecipients(state.db,ORG_A,people)).sort(),[A2.email,A3.email].sort());
 assert.deepEqual(await alertRecipients(state.db,ORG_B,[{userId:B1.id,role:'owner',email:B1.email}]),[B1.email],'another company: still its owners');
 assert.deepEqual(recipientEmails(people.filter(p=>p.userId===A1.id),[A2.id]),{emails:[A1.email],fallback:true},'chosen people who left: the owners again');
 assert.deepEqual(await alertRecipients(undefined,ORG_A,people),[A1.email],'no database: the owners');
 as(A2);r=await call('GET','/api/company/notifications',NOTES);assert.equal(r.body.you,true);
});

test('ask Nmesis: owners only, one email per topic per 10 minutes, never a provider or a cost',async()=>{
 const ASK='app/api/company/ask/route.ts';mail.length=0;
 as(A2);assert.equal((await call('POST','/api/company/ask',ASK,{body:{topic:'pack'}})).status,403);
 as(T,ORG_A);assert.equal((await call('POST','/api/company/ask',ASK,{body:{topic:'pack'}})).status,403);
 as(A1);assert.equal((await call('POST','/api/company/ask',ASK,{body:{topic:'everything'}})).status,400);
 let r=await call('POST','/api/company/ask',ASK,{body:{topic:'pack'}});assert.equal(r.status,200,r.text);assert.match(r.body.said,/Nmesis has been asked for a credit pack/);
 r=await call('POST','/api/company/ask',ASK,{body:{topic:'pack'}});assert.equal(r.status,200);
 r=await call('POST','/api/company/ask',ASK,{body:{topic:'seats'}});assert.equal(r.status,200);
 assert.equal(mail.length,2,'the repeat inside 10 minutes sends nothing');
 assert.deepEqual(mail.map(m=>m.to),[['nmesis@example.test'],['nmesis@example.test']]);
 assert.match(mail[0].text,/owner@example.test, an owner of Demo Company Ltd/);
});

test('support access: everyone reads it with the page’s name; only the owner changes it',async()=>{
 const SUPPORT='app/api/company/support/route.ts';
 state.db.raw.prepare('INSERT INTO staff_access_log(id,org_id,staff_user,path,at) VALUES(?,?,?,?,?)').run('log-1',ORG_A,T.id,'/key-visual',Date.now());
 state.db.raw.prepare('INSERT INTO staff_access_log(id,org_id,staff_user,path,at) VALUES(?,?,?,?,?)').run('log-2',ORG_A,T.id,'/',Date.now()-1000);
 as(A2);let r=await call('GET','/api/company/support',SUPPORT);
 assert.equal(r.status,200,r.text);assert.equal(r.body.canEdit,false);assert.deepEqual(r.body.log.map(l=>l.page),['Key visual','Home']);
 assert.equal((await call('POST','/api/company/support',SUPPORT,{body:{}})).status,403);
 as(A1);r=await call('GET','/api/company/support',SUPPORT);assert.equal(r.body.canEdit,true);
});

test('company overview: the legal name, the plan with what is included, its seats and the brand',async()=>{
 as(A2);const r=await call('GET','/api/company','app/api/company/route.ts');
 assert.equal(r.status,200,r.text);assert.equal(r.body.company,'Demo Company Ltd');assert.equal(r.body.canEdit,false);
 assert.equal(r.body.plan.name,'Growth');assert.equal(r.body.plan.seats,5);assert.equal(r.body.plan.creditsMonthly,1500);assert.equal(r.body.plan.maxOutput,'4K');
 assert.deepEqual(r.body.plan.features.filter(f=>f.on).map(f=>f.key),flags.filter(k=>GROWTH.features[k]));
 assert.deepEqual(r.body.brands,[{id:'demo',name:'Demo Brand'}]);assert.equal(r.body.ownKeys,false);
 assert.ok(r.body.plan.periodFrom,'the period from the credits balance');
 assert.doesNotMatch(r.text,/openai|google|higgsfield|topaz|\$|usd/i,'no provider and no money');
});

test('usage: the use over the period, every day present; a long period by month; owners may ask for a pack',async()=>{
 const {usageOver}=await import('@/lib/credits/usage.ts');
 const over=usageOver([{at:'2026-11-03T10:00:00.000Z',credits:5},{at:'2026-11-03T23:00:00.000Z',credits:7},{at:'2026-11-05T01:00:00.000Z',credits:2},{at:'2026-10-31T10:00:00.000Z',credits:99}],'2026-11-01','2026-11-05');
 assert.equal(over.unit,'day');assert.deepEqual(over.buckets.map(b=>[b.day,b.credits,b.actions]),[['2026-11-01',0,0],['2026-11-02',0,0],['2026-11-03',12,2],['2026-11-04',0,0],['2026-11-05',2,1]]);
 const year=usageOver([{at:'2026-03-15T00:00:00.000Z',credits:3}],'2026-01-10','2026-06-01');
 assert.equal(year.unit,'month');assert.deepEqual(year.buckets.map(b=>b.day),['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01']);assert.equal(year.buckets[2].credits,3);
 assert.deepEqual(usageOver([],'2026-11-05','2026-11-01').buckets,[]);
 as(A1);let r=await call('GET','/api/usage','app/api/usage/route.ts');assert.equal(r.status,200,r.text);assert.equal(r.body.canAsk,true);assert.ok(r.body.over.buckets.length>=1);
 as(T,ORG_A);r=await call('GET','/api/usage','app/api/usage/route.ts');assert.equal(r.status,200);assert.equal(r.body.canAsk,false,'staff read Usage, never ask');
});

test('dates read "14 Nov 2026, 20:42" in the viewer’s time zone; a calendar day never shifts',async()=>{
 const {dateTime,dayDate,shortDay}=await import('../lib/ds/words.ts');
 assert.equal(dateTime('2026-11-14T20:42:00Z','UTC'),'14 Nov 2026, 20:42');
 assert.equal(dateTime('2026-11-14T20:42:00Z','Europe/Berlin'),'14 Nov 2026, 21:42');
 assert.equal(dateTime(Date.parse('2026-09-03T00:05:00Z'),'UTC'),'3 Sep 2026, 00:05','our own month names: never "Sept"');
 assert.equal(dateTime(new Date('2026-12-31T23:30:00Z'),'Asia/Tokyo'),'1 Jan 2027, 08:30');
 assert.equal(dateTime('2026-11-14T20:42:00Z','Not/AZone'),'14 Nov 2026, 20:42','an unknown zone falls back to UTC');
 assert.match(dateTime('2026-11-14T20:42:00Z'),/^\d{1,2} [A-Z][a-z]{2} 2026, \d{2}:\d{2}$/,'the viewer’s own zone');
 for(const bad of ['',null,undefined,'yesterday',NaN])assert.equal(dateTime(bad),'');
 assert.equal(dayDate('2026-11-14'),'14 Nov 2026');assert.equal(dayDate('2026-02-01T23:59:59Z'),'1 Feb 2026');
 assert.equal(dayDate('2026-13-01'),'');assert.equal(dayDate(null),'');assert.equal(shortDay('2026-11-04'),'4 Nov');
 // The rebuilt screens use it, not toLocaleString.
 for(const f of ['components/company/usage-page.tsx','components/company/team.tsx','components/company/support.tsx']){const src=readFileSync(f,'utf8');assert.match(src,/dateTime\(|dayDate\(/,f);assert.doesNotMatch(src,/toLocale(Date)?String\(/,f)}
});

test('the support log names pages: "Library", "Key visual", never "/"',async()=>{
 const {pageName}=await import('@/lib/support-access.ts');
 const cases={'/':'Home','/library':'Library','/library?in=deleted':'Library','/projects':'Projects','/projects/folder-1234':'A folder','/key-visual':'Key visual','/key-visual/':'Key visual','/lineup':'Line-up','/films':'Film','/swap':'Swap','/storyboard':'Story','/usage':'Usage','/company':'Company settings','/nano-lab':'Reference lab','/somewhere-else':'The Studio','':'Home'};
 for(const [path,name] of Object.entries(cases))assert.equal(pageName(path),name,path);
 assert.equal(pageName(null),'Home');assert.equal(pageName(42),'Home');
});

test('every page has its own title: "<page> · Nmesis Studio"',()=>{
 const titles={'app/page.tsx':'Home','app/library/page.tsx':'Library','app/projects/page.tsx':'Projects','app/company/layout.tsx':'Company settings','app/usage/layout.tsx':'Usage',
  'app/storyboard/layout.tsx':'Story','app/key-visual/layout.tsx':'Key visual','app/lineup/layout.tsx':'Line-up','app/films/layout.tsx':'Film','app/swap/layout.tsx':'Swap','app/nano-lab/layout.tsx':'Reference lab',
  'app/signin/page.tsx':'Sign in','app/signin/forgot/page.tsx':'Forgot your password?','app/auth/password/page.tsx':'Choose your password','app/auth/code/page.tsx':'Six-digit code','app/auth/no-company/page.tsx':'No company yet'};
 for(const [file,name] of Object.entries(titles)){assert.ok(existsSync(file),file);assert.ok(readFileSync(file,'utf8').includes(`title:'${name} · Nmesis Studio'`),`${file}: "${name} · Nmesis Studio"`)}
 // A folder is titled with its own name when it can be read, else "Folder".
 const folder=readFileSync('app/projects/[id]/page.tsx','utf8');
 assert.match(folder,/export async function generateMetadata/);assert.match(folder,/`\$\{name\|\|'Folder'\} · Nmesis Studio`/);
 assert.match(folder,/forUser\(got\.ctx\.user\.id\)/,'read as the signed-in person (RLS)');
 // Client pages get their title from a layout; the page bodies are untouched by it.
 for(const dir of ['key-visual','lineup','films','swap','storyboard','nano-lab']){assert.match(readFileSync(`app/${dir}/page.tsx`,'utf8'),/^["']use client["']/,dir);assert.doesNotMatch(readFileSync(`app/${dir}/layout.tsx`,'utf8'),/use client/,dir)}
});

test('the tools no longer carry the connection entries: they live in Company settings → Own keys',()=>{
 const kv=readFileSync('app/key-visual/page.tsx','utf8');
 assert.doesNotMatch(kv,/>Google connection</);assert.doesNotMatch(kv,/>Higgsfield connection</);assert.doesNotMatch(kv,/'AI connection'\)/);
 const keys=readFileSync('components/company/own-keys.tsx','utf8');
 for(const dialog of ['ConnectionSettings','GoogleConnection','FilmConnectionDialog'])assert.match(keys,new RegExp('<'+dialog+'\\b'),dialog);
 assert.match(readFileSync('components/company/company-settings.tsx','utf8'),/o\.ownKeys&&!o\.internal&&<OwnKeysSection\/>/,'own-key companies only');
});
