// Route-level access checks for client accounts (PR S2), against the Studio's real
// route handlers and libraries. Stand-ins replace only: the verified session and
// company list (tests/support/stub-context.mjs, which runs the real resolveContext),
// Postgres (in-memory SQLite built from the migrations) and S3 (the local stand-in
// from scripts/verify). Every provider call is refused and counted.
// V1 cross-company · V2 plan features · V3 viewer · V4 staff · V5 configurators.
// S2.1: the staff six-digit code (AAL2) on every route, the switcher's sections,
// and the company deep link.
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
import {readdirSync,statSync} from 'node:fs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0xa),ORG_B=id(0xb),ORG_S=id(0x5),ORG_E=id(0xe),ORG_N=id(0x1);
const A1={id:id(0xa1),email:'a1@example.test'},A2={id:id(0xa2),email:'a2@example.test'},A3={id:id(0xa3),email:'a3@example.test'};
const B1={id:id(0xb1),email:'b1@example.test'},S1={id:id(0x51),email:'s1@example.test'},E1={id:id(0xe1),email:'e1@example.test'};
// Staff with the six-digit code in this session (aal2), and the same person before it.
const T={id:id(0x71),email:'staff@example.test',aal:'aal2'},T0={...T,aal:'aal1'},NOBODY={id:id(0x99),email:'nobody@example.test'};
const prefix=(org,user)=>`orgs/${org}/users/${user.id}/`;
const legacy={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
const starterFeatures={'studio.enabled':true,'studio.max_output':'2k','studio.key_visuals':true,'studio.lineups':false,'studio.area_edit':false,'studio.object_select':false,'studio.pinterest':false,'studio.smart_reference':false,'studio.upscale':false,'studio.film':false,'studio.swap':false,'studio.storyboards':false,'studio.own_keys':false};
const starter={legacy:false,status:'active',planId:'starter',planName:'Starter',endsOn:null,features:starterFeatures};
const recentEnd=new Date(Date.now()-5*86_400_000).toISOString().slice(0,10);
const ended={legacy:false,status:'ended',planId:'growth',planName:'Growth',endsOn:recentEnd,features:Object.fromEntries(Object.keys(starterFeatures).map(k=>[k,k==='studio.max_output'?null:false]))};
const car=(brand,model)=>({brandId:brand,modelId:model,brandName:'Demo '+brand,modelName:'Model '+model,path:`/${brand}/${model}/`,template:'capture'});
const ORIGIN='http://studio.test';
let s3,store,routes={},providerCalls=[],providerAnswer=null;const realFetch=globalThis.fetch;const table=[];
before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32),OPENAI_API_KEY:'not-a-real-key',CONFIGURATOR_ORIGIN:'https://configurator.example.com'});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);providerCalls.push(u);if(providerAnswer)return providerAnswer(u,init);throw new Error('Provider calls are not allowed in this test.')};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Company A',kind:'client'},{id:ORG_B,name:'Company B',kind:'client'},{id:ORG_S,name:'Starter Co',kind:'client'},{id:ORG_E,name:'Ended Co',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:A1.id,orgId:ORG_A,role:'owner',status:'active'},{userId:A2.id,orgId:ORG_A,role:'creator',status:'invited'},{userId:A3.id,orgId:ORG_A,role:'viewer',status:'active'},{userId:B1.id,orgId:ORG_B,role:'owner',status:'active'},{userId:S1.id,orgId:ORG_S,role:'creator',status:'active'},{userId:E1.id,orgId:ORG_E,role:'owner',status:'active'}],
  staff:{[T.id]:'ops'},
  entitlements:{[ORG_A]:legacy,[ORG_B]:legacy,[ORG_S]:starter,[ORG_E]:ended,[ORG_N]:legacy},
  cars:{[ORG_A]:[car('alpha','one'),car('alpha','two')],[ORG_B]:[car('beta','one')]},
  allCars:[car('alpha','one'),car('alpha','two'),car('beta','one'),car('gamma','one')],
 });
 const load=p=>import('@/'+p);
 for(const p of ['app/api/visuals/route.ts','app/api/visuals/[id]/route.ts','app/api/assets/[id]/route.ts','app/api/area-edits/[id]/route.ts','app/api/swap-source/[id]/route.ts','app/api/films/route.ts','app/api/films/[id]/route.ts','app/api/films/[id]/video/route.ts','app/api/films/[id]/[action]/route.ts','app/api/swaps/route.ts','app/api/swaps/[id]/route.ts','app/api/swaps/[id]/video/route.ts','app/api/swaps/[id]/diagnostic/route.ts','app/api/swaps/[id]/[action]/route.ts','app/api/storyboards/route.ts','app/api/storyboards/[id]/route.ts','app/api/storyboards/[id]/video/route.ts','app/api/storyboards/[id]/[action]/route.ts','app/api/image-jobs/route.ts','app/api/image-jobs/[id]/[action]/route.ts','app/api/topaz/jobs/route.ts','app/api/topaz/jobs/[id]/route.ts','app/api/upscale-import/route.ts','app/api/generate/route.ts','app/api/uploads/route.ts','app/api/configurators/route.ts','app/api/me/route.ts','app/api/status/route.ts','app/api/directions/route.ts','app/api/pinterest/route.ts','app/api/smart-prompts/route.ts','app/api/connection/route.ts'])routes[p]=await load(p);
 store=(await load('lib/portable/storage.ts')).getStorage();
 const png=Buffer.alloc(64);png.set([137,80,78,71,13,10,26,10]);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
 const json=v=>JSON.stringify(v),meta={httpMetadata:{contentType:'application/json'}},img={httpMetadata:{contentType:'image/png'}},now=new Date().toISOString();
 const visual=(vid,title)=>json({id:vid,title,src:'/api/assets/'+vid,status:'ready',createdAt:now,provider:'openai',model:'gpt-image-2.5-sunburst',sourceId:vid,moodId:vid});
 const pB=prefix(ORG_B,B1),pA1=prefix(ORG_A,A1),pA2=prefix(ORG_A,A2);
 // Company B's work (the target of every guess).
 await store.put(pB+'images/bimage-0001',png,img);
 await store.put(pB+'images/bvisual-001',png,img);await store.put(pB+'visuals/bvisual-001.json',visual('bvisual-001','B visual'),meta);
 await store.put(pB+'visuals/bdeleted-01.json',visual('bdeleted-01','B deleted'),meta);await store.put(pB+'deleted-visuals/bdeleted-01.json',json({id:'bdeleted-01'}),meta);
 await store.put(pB+'swap-sources/bsource-001.mp4',Buffer.from('mp4'),{httpMetadata:{contentType:'video/mp4'}});
 // Company A's own work (the positive controls inside one company).
 await store.put(pA1+'images/avisual-001',png,img);await store.put(pA1+'visuals/avisual-001.json',visual('avisual-001','A1 visual'),meta);
 await store.put(pA2+'images/avisual-002',png,img);await store.put(pA2+'visuals/avisual-002.json',visual('avisual-002','A2 visual'),meta);
 as(B1);
 const board=await call('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{title:'B story'}});assert.equal(board.status,200,JSON.stringify(board.body));B.board=board.body.board.id;
 const film=await call('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'bimage-0001',title:'B film'}});assert.equal(film.status,200,JSON.stringify(film.body));B.film=film.body.film.id;
 const swap=await call('POST','/api/swaps','app/api/swaps/route.ts',{body:{title:'B swap',vehicle:'Demo',configurator:'https://configurator.example.com/b/',sourceId:'bsource-001',sourceDuration:8,imageIds:['bimage-0001'],resolution:'480p'}});assert.equal(swap.status,200,JSON.stringify(swap.body));B.swap=swap.body.swap.id;
 const t=Date.now();
 state.db.raw.prepare("INSERT INTO image_jobs(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?)").run('bjob-00001',ORG_B,pB,pB,json({visual:{id:'bjob-00001',title:'B job',src:'/api/assets/bjob-00001',status:'pending',createdAt:now,model:'xai/grok-imagine-image-2.0'}}),t,t);
 state.db.raw.prepare("INSERT INTO topaz_jobs(id,org_id,owner,parent_id,status,data,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?)").run('btopaz-0001',ORG_B,pB,'bvisual-001',json({parent:{id:'bvisual-001'},width:1920,height:1080,fingerprint:'x'}),t,t);
});
after(async()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close();console.log('\n'+['| Who | Route | Expected | Got |','|---|---|---|---|',...table.map(r=>`| ${r.who} | ${r.method} ${r.path} | ${r.expected} | ${r.got} |`)].join('\n')+'\n')});
const B={};
function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg}
async function call(method,path,file,{body,params,raw}={}){
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const response=await routes[file][method](new Request(ORIGIN+path,{method,headers,redirect:'manual',...body!==undefined?{body:JSON.stringify(body)}:raw?{body:raw}:{}}),params?{params:Promise.resolve(params)}:undefined);
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,location:response.headers.get('location')};
}
const who=()=>state.user===A1?'A owner':state.user===A2?'A creator':state.user===A3?'A viewer':state.user===S1?'Starter':state.user===T?'Staff':state.user===T0?'Staff, no code':state.user===E1?'Ended':state.user===B1?'B owner':'Nobody';
// Records a row of the route × result table and checks it.
async function expect(method,path,file,opts,check,expected){
 const r=await call(method,path,file,opts);table.push({who:who(),method,path,expected,got:String(r.status)+(r.location?' (redirect)':'')});
 check(r);return r;
}
const leaks=(r)=>{for(const x of ['bvisual-001','bimage-0001','bdeleted-01','bjob-00001','btopaz-0001','bsource-001',B.film,B.swap,B.board])assert.ok(!r.text.includes(x),'leaked '+x)};
const denied=(r)=>{assert.ok([400,403,404].includes(r.status),'status '+r.status+' '+r.text);assert.equal(r.location,null);leaks(r)};

