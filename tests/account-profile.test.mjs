// Your account → your name (app/api/account/profile, lib/auth/supabase.ts
// saveOwnName): the checks, who may change it, and the Supabase Auth call,
// against the real route handler. Stand-ins replace only: the verified session
// and company list (tests/support/stub-context.mjs, the real resolveContext)
// and Supabase Auth (scripts/verify/auth-mock.mjs, the same stand-in the UI
// harness uses), reached through a fetch that records every call and can play
// a Supabase that fails or never answers.
// The page itself (components/shell/account-page.tsx) is drawn on the server
// with its neighbours stood in for: the cards, and who may edit the name.
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {state,memoryDirectory} from './support/state.mjs';
import {tsxLoader} from './support/load-tsx.mjs';
import {startAuthMock} from '../scripts/verify/auth-mock.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0xa),ORG_N=id(0x1);
const OWNER={id:id(0xa1),email:'owner@example.test'},CREATOR={id:id(0xa2),email:'creator@example.test'},VIEWER={id:id(0xa3),email:'viewer@example.test'};
const STAFF={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const FULL={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features:{'studio.enabled':true,'studio.max_output':'8k'}};
const ORIGIN='http://studio.test',PATH='/api/account/profile',SECRET='mock-secret-key';
const LS=String.fromCharCode(0x2028);
let auth,route,calls=[],answer=null;const realFetch=globalThis.fetch;

before(async()=>{
 auth=await startAuthMock();
 Object.assign(process.env,{SUPABASE_URL:auth.url,SUPABASE_PUBLISHABLE_KEY:'mock-publishable-key',SUPABASE_SECRET_KEY:SECRET});
 // Only Supabase Auth may be called; `answer` stands in for it when a test says so.
 globalThis.fetch=async(url,init)=>{
  const u=String(url instanceof Request?url.url:url);
  if(!u.startsWith(auth.url))throw new Error('Network calls are not allowed in this test: '+u);
  calls.push({method:init?.method||'GET',path:new URL(u).pathname,body:typeof init?.body==='string'?JSON.parse(init.body):null,auth:new Headers(init?.headers).get('authorization')});
  return answer?answer(u,init):realFetch(url,init);
 };
 state.db=undefined;
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Demo Company A',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:OWNER.id,orgId:ORG_A,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG_A,role:'creator',status:'active'},{userId:VIEWER.id,orgId:ORG_A,role:'viewer',status:'active'}],
  staff:{[STAFF.id]:'ops'},
  entitlements:{[ORG_A]:FULL,[ORG_N]:{legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}}},
  grants:{[ORG_A]:Date.now()+86_400_000},
 });
 for(const u of [OWNER,CREATOR,VIEWER,STAFF])auth.addUser(u.email,'demo-password-1',{},{id:u.id,aal:u.aal});
 // Something else the person keeps in their profile, which a name change must leave alone.
 auth.users.get(OWNER.id).user_metadata={full_name:'Old Name',locale:'en'};
 route=await import('@/app/api/account/profile/route.ts');
});
after(()=>{globalThis.fetch=realFetch;auth?.server.closeAllConnections();auth?.server.close()});
beforeEach(()=>{calls=[];answer=null});

function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg;state.chosenBrand=null}
async function patch(body,{origin=ORIGIN,raw}={}){
 const headers={'content-type':'application/json'};if(origin)headers.origin=origin;
 const response=await route.PATCH(new Request(ORIGIN+PATH,{method:'PATCH',headers,body:raw??JSON.stringify(body)}));
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,cache:response.headers.get('cache-control')};
}
const metadata=user=>auth.users.get(user.id).user_metadata;
const supabaseCalls=()=>calls.filter(c=>c.path.startsWith('/auth/v1/'));

test('the route is in the route table for PATCH only, with no paid feature',async()=>{
 const plan=await import('@/lib/accounts/plan.ts');
 const rule=plan.routeRule(PATH,'PATCH');
 assert.ok(rule,'PATCH /api/account/profile is listed');assert.equal(rule.feature,null);
 assert.equal(plan.routeRule(PATH,'GET'),null);assert.equal(plan.routeRule(PATH,'POST'),null);
 assert.equal(typeof route.GET,'undefined');assert.equal(typeof route.POST,'undefined');
});

