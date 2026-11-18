// The company's brand kit (lib/brand-kit.ts, app/api/brand-kit/**, migration
// 0010): the checks, the routes against the real handlers (SQLite built from
// the migrations, the local S3 stand-in, the real company resolution) and the
// migration's shape. tests/postgres.test.mjs runs the tables under row level
// security and the environment rule.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {studioSchemaSql} from './sqlite-schema.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0xa),ORG_B=id(0xb),ORG_N=id(0x1);
const OWNER={id:id(0xa1),email:'owner@example.test'},CREATOR={id:id(0xa2),email:'creator@example.test'},VIEWER={id:id(0xa3),email:'viewer@example.test'};
const B_OWNER={id:id(0xb1),email:'b-owner@example.test'},STAFF={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const features={'studio.enabled':true,'studio.max_output':'8k','studio.key_visuals':true};
const full={legacy:false,status:'active',planId:'enterprise',planName:'Enterprise',endsOn:null,features};
const ORIGIN='http://studio.test';
const ROUTES={kit:'app/api/brand-kit/route.ts',logos:'app/api/brand-kit/logos/route.ts',logo:'app/api/brand-kit/logos/[id]/route.ts'};
let s3,store,kit,routes={};const realFetch=globalThis.fetch;

before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('Network calls are not allowed in this test: '+u)};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Demo Company A',kind:'client'},{id:ORG_B,name:'Demo Company B',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:OWNER.id,orgId:ORG_A,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG_A,role:'creator',status:'active'},{userId:VIEWER.id,orgId:ORG_A,role:'viewer',status:'active'},{userId:B_OWNER.id,orgId:ORG_B,role:'owner',status:'active'}],
  staff:{[STAFF.id]:'ops'},
  entitlements:{[ORG_A]:full,[ORG_B]:full,[ORG_N]:{legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}}},
  grants:{[ORG_A]:Date.now()+86_400_000},
 });
 kit=await import('@/lib/brand-kit.ts');
 for(const p of Object.values(ROUTES))routes[p]=await import('@/'+p);
 store=(await import('@/lib/portable/storage.ts')).getStorage();
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});

function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg;state.chosenBrand=null}
async function call(method,path,file,{body,form,params}={}){
 const headers={origin:ORIGIN};if(body!==undefined)headers['content-type']='application/json';
 const init={method,headers,redirect:'manual',...body!==undefined?{body:JSON.stringify(body)}:form?{body:form}:{}};
 const response=await routes[file][method](new Request(ORIGIN+path,init),params?{params:Promise.resolve(params)}:undefined);
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,location:response.headers.get('location')};
}
const png=()=>{const b=Buffer.alloc(64);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(400,16);b.writeUInt32BE(200,20);return b};
function logoForm(bytes,fileName='demo-logo.png',name){const f=new FormData();f.set('logo',new File([bytes],fileName,{type:'image/png'}));if(name!==undefined)f.set('name',name);return f}
const upload=(form)=>call('POST','/api/brand-kit/logos',ROUTES.logos,{form});
const logoPath=lid=>'/api/brand-kit/logos/'+lid;

