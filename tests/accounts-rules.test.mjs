// The pure rules behind client accounts: plans and routes (lib/accounts/plan.ts),
// who is asking for which company (lib/accounts/context.ts) and the sign-in words
// (lib/auth/words.ts). Route-level checks are in tests/accounts-access.test.mjs.
import test from 'node:test';import assert from 'node:assert/strict';
import {register} from 'node:module';
register('../scripts/verify/hooks.mjs',import.meta.url);
import {readdirSync,statSync,readFileSync} from 'node:fs';
const plan=await import('../lib/accounts/plan.ts'),{resolveContext}=await import('../lib/accounts/context.ts'),words=await import('../lib/auth/words.ts');
import {memoryDirectory} from './support/state.mjs';
const legacy={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
const managed=(features,extra={})=>({legacy:false,status:'active',planId:'p',planName:'P',endsOn:null,features:{'studio.enabled':true,...features},...extra});
test('features: no plan allows everything, an ended plan nothing, a plan exactly what it says',()=>{
 for(const key of plan.FEATURES)assert.equal(plan.featureOn(legacy,key),true);
 assert.equal(plan.featureOn(managed({'studio.film':true}),'studio.film'),true);
 assert.equal(plan.featureOn(managed({'studio.film':false}),'studio.film'),false);
 assert.equal(plan.featureOn(managed({}),'studio.film'),false,'a key the plan never mentions is off');
 assert.equal(plan.featureOn(managed({'studio.film':true},{status:'ended'}),'studio.film'),false);
 assert.equal(plan.featureOn(managed({'studio.film':true},{status:'cancelled'}),'studio.film'),false);
 assert.deepEqual(plan.readEntitlements(null).features,{},'an unknown company reads as everything off');
 assert.equal(plan.featureOn(plan.readEntitlements(null),'studio.key_visuals'),false);
});
test('studio.max_output caps sizes and upscales',()=>{
 assert.equal(plan.maxEdge(legacy),7680);
 assert.equal(plan.maxEdge(managed({'studio.max_output':'2k'})),2048);
 assert.equal(plan.maxEdge(managed({'studio.max_output':'4k'})),3840);
 assert.equal(plan.maxEdge(managed({'studio.max_output':'8k'})),7680);
 assert.equal(plan.maxEdge(managed({'studio.max_output':null})),7680,'no value is no limit');
 assert.equal(plan.maxEdge(managed({})),2048,'not mentioned is the smallest');
 const ctx={entitlements:managed({'studio.max_output':'2k'})};
 assert.doesNotThrow(()=>plan.requireEdge(ctx,plan.longEdgeOf('2048x1152')));
 assert.throws(()=>plan.requireEdge(ctx,plan.longEdgeOf('3840x2160')),e=>e.status===403&&/up to 2K/.test(e.message));
 assert.throws(()=>plan.requireEdge(ctx,7680),/up to 2K/);
});
test('an ended or switched-off Studio shows a notice; the library stays viewable for 30 days',()=>{
 const day=86_400_000,now=Date.parse('2026-11-12T12:00:00Z');
 assert.deepEqual(plan.workspaceState(legacy,now),{open:true,libraryOpen:true,libraryUntil:null});
 assert.equal(plan.workspaceState(managed({}),now).open,true);
 const ended=managed({},{status:'ended',endsOn:'2026-11-01'});
 assert.deepEqual(plan.workspaceState(ended,now),{open:false,libraryOpen:true,libraryUntil:'2026-12-01'});
 assert.equal(plan.workspaceState(ended,Date.parse('2026-12-03T00:00:00Z')).libraryOpen,false);
 assert.equal(plan.workspaceState(managed({'studio.enabled':false}),now).open,false);
 assert.equal(plan.workspaceState({...legacy,legacy:false,status:'active',features:{}},now).open,false,'enabled must be said');
 assert.ok(now-Date.parse('2026-11-01')<31*day);
});
test('every API route is in the single route → feature table',()=>{
 const files=[];const walk=d=>{for(const n of readdirSync(d)){const p=d+'/'+n;if(statSync(p).isDirectory())walk(p);else if(n==='route.ts')files.push(p)}};walk('app/api');
 const exempt=/^app\/api\/(auth\/|me\/)/;let checked=0;
 for(const file of files){
  if(exempt.test(file))continue;
  const path='/'+file.replace(/\/route\.ts$/,'').replace(/\[action\]/,'quote').replace(/\[id\]/g,'item-12345678').replace(/^app\//,'');
  for(const method of ['GET','POST','PUT','PATCH','DELETE'])if(new RegExp(`export (async )?function ${method}\\b`).test(readFileSync(file,'utf8'))){assert.ok(plan.routeRule(path,method),`${method} ${path} has no entry`);checked++}
 }
 assert.ok(checked>50,'checked '+checked);
 assert.equal(plan.routeRule('/api/films/x-12345678/render','POST').feature,'studio.film');
 assert.equal(plan.routeRule('/api/connection','GET').feature,null);
 assert.equal(plan.routeRule('/api/connection','POST').feature,'studio.own_keys');
 assert.equal(plan.routeRule('/api/visuals','GET').library,true);
 assert.equal(plan.routeRule('/api/unknown','GET'),null);
});
test('checkRoute: viewer read-only, plan features, closed subscriptions, plain sentences',()=>{
 const starter={role:'creator',entitlements:managed({'studio.key_visuals':true})};
 assert.throws(()=>plan.checkRoute(starter,'/api/films','GET'),e=>e.status===403&&e.message==='Film Studio is not on your company\'s plan. It is available on Enterprise; ask Nmesis to add it.');
 assert.throws(()=>plan.checkRoute(starter,'/api/topaz/jobs','POST'),/Upscale is not on your company's plan\. It is available on Growth/);
 assert.doesNotThrow(()=>plan.checkRoute(starter,'/api/generate','POST'));
 assert.throws(()=>plan.checkRoute({...starter,role:'viewer'},'/api/generate','POST'),/Your role is viewer/);
 assert.doesNotThrow(()=>plan.checkRoute({...starter,role:'viewer'},'/api/visuals','GET'));
 const closed={role:'owner',entitlements:managed({},{status:'ended',endsOn:new Date().toISOString().slice(0,10)})};
 assert.doesNotThrow(()=>plan.checkRoute(closed,'/api/visuals','GET'));
 assert.doesNotThrow(()=>plan.checkRoute(closed,'/api/assets/item-12345678','GET'));
 assert.throws(()=>plan.checkRoute(closed,'/api/visuals/item-12345678','DELETE'),/not active/);
 assert.throws(()=>plan.checkRoute(closed,'/api/generate','POST'),/not active/);
 assert.throws(()=>plan.checkRoute({role:'owner',entitlements:legacy},'/api/nothing','GET'),e=>e.status===404);
});
const ORG_A='0000000a-0000-4000-8000-00000000000a',ORG_B='0000000b-0000-4000-8000-00000000000b',ORG_N='00000001-0000-4000-8000-000000000001';
const U=n=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),email:n+'@example.test'});
// Staff (U(9)) after the six-digit code in this session.
const STAFF={...U(9),aal:'aal2'};
const dir=()=>memoryDirectory({orgs:[{id:ORG_A,name:'A',kind:'client'},{id:ORG_B,name:'B',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
 members:[{userId:U(1).id,orgId:ORG_A,role:'creator',status:'active'},{userId:U(1).id,orgId:ORG_B,role:'viewer',status:'active'},{userId:U(2).id,orgId:ORG_A,role:'owner',status:'invited'},{userId:U(5).id,orgId:ORG_A,role:'owner',status:'removed'}],
 staff:{[U(9).id]:'ops'},entitlements:{[ORG_A]:legacy,[ORG_B]:legacy,[ORG_N]:legacy}});
test('context: the company cookie is a wish, honoured only for an active membership or staff',async()=>{
 const d=dir();
 let r=await resolveContext({user:U(1),chosenOrg:null,directory:d});assert.equal(r.ok,true);assert.equal(r.ctx.org.id,ORG_A);assert.equal(r.ctx.role,'creator');assert.deepEqual(r.ctx.orgs.map(o=>o.id),[ORG_A,ORG_B],'a switcher for two companies');
 r=await resolveContext({user:U(1),chosenOrg:ORG_B,directory:d});assert.equal(r.ctx.org.id,ORG_B);assert.equal(r.ctx.role,'viewer');
 r=await resolveContext({user:U(1),chosenOrg:ORG_N,directory:d});assert.equal(r.ctx.org.id,ORG_A,'not a member of N: back to A');assert.equal(r.ctx.viewingAs,false);
 r=await resolveContext({user:U(1),chosenOrg:'not-a-uuid',directory:d});assert.equal(r.ctx.org.id,ORG_A);
 r=await resolveContext({user:U(5),chosenOrg:ORG_A,directory:d});assert.deepEqual(r,{ok:false,reason:'no_company'},'a removed member has no company');
 r=await resolveContext({user:U(7),chosenOrg:null,directory:d});assert.deepEqual(r,{ok:false,reason:'no_company'});
});
test('context: an invitation becomes an active membership on first arrival',async()=>{
 const d=dir();const r=await resolveContext({user:U(2),chosenOrg:null,directory:d});
 assert.equal(r.ok,true);assert.equal(r.ctx.org.id,ORG_A);assert.equal(r.ctx.role,'owner');assert.deepEqual(d.accepted,[U(2).id]);
 await resolveContext({user:U(2),chosenOrg:null,directory:d});assert.deepEqual(d.accepted,[U(2).id],'accepted once');
});
test('context: staff open any company; a client read-only as "Viewing as", Nmesis\'s own as owner',async()=>{
 const d=dir();
 for(const aal of [undefined,'aal1'])assert.deepEqual(await resolveContext({user:{...U(9),aal},chosenOrg:ORG_B,directory:d}),{ok:false,reason:'mfa_required'},'staff need the code first');
 let r=await resolveContext({user:STAFF,chosenOrg:ORG_B,directory:d});assert.equal(r.ctx.org.id,ORG_B);assert.equal(r.ctx.viewingAs,true);assert.equal(r.ctx.role,'viewer');assert.equal(r.ctx.orgs.length,3);
 r=await resolveContext({user:STAFF,chosenOrg:null,directory:d});assert.equal(r.ctx.org.id,ORG_N);assert.equal(r.ctx.viewingAs,false);assert.equal(r.ctx.role,'owner');
 r=await resolveContext({user:STAFF,chosenOrg:'00000000-0000-4000-8000-0000000000ff',directory:d});assert.equal(r.ctx.org.id,ORG_N,'an unknown company falls back');
});
test('sign-in words: password rules, plain errors, safe destinations',()=>{
 assert.equal(words.passwordProblem('short','short','a@example.test'),'That is 5 characters. It needs at least 10.');
 assert.equal(words.passwordProblem('person@example.test','person@example.test','Person@Example.test'),'That is your email address. Choose something else.');
 assert.equal(words.passwordProblem('a long enough one','a long enough two','a@example.test'),'The two passwords are not the same.');
 assert.equal(words.passwordProblem('a long enough one','a long enough one','a@example.test'),'');
 assert.equal(words.problemFor({message:'Session from session_id claim in JWT does not exist',status:403}),'expired');
 assert.equal(words.problemFor({code:'session_not_found'}),'expired');
 assert.equal(words.problemFor({code:'invalid_credentials',status:400}),'bad_credentials');
 assert.equal(words.problemFor({code:'otp_expired'}),'link_invalid');
 assert.equal(words.problemFor({status:429}),'rate_limited');
 assert.equal(words.problemFor({name:'TimeoutError'}),'unreachable');
 assert.equal(words.problemFor({code:'flow_state_not_found'}),'other_browser');
 assert.equal(words.problemText('expired'),'Your sign-in timed out. Start again.');
 assert.equal(words.problemText('<script>'),words.PROBLEMS.unknown,'never echoes what it was given');
 for(const [v,want] of [['/films','/films'],['//evil.example','/'],['https://evil.example','/'],['/api/visuals','/'],['/auth/password','/'],['/\\evil','/'],[undefined,'/']])assert.equal(words.safeNext(v),want,String(v));
 assert.equal(words.hasPassword({app_metadata:{[words.PASSWORD_FLAG]:true}}),true);assert.equal(words.hasPassword({app_metadata:{}}),false);assert.equal(words.hasPassword(null),false);
 assert.equal(words.cleanEmail(' Person@Example.TEST '),'person@example.test');assert.equal(words.cleanEmail('nope'),'');
});