test('a name that is not one line of 1 to 80 characters is refused before Supabase is called',async()=>{
 as(OWNER);
 const refused=[
  [{},'Enter your name.'],
  [{name:''},'Enter your name.'],
  [{name:'    '},'Enter your name.'],
  [{name:null},'Enter your name.'],
  [{name:42},'Enter your name.'],
  [{name:['Demo','Person']},'Enter your name.'],
  [{name:{first:'Demo'}},'Enter your name.'],
  [{name:true},'Enter your name.'],
  [{name:'x'.repeat(81)},'Keep your name to 80 characters or fewer.'],
  [{name:'Demo\nPerson'},'Write your name on one line, without special characters.'],
  [{name:'Demo Person\n'},'Write your name on one line, without special characters.'],
  [{name:'Demo\tPerson'},'Write your name on one line, without special characters.'],
  [{name:'Demo\u0000Person'},'Write your name on one line, without special characters.'],
  [{name:'Demo\u007fPerson'},'Write your name on one line, without special characters.'],
  [{name:'Demo\u0085Person'},'Write your name on one line, without special characters.'],
  [{name:'Demo'+LS+'Person'},'Write your name on one line, without special characters.'],
 ];
 for(const [body,error] of refused){
  const r=await patch(body);
  assert.equal(r.status,400,JSON.stringify(body));assert.equal(r.body.error,error,JSON.stringify(body));
 }
 assert.equal((await patch(undefined,{raw:'not json'})).status,400);
 assert.equal((await patch(undefined,{raw:'["Demo"]'})).status,400);
 assert.equal((await patch(undefined,{raw:JSON.stringify({name:'x'.repeat(3000)})})).status,413,'a body over the limit');
 assert.deepEqual(supabaseCalls(),[],'nothing reached Supabase');
 assert.equal(metadata(OWNER).full_name,'Old Name');
});

test('the signed-in person’s own name is saved, trimmed, with their other profile keys kept',async()=>{
 as(OWNER);
 const r=await patch({name:'  Demo   Person ',userId:CREATOR.id,id:CREATOR.id});
 assert.equal(r.status,200,r.text);assert.deepEqual(r.body,{name:'Demo Person'});
 assert.equal(r.cache,'private, no-store');
 const sent=supabaseCalls();
 assert.equal(sent.length,1);
 assert.equal(sent[0].method,'PUT');
 assert.equal(sent[0].path,'/auth/v1/admin/users/'+OWNER.id,'the session’s own id, never the body’s');
 assert.deepEqual(sent[0].body,{user_metadata:{full_name:'Demo Person'}});
 assert.equal(sent[0].auth,'Bearer '+SECRET);
 assert.deepEqual(metadata(OWNER),{full_name:'Demo Person',locale:'en'});
 assert.equal(metadata(CREATOR).full_name,undefined,'nobody else changed');
 // Exactly 80 characters, accents and all, is fine.
 const long='É'.repeat(80);
 const max=await patch({name:long});
 assert.equal(max.status,200,max.text);assert.equal(max.body.name,long);assert.equal(metadata(OWNER).full_name,long);
 // A creator changes their own name too.
 as(CREATOR);
 const own=await patch({name:'Demo Creator'});
 assert.equal(own.status,200,own.text);assert.equal(metadata(CREATOR).full_name,'Demo Creator');
});

test('staff viewing a company are refused, and nothing reaches Supabase',async()=>{
 as(STAFF,ORG_A);
 const r=await patch({name:'Demo Staff'});
 assert.equal(r.status,403,r.text);assert.equal(typeof r.body.error,'string');
 assert.deepEqual(supabaseCalls(),[]);
 assert.equal(metadata(STAFF).full_name,undefined);
 // In Nmesis's own workspace, staff change their own name like anyone.
 as(STAFF,ORG_N);
 const home=await patch({name:'Demo Staff'});
 assert.equal(home.status,200,home.text);assert.equal(metadata(STAFF).full_name,'Demo Staff');
});

test('viewers are refused by the shared write rule (lib/accounts/plan.ts checkRoute)',async()=>{
 as(VIEWER);
 const r=await patch({name:'Demo Viewer'});
 assert.equal(r.status,403,r.text);
 assert.deepEqual(supabaseCalls(),[]);
});

test('signed out, or from another site: refused before the body is read',async()=>{
 as(null);
 assert.equal((await patch({name:'Demo Person'})).status,401);
 as(OWNER);
 assert.equal((await patch({name:'Demo Person'},{origin:'https://elsewhere.example.test'})).status,403);
 assert.deepEqual(supabaseCalls(),[]);
});