// ── The checks ──────────────────────────────────────────────────────────
test('brand kit checks: hex colours, at most 8, names, fonts from the list, one-line voice',()=>{
 assert.equal(kit.cleanHex('1a2b3c'),'#1A2B3C');
 assert.equal(kit.cleanHex(' #abc '),'#AABBCC');
 for(const bad of ['#12345','#GGGGGG','red','',null,123,'#1234567'])assert.equal(kit.cleanHex(bad),null,String(bad));
 const ok=kit.parseKit({colours:[{hex:'0a84ff',name:'  Demo   blue '},{hex:'#FFF'}],headingFont:'Playfair Display',bodyFont:'System',voice:'Confident,\n warm   and precise.'});
 assert.equal(ok.ok,true);
 assert.deepEqual(ok.fields,{colours:[{hex:'#0A84FF',name:'Demo blue'},{hex:'#FFFFFF',name:''}],headingFont:'Playfair Display',bodyFont:'System',voice:'Confident, warm and precise.'});
 assert.deepEqual(kit.parseKit({}),{ok:true,fields:{}},'a field left out keeps its value');
 const no=(input,re)=>{const r=kit.parseKit(input);assert.equal(r.ok,false,JSON.stringify(input));assert.match(r.error,re)};
 no({colours:Array.from({length:9},()=>({hex:'#000000'}))},/up to 8 colours/);
 no({colours:[{hex:'#00000G'}]},/Colour 1 isn’t a hex colour/);
 no({colours:'#000000'},/list/);
 no({colours:[{hex:'#000000',name:'x'.repeat(41)}]},/at most 40/);
 no({colours:[{hex:'#000000',name:7}]},/isn’t text/);
 no({headingFont:'Comic Demo'},/heading font/);
 no({bodyFont:''},/body font/);
 no({voice:'x'.repeat(201)},/up to 200 characters/);
 no({voice:42},/must be text/);
 assert.deepEqual(kit.parseLogoName('  Demo   mark '),{ok:true,value:'Demo mark'});
 assert.equal(kit.parseLogoName('   ').ok,false);
 assert.equal(kit.parseLogoName('x'.repeat(61)).ok,false);
 assert.deepEqual(kit.uploadName(null,'demo-logo.png'),{ok:true,value:'demo-logo'});
 assert.deepEqual(kit.uploadName('',''),{ok:true,value:'Logo'});
 assert.deepEqual(kit.uploadName('Wordmark','x.webp'),{ok:true,value:'Wordmark'});
 assert.equal(kit.logoKey(ORG_A,'logo-0001'),`orgs/${ORG_A}/brand/logos/logo-0001`);
 assert.equal(kit.logoFilename('Demo Wordmark (dark)','image/webp'),'demo-wordmark-dark.webp');
 // Owners and creators edit; viewers and staff viewing a client never do.
 assert.equal(kit.mayEditBrand({role:'owner',account:{viewingAs:false}}),true);
 assert.equal(kit.mayEditBrand({role:'creator',account:{viewingAs:false}}),true);
 assert.equal(kit.mayEditBrand({role:'viewer',account:{viewingAs:false}}),false);
 assert.equal(kit.mayEditBrand({role:'owner',account:{viewingAs:true}}),false);
});

test('before migration 0010 the kit reads as empty (ready: false) and changes say it is not available yet',async()=>{
 const missing={prepare:()=>({bind(){return this},first:async()=>{throw new Error('no such table: brand_kits')},all:async()=>{throw new Error('relation "brand_logos" does not exist')},run:async()=>{throw new Error('no such table: brand_kits')}})};
 const empty=await kit.readKit(missing,ORG_A);
 assert.equal(empty.ready,false);assert.deepEqual(empty.logos,[]);assert.deepEqual(empty.colours,[]);
 await assert.rejects(()=>kit.saveKit(missing,ORG_A,OWNER.id,{voice:'Later.'}),e=>e instanceof kit.BrandKitError&&e.status===503);
 await assert.rejects(()=>kit.findLogo(missing,ORG_A,'logo-0001'),e=>e.status===503);
 // Any other database failure is a real one and is not hidden.
 const broken={prepare:()=>({bind(){return this},first:async()=>{throw new Error('connection reset')},all:async()=>({results:[]})})};
 await assert.rejects(()=>kit.readKit(broken,ORG_A),/connection reset/);
});

// ── The routes ──────────────────────────────────────────────────────────
test('colours, fonts and voice: owners and creators save, viewers and staff read only, never another company',async()=>{
 as(VIEWER);
 let r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.equal(r.status,200,r.text);
 assert.deepEqual(r.body.kit,{ready:true,colours:[],headingFont:'System',bodyFont:'System',voice:'',logos:[],updatedAt:null});
 r=await call('PUT','/api/brand-kit',ROUTES.kit,{body:{voice:'Viewer words.'}});
 assert.equal(r.status,403);assert.match(r.body.error,/Your role is viewer/);

 as(OWNER);
 // The body's company is ignored: the kit is always the signed-in person's own.
 r=await call('PUT','/api/brand-kit',ROUTES.kit,{body:{orgId:ORG_B,colours:[{hex:'0a84ff',name:'Demo blue'},{hex:'#111'}],headingFont:'Outfit',bodyFont:'Inter',voice:'Confident, warm and precise.'}});
 assert.equal(r.status,200,r.text);
 assert.deepEqual(r.body.kit.colours,[{hex:'#0A84FF',name:'Demo blue'},{hex:'#111111',name:''}]);
 assert.equal(r.body.kit.headingFont,'Outfit');assert.equal(r.body.kit.bodyFont,'Inter');
 assert.ok(r.body.kit.updatedAt>0);
 const row=state.db.raw.prepare('SELECT org_id,updated_by,colours FROM brand_kits').all().map(x=>({...x}));
 assert.deepEqual(row,[{org_id:ORG_A,updated_by:OWNER.id,colours:JSON.stringify([{hex:'#0A84FF',name:'Demo blue'},{hex:'#111111',name:''}])}]);

 as(CREATOR);
 r=await call('PUT','/api/brand-kit',ROUTES.kit,{body:{voice:'Calm and exact.'}});
 assert.equal(r.status,200,r.text);
 assert.equal(r.body.kit.voice,'Calm and exact.');
 assert.equal(r.body.kit.colours.length,2,'a field left out keeps its value');
 for(const body of [{colours:[{hex:'blue'}]},{headingFont:'Not a font'},{voice:'x'.repeat(201)},{colours:Array.from({length:9},()=>({hex:'#000000'}))}]){
  r=await call('PUT','/api/brand-kit',ROUTES.kit,{body});
  assert.equal(r.status,400,JSON.stringify(body)+' '+r.text);
 }

 as(VIEWER);
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.equal(r.body.kit.voice,'Calm and exact.','everyone in the company reads it');

 as(B_OWNER);
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.equal(r.status,200);assert.deepEqual(r.body.kit.colours,[]);assert.equal(r.body.kit.voice,'');

 // Nmesis staff viewing the client (with its support grant) read it and change nothing.
 as(STAFF,ORG_A);
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.equal(r.status,200);assert.equal(r.body.kit.voice,'Calm and exact.');
 r=await call('PUT','/api/brand-kit',ROUTES.kit,{body:{voice:'Staff words.'}});
 assert.equal(r.status,403);
});