test('V1: a member of company A cannot list, read, download, delete or reuse company B\'s work by guessing ids',async()=>{
 as(A1);
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);leaks(r);assert.ok(r.text.includes('avisual-001'))},'200, none of B');
 await expect('GET','/api/visuals?deleted=1','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);leaks(r)},'200, none of B');
 await expect('GET','/api/visuals/bvisual-001','app/api/visuals/[id]/route.ts',{params:{id:'bvisual-001'}},r=>{assert.equal(r.status,404);leaks(r)},'404');
 await expect('DELETE','/api/visuals/bvisual-001','app/api/visuals/[id]/route.ts',{params:{id:'bvisual-001'}},r=>{assert.equal(r.status,404)},'404');
 assert.equal(await store.head(prefix(ORG_B,B1)+'deleted-visuals/bvisual-001.json'),null,'B\'s visual was not deleted');
 await expect('POST','/api/visuals/bdeleted-01','app/api/visuals/[id]/route.ts',{params:{id:'bdeleted-01'}},r=>{assert.equal(r.status,404)},'404 (restore)');
 assert.ok(await store.head(prefix(ORG_B,B1)+'deleted-visuals/bdeleted-01.json'),'B\'s deleted visual stays deleted');
 await expect('GET','/api/assets/bimage-0001','app/api/assets/[id]/route.ts',{params:{id:'bimage-0001'}},denied,'404, no signed URL');
 await expect('GET','/api/assets/bimage-0001?download=1','app/api/assets/[id]/route.ts',{params:{id:'bimage-0001'}},denied,'404, no signed URL');
 await expect('GET','/api/assets/bvisual-001?original=1','app/api/assets/[id]/route.ts',{params:{id:'bvisual-001'}},denied,'404, no signed URL');
 await expect('GET','/api/area-edits/bvisual-001','app/api/area-edits/[id]/route.ts',{params:{id:'bvisual-001'}},r=>{assert.equal(r.status,200);assert.deepEqual(r.body,{status:'not-found'})},'200 not-found, no data');
 await expect('GET','/api/swap-source/bsource-001','app/api/swap-source/[id]/route.ts',{params:{id:'bsource-001'}},denied,'404, no signed URL');
 await expect('GET','/api/films','app/api/films/route.ts',{},r=>{assert.equal(r.status,200);leaks(r)},'200, none of B');
 await expect('GET','/api/films/'+B.film,'app/api/films/[id]/route.ts',{params:{id:B.film}},denied,'404');
 await expect('PATCH','/api/films/'+B.film,'app/api/films/[id]/route.ts',{params:{id:B.film},body:{title:'mine now'}},denied,'404');
 await expect('GET','/api/films/'+B.film+'/video','app/api/films/[id]/video/route.ts',{params:{id:B.film}},denied,'404');
 for(const action of ['quote','render','refresh','cancel','recover'])await expect('POST','/api/films/'+B.film+'/'+action,'app/api/films/[id]/[action]/route.ts',{params:{id:B.film,action},body:{}},denied,'404');
 await expect('GET','/api/swaps','app/api/swaps/route.ts',{},r=>{assert.equal(r.status,200);leaks(r)},'200, none of B');
 await expect('GET','/api/swaps/'+B.swap,'app/api/swaps/[id]/route.ts',{params:{id:B.swap}},denied,'404');
 await expect('GET','/api/swaps/'+B.swap+'/video','app/api/swaps/[id]/video/route.ts',{params:{id:B.swap}},denied,'404');
 await expect('GET','/api/swaps/'+B.swap+'/diagnostic','app/api/swaps/[id]/diagnostic/route.ts',{params:{id:B.swap}},denied,'404');
 for(const action of ['quote','render','refresh','cancel','recover'])await expect('POST','/api/swaps/'+B.swap+'/'+action,'app/api/swaps/[id]/[action]/route.ts',{params:{id:B.swap,action},body:{}},denied,'404');
 await expect('GET','/api/storyboards','app/api/storyboards/route.ts',{},r=>{assert.equal(r.status,200);leaks(r)},'200, none of B');
 await expect('GET','/api/storyboards/'+B.board,'app/api/storyboards/[id]/route.ts',{params:{id:B.board}},denied,'404');
 await expect('PATCH','/api/storyboards/'+B.board,'app/api/storyboards/[id]/route.ts',{params:{id:B.board},body:{revision:1,title:'mine now'}},denied,'404');
 await expect('GET','/api/storyboards/'+B.board+'/video','app/api/storyboards/[id]/video/route.ts',{params:{id:B.board}},denied,'404');
 for(const action of ['plan','image','render','quote','redo-video'])await expect('POST','/api/storyboards/'+B.board+'/'+action,'app/api/storyboards/[id]/[action]/route.ts',{params:{id:B.board,action},body:{revision:1}},denied,'404');
 for(const action of ['quote','render','refresh','recover','generate'])await expect('POST','/api/image-jobs/bjob-00001/'+action,'app/api/image-jobs/[id]/[action]/route.ts',{params:{id:'bjob-00001',action},body:{}},denied,'404');
 await expect('GET','/api/topaz/jobs?parentId=bvisual-001','app/api/topaz/jobs/route.ts',{},r=>{assert.equal(r.status,200);assert.deepEqual(r.body.jobs,[])},'200, empty');
 await expect('POST','/api/topaz/jobs/btopaz-0001','app/api/topaz/jobs/[id]/route.ts',{params:{id:'btopaz-0001'},body:{}},denied,'404');
 await expect('POST','/api/topaz/jobs','app/api/topaz/jobs/route.ts',{body:{id:'anew-topaz-1',parentId:'bvisual-001',edge:2048}},r=>{assert.ok(r.status>=400);leaks(r);assert.equal(state.db.raw.prepare("SELECT count(*) AS n FROM topaz_jobs WHERE id='anew-topaz-1'").get().n,0)},'refused (503 no key), no job');
 // Reuse: B's images as references for A's new work.
 await expect('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'bimage-0001'}},denied,'400 (reuse)');
 await expect('POST','/api/swaps','app/api/swaps/route.ts',{body:{title:'x',vehicle:'Demo',configurator:'https://configurator.example.com/a/',sourceId:'bsource-001',sourceDuration:8,imageIds:['bimage-0001'],resolution:'480p'}},denied,'400 (reuse)');
 await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{moodId:'bimage-0001'}},denied,'400 (reuse)');
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'anew-visual-1',sourceId:'bimage-0001',moodId:'bimage-0001',brief:'A premium key visual of the car'}},denied,'400 (reuse)');
 await expect('POST','/api/image-jobs','app/api/image-jobs/route.ts',{body:{id:'anew-job-001',sourceId:'bimage-0001',moodId:'bimage-0001',brief:'A premium key visual of the car',size:'2048x1152'}},denied,'4xx (reuse)');
 // The company cookie cannot be pointed at another company.
 as(A1,ORG_B);
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);leaks(r)},'200, still company A');
 await expect('GET','/api/configurators','app/api/configurators/route.ts',{},r=>{assert.equal(r.status,200);assert.ok(!r.text.includes('beta'))},'200, A\'s cars only');
 assert.deepEqual(providerCalls,[],'no provider was called');
});
test('V1: inside one company, a creator sees the library; deletes are the maker\'s or an owner\'s',async()=>{
 as(A2);
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);assert.ok(r.text.includes('avisual-001')&&r.text.includes('avisual-002'));leaks(r)},'200, whole company');
 await expect('GET','/api/assets/avisual-001','app/api/assets/[id]/route.ts',{params:{id:'avisual-001'}},r=>{assert.equal(r.status,307);assert.ok(r.location)},'307 signed URL');
 await expect('DELETE','/api/visuals/avisual-001','app/api/visuals/[id]/route.ts',{params:{id:'avisual-001'}},r=>{assert.equal(r.status,403)},'403 (not the maker)');
 as(A3);
 await expect('DELETE','/api/visuals/avisual-002','app/api/visuals/[id]/route.ts',{params:{id:'avisual-002'}},r=>{assert.equal(r.status,403)},'403 (viewer)');
 as(A1);
 await expect('DELETE','/api/visuals/avisual-002','app/api/visuals/[id]/route.ts',{params:{id:'avisual-002'}},r=>{assert.equal(r.status,200)},'200 (company owner)');
 await expect('POST','/api/visuals/avisual-002','app/api/visuals/[id]/route.ts',{params:{id:'avisual-002'}},r=>{assert.equal(r.status,200)},'200 (restore)');
 assert.deepEqual(state.directory.accepted.includes(A2.id),true,'A2\'s invitation was accepted on first arrival');
});
test('V2: a Starter company cannot call film, swap, storyboard or upscale routes, even with the UI bypassed',async()=>{
 as(S1);
 const plain=(feature,plan)=>r=>{assert.equal(r.status,403);assert.match(r.body.error,new RegExp(`^${feature} is not on your company’s plan\\. It is available on ${plan}; ask Nmesis to add it\\.$`.replace('’','\'')))};
 await expect('GET','/api/films','app/api/films/route.ts',{},plain('Film Studio','Enterprise'),'403 plain reason');
 await expect('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'x-12345678'}},plain('Film Studio','Enterprise'),'403 plain reason');
 await expect('GET','/api/swaps','app/api/swaps/route.ts',{},plain('Car swap','Enterprise'),'403 plain reason');
 await expect('POST','/api/swaps','app/api/swaps/route.ts',{body:{}},plain('Car swap','Enterprise'),'403 plain reason');
 await expect('GET','/api/storyboards','app/api/storyboards/route.ts',{},plain('Storyboards','Enterprise'),'403 plain reason');
 await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{}},plain('Storyboards','Enterprise'),'403 plain reason');
 await expect('POST','/api/topaz/jobs','app/api/topaz/jobs/route.ts',{body:{id:'s-topaz-0001',parentId:'s-visual-01',edge:2048}},plain('Upscale','Growth'),'403 plain reason');
 await expect('POST','/api/upscale-import','app/api/upscale-import/route.ts',{body:{}},plain('Upscale','Growth'),'403 plain reason');
 await expect('POST','/api/pinterest','app/api/pinterest/route.ts',{body:{url:'https://example.test/pin/1'}},plain('Pinterest','Growth'),'403 plain reason');
 await expect('POST','/api/smart-prompts','app/api/smart-prompts/route.ts',{body:{}},plain('Smart references','Growth'),'403 plain reason');
 await expect('POST','/api/connection','app/api/connection/route.ts',{body:{key:'sk-'+'x'.repeat(30)}},plain('Your own provider keys','Enterprise'),'403 plain reason');
 // Body-dependent features and the output cap.
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'s-visual-01',sourceId:'s-source-01',moodId:'s-mood-001',brief:'A premium key visual of the car',size:'3840x2160'}},r=>{assert.equal(r.status,403);assert.match(r.body.error,/up to 2K/)},'403 (4K over a 2K plan)');
 const lineup={layout:'hero',cars:[{id:'c1',name:'One',views:[{id:'s-source-01',title:'v'}]},{id:'c2',name:'Two',views:[{id:'s-source-02',title:'v'}]}]};
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'s-visual-02',sourceId:'s-source-01',moodId:'s-mood-001',brief:'A premium key visual of the car',lineup}},r=>{assert.ok([400,403].includes(r.status));if(r.status===403)assert.match(r.body.error,/^Line-ups/)},'403 (line-ups) or 400 (invalid line-up)');
 assert.deepEqual(providerCalls,[]);
});
test('V3: a viewer can look but not generate, upload or change anything',async()=>{
 as(A3);
 const viewer=r=>{assert.equal(r.status,403);assert.match(r.body.error,/Your role is viewer/)};
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'v-visual-01',sourceId:'avisual-001',moodId:'avisual-001',brief:'A premium key visual of the car'}},viewer,'403 viewer');
 await expect('POST','/api/image-jobs','app/api/image-jobs/route.ts',{body:{}},viewer,'403 viewer');
 await expect('POST','/api/directions','app/api/directions/route.ts',{body:{brief:'A premium key visual'}},viewer,'403 viewer');
 await expect('POST','/api/uploads','app/api/uploads/route.ts',{body:{target:'/api/assets',type:'multipart/form-data; boundary=x',size:10}},viewer,'403 viewer');
 await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{}},viewer,'403 viewer');
 await expect('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'avisual-001'}},viewer,'403 viewer');
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);assert.ok(r.text.includes('avisual-001'))},'200 (can look)');
 assert.deepEqual(providerCalls,[]);
});
test('V4: staff can open any company, read-only with "Viewing as", and it is logged',async()=>{
 as(T,ORG_B);
 const me=await expect('GET','/api/me?page=/','app/api/me/route.ts',{},r=>{assert.equal(r.status,200);assert.equal(r.body.viewingAs,true);assert.equal(r.body.org.id,ORG_B);assert.equal(r.body.org.name,'Company B');assert.equal(r.body.role,'viewer');assert.equal(r.body.staff,true)},'200 viewingAs Company B');
 assert.ok(me.body.orgs.length>=5,'staff can switch to any company');
 const log=state.db.raw.prepare('SELECT org_id,staff_user,path FROM staff_access_log').all().map(r=>({...r}));
 assert.deepEqual(log,[{org_id:ORG_B,staff_user:T.id,path:'/'}]);
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200);assert.ok(r.text.includes('bvisual-001'))},'200 (sees B)');
 await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{}},r=>{assert.equal(r.status,403)},'403 (read-only)');
 as(T,null);
 await expect('GET','/api/me','app/api/me/route.ts',{},r=>{assert.equal(r.status,200);assert.equal(r.body.viewingAs,false);assert.equal(r.body.org.id,ORG_N);assert.equal(r.body.role,'owner')},'200 own workspace');
 assert.equal(state.db.raw.prepare('SELECT count(*) AS n FROM staff_access_log').get().n,1,'the own workspace is not logged as "viewing as"');
});
test('V5: a client\'s configurator list shows only its own live cars; staff see every live car',async()=>{
 const names=r=>r.body.configurators.map(c=>c.name);
 as(A1);await expect('GET','/api/configurators','app/api/configurators/route.ts',{},r=>{assert.equal(r.status,200);assert.deepEqual(names(r),['Demo alpha Model one','Demo alpha Model two']);assert.ok(r.body.configurators.every(c=>c.url.startsWith('https://configurator.example.com/alpha/')))},'200, A\'s 2 cars');
 as(B1);await expect('GET','/api/configurators','app/api/configurators/route.ts',{},r=>{assert.deepEqual(names(r),['Demo beta Model one'])},'200, B\'s 1 car');
 as(S1);await expect('GET','/api/configurators','app/api/configurators/route.ts',{},r=>{assert.deepEqual(names(r),[])},'200, none');
 as(T,ORG_B);await expect('GET','/api/configurators','app/api/configurators/route.ts',{},r=>{assert.equal(names(r).length,4)},'200, all 4 live cars');
});
test('signed out, no company, and an ended subscription',async()=>{
 as(null);await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,401)},'401');
 as(NOBODY);await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,403);assert.equal(r.body.error,'Your account isn\'t linked to a company yet. Ask your administrator.')},'403 no company');
 as(E1);
 await expect('GET','/api/visuals','app/api/visuals/route.ts',{},r=>{assert.equal(r.status,200)},'200 (library, within 30 days)');
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{}},r=>{assert.equal(r.status,403);assert.match(r.body.error,/not active/)},'403 paused');
 await expect('GET','/api/films','app/api/films/route.ts',{},r=>{assert.equal(r.status,403)},'403 paused');
});
// ── S2.1: Nmesis staff and the six-digit code ────────────────────────────────
const MFA='Enter the six-digit code from your authenticator app to continue.';
const apiRoutes=()=>{const files=[];const walk=d=>{for(const n of readdirSync(d)){const p=d+'/'+n;if(statSync(p).isDirectory())walk(p);else if(n==='route.ts')files.push(p)}};walk('app/api');return files.sort()};
test('S2.1: staff without the six-digit code are refused on every API route',async()=>{
 as(T0,ORG_N);let checked=0;const before=state.db.raw.prepare('SELECT count(*) AS n FROM staff_access_log').get().n;
 // Every route outside the sign-in flow itself, plus the company switcher.
 for(const file of apiRoutes().filter(f=>!/^app\/api\/auth\//.test(f)||f==='app/api/auth/org/route.ts')){
  routes[file]??=await import('@/'+file);
  const path='/'+file.replace(/\/route\.ts$/,'').replace(/\[action\]/,'quote').replace(/\[id\]/g,'item-12345678').replace(/^app\//,'');
  for(const method of ['GET','POST','PUT','PATCH','DELETE']){
   if(typeof routes[file][method]!=='function')continue;
   const body=method==='GET'||method==='DELETE'?undefined:{orgId:ORG_N};
   await expect(method,path,file,{params:{id:'item-12345678',action:'quote'},body},r=>{assert.equal(r.status,401,method+' '+path+' '+r.text);assert.equal(r.body.error,MFA,method+' '+path)},'401 code needed');
   checked++;
  }
 }
 assert.ok(checked>55,'checked '+checked);
 assert.equal(state.db.raw.prepare('SELECT count(*) AS n FROM staff_access_log').get().n,before,'nothing was logged or opened');
 assert.deepEqual(providerCalls,[]);
 // A client person is never asked for a code.
 as(A1);await expect('GET','/api/me','app/api/me/route.ts',{},r=>{assert.equal(r.status,200)},'200 (password only)');
});
test('S2.1: staff with the code cannot write in a client workspace, and can in Nmesis\'s own',async()=>{
 as(T,ORG_B);
 const readOnly=r=>{assert.equal(r.status,403);assert.match(r.body.error,/Your role is viewer/)};
 await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{title:'staff story'}},readOnly,'403 read-only');
 await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'staff-visual-1',sourceId:'bvisual-001',moodId:'bvisual-001',brief:'A premium key visual of the car'}},readOnly,'403 read-only');
 await expect('DELETE','/api/visuals/bvisual-001','app/api/visuals/[id]/route.ts',{params:{id:'bvisual-001'}},readOnly,'403 read-only');
 await expect('POST','/api/films','app/api/films/route.ts',{body:{sourceId:'bimage-0001'}},readOnly,'403 read-only');
 assert.equal(await store.head(prefix(ORG_B,B1)+'deleted-visuals/bvisual-001.json'),null,'B\'s visual was not deleted');
 as(T,ORG_N);
 const board=await expect('POST','/api/storyboards','app/api/storyboards/route.ts',{body:{title:'Nmesis story'}},r=>{assert.equal(r.status,200,r.text)},'200 (owner)');
 const row=state.db.raw.prepare('SELECT org_id,owner FROM storyboards WHERE id=?').get(board.body.board.id);
 assert.deepEqual({...row},{org_id:ORG_N,owner:prefix(ORG_N,T)});
 assert.deepEqual(providerCalls,[]);
});
test('S2.1: the switcher has Nmesis and Clients sections for staff only',async()=>{
 as(T,ORG_N);
 await expect('GET','/api/me','app/api/me/route.ts',{},r=>{assert.equal(r.status,200);assert.equal(r.body.staff,true);assert.deepEqual(r.body.switcher.nmesis,[{id:ORG_N,name:'Nmesis'}]);assert.deepEqual(r.body.switcher.clients.map(o=>o.name).sort(),['Company A','Company B','Ended Co','Starter Co'])},'200, two sections');
 for(const member of [A1,B1,S1]){
  as(member);
  await expect('GET','/api/me','app/api/me/route.ts',{},r=>{assert.equal(r.status,200);assert.equal(r.body.staff,false);assert.equal(r.body.switcher,null);assert.ok(r.body.orgs.every(o=>o.id!==ORG_N),'no Nmesis workspace');assert.ok(!r.text.includes('Nmesis'),'no staff section');assert.equal(r.body.orgs.length,1)},'200, own company only');
 }
});
test('S2.1: the company deep link is checked on the server',async()=>{
 const open=async(org)=>{state.cookies=new Map();const r=await call('GET','/auth/open?org='+encodeURIComponent(org),'app/auth/open/route.ts');return {...r,cookie:state.cookies.get('studio_org')?.value}};
 routes['app/auth/open/route.ts']??=await import('@/app/auth/open/route.ts');
 as(A1);
 let r=await open(ORG_B);table.push({who:who(),method:'GET',path:'/?org=<B>',expected:'refused',got:r.location});
 assert.equal(r.status,303);assert.equal(r.location,ORIGIN+'/?opened=refused');assert.equal(r.cookie,undefined,'no company was opened');
 r=await open(ORG_N);assert.equal(r.location,ORIGIN+'/?opened=refused');assert.equal(r.cookie,undefined,'not Nmesis\'s workspace either');
 r=await open('not-a-company');assert.equal(r.location,ORIGIN+'/?opened=refused');assert.equal(r.cookie,undefined);
 r=await open(ORG_A);table.push({who:who(),method:'GET',path:'/?org=<A>',expected:'own company',got:r.location});
 assert.equal(r.location,ORIGIN+'/');assert.equal(r.cookie,ORG_A);
 as(T);r=await open(ORG_B);table.push({who:who(),method:'GET',path:'/?org=<B>',expected:'viewing as',got:r.location});
 assert.equal(r.location,ORIGIN+'/');assert.equal(r.cookie,ORG_B);
 as(T0);r=await open(ORG_B);table.push({who:who(),method:'GET',path:'/?org=<B>',expected:'code first',got:r.location});
 assert.equal(r.location,ORIGIN+'/auth/code?next='+encodeURIComponent('/?org='+ORG_B));assert.equal(r.cookie,undefined);
 as(null);r=await open(ORG_B);assert.equal(r.location,ORIGIN+'/signin?next='+encodeURIComponent('/?org='+ORG_B));
 // The switcher refuses the same way.
 routes['app/api/auth/org/route.ts']??=await import('@/app/api/auth/org/route.ts');
 as(A1);state.cookies=new Map();
 await expect('POST','/api/auth/org','app/api/auth/org/route.ts',{body:{orgId:ORG_B}},r=>{assert.equal(r.status,403);assert.equal(state.cookies.get('studio_org'),undefined)},'403');
});
// ── S2.1: hosted-run fixes at the route level ────────────────────────────────
test('S2.1: OpenAI with no credit: the generation fails at once with a plain sentence and reserves nothing',async()=>{
 as(A1);providerCalls.length=0;
 providerAnswer=async u=>{assert.match(u,/^https:\/\/api\.openai\.com\/v1\/images\/edits$/);return Response.json({error:{message:'You exceeded your current quota, please check your plan and billing details.',type:'insufficient_quota',code:'insufficient_quota'}},{status:429})};
 const budgets=()=>state.db.raw.prepare("SELECT (SELECT count(*) FROM film_budgets) + (SELECT count(*) FROM image_jobs WHERE reserved_day IS NOT NULL) + (SELECT count(*) FROM films WHERE reserved_day IS NOT NULL) + (SELECT count(*) FROM swap_jobs WHERE reserved_day IS NOT NULL) AS n").get().n;
 const before=budgets();
 try{
  const said='Your OpenAI account has no credit left. Add credit at OpenAI, then try again. Nothing was charged here.';
  await expect('POST','/api/generate','app/api/generate/route.ts',{body:{id:'nocredit-0001',sourceId:'avisual-001',moodId:'avisual-001',brief:'A premium key visual of the car'}},r=>{assert.equal(r.status,402);assert.equal(r.body.error,said)},'402 no credit');
  const record=await (await store.get(prefix(ORG_A,A1)+'visuals/nocredit-0001.json')).json();
  assert.equal(record.status,'failed','nothing stays running');assert.equal(record.error,said);
  await expect('GET','/api/visuals/nocredit-0001','app/api/visuals/[id]/route.ts',{params:{id:'nocredit-0001'}},r=>{assert.equal(r.status,200);assert.equal(r.body.visual.status,'failed')},'200 failed');
  assert.equal(providerCalls.length,1,'one request, no retry');assert.equal(budgets(),before,'no budget row or reservation');
 }finally{providerAnswer=null;providerCalls.length=0}
});
test('S2.1: a malformed KEY_ENCRYPTION_SECRET answers 503 "Secure key storage is misconfigured." and logs the rule once, never the value',async()=>{
 const good=process.env.KEY_ENCRYPTION_SECRET,bad='not-hex-'+'z'.repeat(40),lines=[],error=console.error;
 console.error=(...a)=>lines.push(a.map(String).join(' '));
 try{
  process.env.KEY_ENCRYPTION_SECRET=bad;as(A1);
  for(let i=0;i<2;i++)await expect('POST','/api/connection','app/api/connection/route.ts',{body:{key:'sk-'+'x'.repeat(30)}},r=>{assert.equal(r.status,503);assert.equal(r.body.error,'Secure key storage is misconfigured.')},'503 misconfigured');
  const said=lines.filter(l=>l.includes('KEY_ENCRYPTION_SECRET'));
  assert.equal(said.length,1,'one log line per process');assert.match(said[0],/exactly 64 hex characters \(32 bytes\)/);
  assert.ok(lines.every(l=>!l.includes(bad)),'the value is never logged');
  assert.deepEqual(providerCalls,[],'the key was not sent anywhere');
 }finally{console.error=error;process.env.KEY_ENCRYPTION_SECRET=good}
});