test('a Supabase that fails or does not answer: 502 with a plain sentence, nothing saved, no secret in the logs',async()=>{
 as(OWNER);
 const before=metadata(OWNER).full_name;
 const logged=[];const realError=console.error;console.error=(...a)=>logged.push(a.map(String).join(' '));
 try{
  const cases=[
   // The ten-second limit (lib/auth/supabase.ts timedFetch) ends the request like this.
   ()=>Promise.reject(new DOMException('The operation was aborted due to timeout','TimeoutError')),
   ()=>Promise.reject(new TypeError('fetch failed')),
   ()=>Promise.resolve(new Response(JSON.stringify({code:'unexpected_failure',msg:'Database error'}),{status:500,headers:{'content-type':'application/json'}})),
   ()=>Promise.resolve(new Response('<html>Bad gateway</html>',{status:502,headers:{'content-type':'text/html'}})),
  ];
  for(const fake of cases){
   answer=fake;
   const r=await patch({name:'Demo Person'});
   assert.equal(r.status,502,r.text);
   assert.equal(r.body.error,'The sign-in service did not save your name. Try again in a moment.');
  }
 }finally{console.error=realError}
 assert.equal(metadata(OWNER).full_name,before);
 assert.ok(logged.length>=4,'each failure is logged');
 assert.ok(logged.every(l=>!l.includes(SECRET)&&!l.includes('Demo Person')),'logged by kind only: '+logged.join(' | '));
});