test('logos: upload checks the bytes, the link is signed and the company’s own, rename and remove',async()=>{
 as(OWNER);
 let r=await upload(logoForm(Buffer.from('this is not a picture at all'),'fake.png'));
 assert.equal(r.status,400);assert.match(r.body.error,/Only PNG, JPEG and WebP/);
 r=await upload(new FormData());
 assert.equal(r.status,400);
 assert.equal(state.db.raw.prepare('SELECT COUNT(*) AS n FROM brand_logos').get().n,0,'nothing saved');

 r=await upload(logoForm(png(),'demo-wordmark.png'));
 assert.equal(r.status,200,r.text);
 const logo=r.body.logo;
 assert.equal(logo.name,'demo-wordmark');assert.equal(logo.type,'image/png');assert.equal(logo.url,logoPath(logo.id));
 const key=`orgs/${ORG_A}/brand/logos/${logo.id}`;
 const head=await store.head(key);
 assert.ok(head,'stored under the company');assert.equal(head.httpMetadata.contentType,'image/png');

 as(VIEWER);
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.deepEqual(r.body.kit.logos.map(l=>l.id),[logo.id]);
 r=await call('GET',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,307,r.text);assert.ok(r.location.startsWith(s3.url),'a signed storage link');
 r=await call('GET',logoPath(logo.id)+'?download=1',ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,307);assert.match(decodeURIComponent(r.location),/attachment; filename="demo-wordmark\.png"/);
 r=await upload(logoForm(png()));
 assert.equal(r.status,403);assert.match(r.body.error,/Your role is viewer/);
 r=await call('DELETE',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,403);

 // Another company: the id reads as not found, and nothing changes.
 as(B_OWNER);
 for(const method of ['GET','DELETE']){
  r=await call(method,logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
  assert.equal(r.status,404,method+' '+r.text);assert.equal(r.location,null);
 }
 r=await call('PATCH',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id},body:{name:'Taken'}});
 assert.equal(r.status,404);
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.deepEqual(r.body.kit.logos,[]);
 assert.ok(await store.head(key),'still stored');

 as(CREATOR);
 r=await call('PATCH',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id},body:{name:'  Demo   wordmark '}});
 assert.equal(r.status,200,r.text);assert.equal(r.body.logo.name,'Demo wordmark');
 r=await call('PATCH',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id},body:{name:' '}});
 assert.equal(r.status,400);
 r=await call('GET',logoPath('not a valid id'),ROUTES.logo,{params:{id:'not a valid id'}});
 assert.equal(r.status,404);

 r=await call('DELETE',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,200,r.text);
 assert.equal(await store.head(key),null,'the picture is deleted');
 r=await call('GET',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,404);
 r=await call('DELETE',logoPath(logo.id),ROUTES.logo,{params:{id:logo.id}});
 assert.equal(r.status,404,'removing twice');
 r=await call('GET','/api/brand-kit',ROUTES.kit);
 assert.deepEqual(r.body.kit.logos,[]);
});

test('logos: at most 12 per company, a typed name, and 5 MB each',async()=>{
 as(OWNER);
 const now=Date.now();
 for(let i=0;i<11;i++)state.db.raw.prepare('INSERT INTO brand_logos(id,org_id,name,content_type,size,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run('seed-logo-'+i,ORG_A,'Seed '+i,'image/png',64,OWNER.id,now+i);
 let r=await upload(logoForm(png(),'twelfth.png','  The twelfth '));
 assert.equal(r.status,200,r.text);assert.equal(r.body.logo.name,'The twelfth');
 r=await upload(logoForm(png(),'thirteenth.png'));
 assert.equal(r.status,409);assert.match(r.body.error,/12 logos/);
 // The full kit is checked before anything is stored.
 assert.equal((await store.list({prefix:`orgs/${ORG_A}/brand/logos/`})).objects.length,1);
 // Two uploads at once: the row's own insert refuses the thirteenth too.
 assert.equal(await kit.addLogo(state.db,{id:'late-logo-01',org:ORG_A,name:'Late',type:'image/png',size:64,userId:OWNER.id}),null);
 assert.ok(await kit.addLogo(state.db,{id:'b-logo-0001',org:ORG_B,name:'B',type:'image/png',size:64,userId:B_OWNER.id}),'another company has its own 12');
 // Room again after one goes; a file over 5 MB is refused.
 r=await call('DELETE',logoPath('seed-logo-0'),ROUTES.logo,{params:{id:'seed-logo-0'}});
 assert.equal(r.status,200,r.text);
 const big=Buffer.alloc(5_000_001);big.set(png());
 r=await upload(logoForm(big,'big.png'));
 assert.equal(r.status,413);assert.match(r.body.error,/5 MB/);
 assert.equal(state.db.raw.prepare('SELECT COUNT(*) AS n FROM brand_logos WHERE org_id=? AND deleted_at IS NULL').get(ORG_A).n,11);
});

test('the brand kit routes are in the route table; a viewer cannot write to them',async()=>{
 const {routeRule,checkRoute}=await import('@/lib/accounts/plan.ts');
 const viewer={role:'viewer',entitlements:full};
 for(const [path,method] of [['/api/brand-kit','GET'],['/api/brand-kit','PUT'],['/api/brand-kit/logos','POST'],['/api/brand-kit/logos/logo-0001','GET'],['/api/brand-kit/logos/logo-0001','PATCH'],['/api/brand-kit/logos/logo-0001','DELETE']]){
  assert.ok(routeRule(path,method),method+' '+path);
  if(method==='GET')assert.doesNotThrow(()=>checkRoute(viewer,path,method));
  else assert.throws(()=>checkRoute(viewer,path,method),/viewer/i,method+' '+path);
 }
});

// ── The migration ───────────────────────────────────────────────────────
test('migration 0010: idempotent, per environment, forced row level security, nothing for anyone else',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/0010_brand_kits.sql',import.meta.url),'utf8');
 for(const t of ['brand_kits','brand_logos'])assert.match(sql,new RegExp(`create table if not exists studio\\.${t} \\(`));
 assert.match(sql,/create index if not exists brand_logos_env_org_created/);
 assert.match(sql,/primary key \(environment, org_id\)/);
 assert.equal((sql.match(/environment text not null default 'production'/g)||[]).length,2);
 assert.match(sql,/array\['brand_kits', 'brand_logos'\]/);
 assert.match(sql,/alter column environment set default studio\.request_env\(\)/);
 assert.match(sql,/_environment_ck/);
 assert.match(sql,/enable row level security/);assert.match(sql,/force row level security/);
 assert.match(sql,/drop policy if exists member_orgs/);assert.match(sql,/create policy member_orgs/);
 assert.match(sql,/revoke all on studio\.brand_kits from public/);assert.match(sql,/revoke all on studio\.brand_logos from public/);
 assert.match(sql,/'anon', 'authenticated'/);
 assert.match(sql,/if not exists \(select 1 from pg_constraint where conname = 'brand_logos_type_ck'\)/);
 // Every create is "if not exists"; no table is dropped.
 assert.doesNotMatch(sql,/create table (?!if not exists)/i);assert.doesNotMatch(sql,/drop table/i);
 // The SQLite stand-in builds both tables from it.
 const db=new DatabaseSync(':memory:');db.exec(studioSchemaSql());
 const cols=t=>db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);
 assert.deepEqual(cols('brand_kits'),['environment','org_id','colours','heading_font','body_font','voice','updated_by','updated_at']);
 assert.deepEqual(cols('brand_logos'),['id','org_id','name','content_type','size','created_by','created_at','deleted_at','environment']);
 db.close();
});