test('the auth stand-in merges user metadata as Supabase does (null removes a key)',async()=>{
 const u=auth.addUser('merge@example.test','demo-password-1',{},{name:'First Name'});
 u.user_metadata.locale='en';
 const put=body=>realFetch(auth.url+'/auth/v1/admin/users/'+u.id,{method:'PUT',headers:{authorization:'Bearer '+SECRET,'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
 assert.deepEqual((await put({user_metadata:{full_name:'Second Name'}})).user_metadata,{full_name:'Second Name',locale:'en'});
 assert.deepEqual((await put({user_metadata:{locale:null}})).user_metadata,{full_name:'Second Name'});
 assert.deepEqual((await put({app_metadata:{flag:true}})).user_metadata,{full_name:'Second Name'},'other updates leave it alone');
});

// ── The page ───────────────────────────────────────────────────────────────
const SUMMARY={user:{email:'demo.person@example.test',name:'Demo Person'},org:{id:ORG_A,name:'Demo Company A'},brand:{id:'demo-brand',name:'Demo Brand'},brands:[],role:'owner',orgs:[],switcher:null,staff:false,viewingAs:false,supportUntil:null,internal:false,plan:{name:'Enterprise',legacy:false,none:false},features:{},upsell:{},maxEdge:8192,workspace:{open:true,noPlan:false,libraryOpen:true,libraryUntil:null}};
const METER={used:800,left:1200,held:0,percent:40,level:0,periodFrom:null,periodTo:null,resetsOn:null};
function drawPage({account=SUMMARY,credits={unlimited:false,meter:METER,usage:true},answered=true}={}){
 const link={__esModule:true,default:({href,children,...rest})=>React.createElement('a',{href,...rest},children)};
 const {AccountPage}=tsxLoader({
  'next/link':link,
  '@/components/workspace/frame':{WorkspaceFrame:({children})=>React.createElement('main',null,children)},
  '@/components/studio-account':{AccountNotices:()=>null,planEnded:a=>!!a&&!a.workspace.open&&!a.workspace.noPlan,reloadAccount:async()=>null,useAccount:()=>account},
  '@/components/credits':{useCredits:()=>credits,useCreditsAnswered:()=>answered},
  '@/components/ds/toast':{useToast:()=>({toast:()=>0})},
  './side-nav':{Avatar:()=>React.createElement('span',{className:'ds-avatar studio-avatar','aria-hidden':'true'},'DP')},
 })('components/shell/account-page.tsx');
 return renderToStaticMarkup(React.createElement(AccountPage));
}
const titles=html=>[...html.matchAll(/<h2 class="ds-section-title"[^>]*>([^<]+)<\/h2>/g)].map(m=>m[1]);

test('the account page: five cards in order, each from the shared card', () => {
 const html=drawPage();
 assert.deepEqual(titles(html),['Profile','Company','Theme','Password and security','Plan and credits']);
 assert.equal(html.match(/<section class="ds-section account-card"/g).length,5);
 assert.match(html,/<div class="account-cards">/);
 // Profile: the name, the email and Edit.
 assert.match(html,/<b class="account-name ds-truncate" title="Demo Person">Demo Person<\/b>/);
 assert.match(html,/demo\.person@example\.test/);
 assert.match(html,/<button type="button" class="ds-btn sm" aria-label="Edit your name">.*Edit<\/button>/);
 // Company: the brand's name, the role, the members (loading until the team answers) and the link.
 assert.match(html,/<dt>Company<\/dt><dd>Demo Brand<\/dd>/);
 assert.match(html,/<dt>Your role<\/dt><dd>Owner<\/dd>/);
 assert.match(html,/<dt>Members<\/dt><dd><span class="ds-skel ds-skel-line account-skel short" aria-hidden="true"><\/span><span class="ds-sr-only">Loading<\/span><\/dd>/);
 assert.match(html,/<a href="\/company" class="ds-link">Members<\/a>/);
 // Theme, as before.
 assert.match(html,/<div class="ds-segmented studio-theme" role="group" aria-label="Theme"><button type="button" aria-pressed="false">Light<\/button><button type="button" aria-pressed="false">Dark<\/button><button type="button" aria-pressed="true">System<\/button><\/div>/);
 // Password and security: the email the link goes to, the link, and Log out.
 assert.match(html,/we email a link to <span class="account-email">demo\.person@example\.test<\/span>/);
 assert.match(html,/<a href="\/signin\/forgot" class="ds-link">Send a password link<\/a>/);
 assert.match(html,/<form action="\/auth\/signout" method="post"><button type="submit" class="ds-btn">.*Log out<\/button><\/form>/);
 // Plan and credits.
 assert.match(html,/<dt>Plan<\/dt><dd>Enterprise<\/dd>/);
 assert.match(html,/<dt>Credits left<\/dt><dd>1,200 this month<\/dd>/);
 assert.match(html,/<a href="\/usage" class="ds-link">Plans and credits<\/a>/);
 // The old list's classes are no longer used.
 assert.doesNotMatch(html,/studio-account-page|studio-fact/);
});

test('the account page: who may not change their name sees it read-only, and says why', () => {
 const staff=drawPage({account:{...SUMMARY,staff:true,viewingAs:true,role:'viewer'}});
 assert.doesNotMatch(staff,/Edit your name/);
 assert.match(staff,/<dt>Your role<\/dt><dd>Staff \(read-only\)<\/dd>/);
 assert.match(staff,/You are viewing this company as Nmesis staff, so your name is read-only here\./);
 const viewer=drawPage({account:{...SUMMARY,role:'viewer'}});
 assert.doesNotMatch(viewer,/Edit your name/);
 assert.match(viewer,/<dt>Your role<\/dt><dd>Viewer<\/dd>/);
 assert.match(viewer,/Your role is viewer, so your name is read-only here\./);
 const paused=drawPage({account:{...SUMMARY,workspace:{open:false,noPlan:false,libraryOpen:true,libraryUntil:null}}});
 assert.doesNotMatch(paused,/Edit your name/);
 assert.match(paused,/<dt>Plan<\/dt><dd>Enterprise \(ended\)<\/dd>/);
 const creator=drawPage({account:{...SUMMARY,role:'creator',user:{email:'demo.person@example.test',name:null}}});
 assert.match(creator,/Edit your name/);
 assert.match(creator,/<span class="account-name ds-muted">No name yet<\/span>/);
});

test('the account page: credits while loading, unlimited or unknown; plan names; Nmesis’s own workspace', () => {
 assert.match(drawPage({credits:null,answered:false}),/<dt>Credits left<\/dt><dd><span class="ds-skel ds-skel-line account-skel" aria-hidden="true"><\/span><span class="ds-sr-only">Loading<\/span><\/dd>/);
 assert.match(drawPage({credits:null,answered:true}),/<dt>Credits left<\/dt><dd><span class="ds-muted">Not available right now<\/span><\/dd>/);
 const internal=drawPage({account:{...SUMMARY,internal:true,plan:{name:null,legacy:true,none:false}},credits:{unlimited:true,meter:null,usage:false}});
 assert.match(internal,/<dt>Credits left<\/dt><dd>Not counted in this workspace<\/dd>/);
 assert.match(internal,/<dt>Plan<\/dt><dd>Nmesis’s own workspace<\/dd>/);
 assert.doesNotMatch(internal,/href="\/usage"/,'only those who may open Usage get the link');
 assert.doesNotMatch(internal,/<dt>Members<\/dt>|href="\/company"/,'Settings has no Team there');
 assert.match(drawPage({account:{...SUMMARY,plan:{name:null,legacy:false,none:true}}}),/<dt>Plan<\/dt><dd>No plan yet<\/dd>/);
 assert.match(drawPage({credits:{unlimited:false,meter:{...METER,left:1,resetsOn:'2026-12-01'},usage:false}}),/<dd>1 this month<span class="ds-help account-sub">They reset on [^<]+\.<\/span><\/dd>/);
 // Before the account is known: a status for screen readers and the cards’ shapes.
 const loading=drawPage({account:null});
 assert.match(loading,/<p class="ds-sr-only" role="status">Loading your account…<\/p>/);
 assert.match(loading,/<div class="account-cards" aria-busy="true">/);
});
