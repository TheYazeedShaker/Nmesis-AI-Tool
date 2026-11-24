// The company's own fonts (lib/brand-fonts/**, app/api/brand-fonts/**): the
// sanitiser on synthetic "Demo Sans" files in every format, and the routes
// against the real handlers (SQLite built from the migrations, the local S3
// stand-in, the real company resolution and plan rules). tests/postgres.test.mjs
// runs the table under row level security; check:ui runs upload, pick, type,
// export and delete in a browser.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {state,sqliteDatabase,memoryDirectory} from './support/state.mjs';
import {startS3} from '../scripts/verify/s3-standin.mjs';
import * as fx from './support/font-fixtures.mjs';
import fontverter from 'fontverter';
register('../scripts/verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{
 '@/lib/studio-context':new URL('./support/stub-context.mjs',import.meta.url).href,
 '@/lib/portable/database':new URL('./support/stub-database.mjs',import.meta.url).href,
 '@/lib/accounts/directory':new URL('./support/stub-directory.mjs',import.meta.url).href,
 'next/headers':new URL('./support/stub-headers.mjs',import.meta.url).href,
}}});

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORG_A=id(0xa),ORG_B=id(0xb),ORG_C=id(0xc),ORG_N=id(0x1);
const OWNER={id:id(0xa1),email:'owner@example.test'},CREATOR={id:id(0xa2),email:'creator@example.test'},VIEWER={id:id(0xa3),email:'viewer@example.test'};
const B_OWNER={id:id(0xb1),email:'b-owner@example.test'},C_OWNER={id:id(0xc1),email:'c-owner@example.test'},STAFF={id:id(0x71),email:'staff@example.test',aal:'aal2'};
const features={'studio.enabled':true,'studio.key_visuals':true,'studio.brand_fonts':true};
const plan=f=>({legacy:false,status:'active',planId:'growth',planName:'Growth',endsOn:null,features:f});
const ORIGIN='http://studio.test';
const ROUTES={fonts:'app/api/brand-fonts/route.ts',font:'app/api/brand-fonts/[id]/route.ts',file:'app/api/brand-fonts/[id]/font/route.ts',preview:'app/api/brand-fonts/[id]/preview/route.ts',uploads:'app/api/uploads/route.ts',recent:'app/api/account/recent/route.ts'};
const LICENCE='I confirm my company holds a licence that allows this font to be used in our designs and exports.';
let s3,store,san,sfnt,shared,demo,routes={};const realFetch=globalThis.fetch;

before(async()=>{
 s3=await startS3();
 Object.assign(process.env,{S3_REGION:'eu-central-1',S3_BUCKET:'studio-test',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)});
 globalThis.fetch=async(url,init)=>{const u=String(url instanceof Request?url.url:url);if(u.startsWith(s3.url))return realFetch(url,init);throw new Error('Network calls are not allowed in this test: '+u)};
 state.db=sqliteDatabase();
 state.directory=memoryDirectory({
  orgs:[{id:ORG_A,name:'Demo Company A',kind:'client'},{id:ORG_B,name:'Demo Company B',kind:'client'},{id:ORG_C,name:'Demo Company C',kind:'client'},{id:ORG_N,name:'Nmesis',kind:'internal'}],
  members:[{userId:OWNER.id,orgId:ORG_A,role:'owner',status:'active'},{userId:CREATOR.id,orgId:ORG_A,role:'creator',status:'active'},{userId:VIEWER.id,orgId:ORG_A,role:'viewer',status:'active'},
   {userId:B_OWNER.id,orgId:ORG_B,role:'owner',status:'active'},{userId:C_OWNER.id,orgId:ORG_C,role:'owner',status:'active'}],
  staff:{[STAFF.id]:'ops'},
  // Company C's plan has no brand-fonts key (as every plan until the owner adds it).
  entitlements:{[ORG_A]:plan(features),[ORG_B]:plan(features),[ORG_C]:plan({'studio.enabled':true,'studio.key_visuals':true}),[ORG_N]:{legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}}},
  grants:{[ORG_A]:Date.now()+86_400_000},
 });
 san=await import('@/lib/brand-fonts/sanitise.ts');sfnt=await import('@/lib/brand-fonts/sfnt.ts');shared=await import('@/lib/brand-fonts/shared.ts');
 for(const p of Object.values(ROUTES))routes[p]=await import('@/'+p);
 store=(await import('@/lib/portable/storage.ts')).getStorage();
 demo=await fx.demoSans();
});
after(()=>{globalThis.fetch=realFetch;s3?.server.closeAllConnections();s3?.server.close()});

function as(user,chosenOrg=null){state.user=user;state.chosenOrg=chosenOrg;state.chosenBrand=null}
async function call(method,path,file,{body,form,params,headers:extra}={}){
 const headers={origin:ORIGIN,...extra};if(body!==undefined)headers['content-type']='application/json';
 const init={method,headers,redirect:'manual',...body!==undefined?{body:JSON.stringify(body)}:form?{body:form}:{}};
 const response=await routes[file][method](new Request(ORIGIN+path,init),params?{params:Promise.resolve(params)}:undefined);
 const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{parsed=text}
 return {status:response.status,body:parsed,text,location:response.headers.get('location')};
}
function fontForm(bytes,name,{licence=true,version=shared?.LICENCE_VERSION}={}){
 const f=new FormData();f.set('font',new File([bytes],name,{type:'application/octet-stream'}));
 if(licence)f.set('licence','confirmed');if(version)f.set('licenceVersion',version);return f;
}
const upload=(bytes,name,opts)=>call('POST','/api/brand-fonts',ROUTES.fonts,{form:fontForm(bytes,name,opts)});
const list=()=>call('GET','/api/brand-fonts',ROUTES.fonts);
const rows=()=>state.db.raw.prepare('SELECT * FROM brand_fonts ORDER BY created_at,id').all().map(r=>({...r}));
const stored=async prefix=>(await store.list({prefix})).objects.map(o=>o.key).sort();
const wipe=async()=>{state.db.raw.exec('DELETE FROM brand_fonts');for(const org of [ORG_A,ORG_B,ORG_C,ORG_N]){const keys=await stored(`orgs/${org}/brand/fonts/`);if(keys.length)await store.delete(keys)}};
const tablesIn=async woff2=>fx.tablesOf(await fontverter.convert(Buffer.from(woff2),'sfnt','woff2')).tables;

// ── The sanitiser ───────────────────────────────────────────────────────
test('each format is read by its content and comes out as a sanitised WOFF2: OTF (CFF), TTF, WOFF, WOFF2',async()=>{
 const files={otf:fx.demoOtf(),ttf:demo.regular,woff:await fx.toWoff(demo.regular),woff2:await fx.toWoff2(demo.regular)};
 for(const [format,bytes] of Object.entries(files)){
  const r=await san.sanitiseFont(new Uint8Array(bytes));
  assert.equal(r.ok,true,format+': '+(r.reason||''));
  assert.equal(r.format,format);
  assert.equal(r.info.family,'Demo Sans');assert.equal(r.info.style,'Regular');assert.equal(r.info.weight,400);assert.equal(r.info.italic,false);
  assert.equal(r.embedding,'installable');
  assert.equal(sfnt.containerOf(r.woff2),'woff2','browsers get WOFF2');
  assert.deepEqual([...(await tablesIn(r.woff2)).keys()].filter(t=>!san.KEPT_TABLES.includes(t)),[],format+': only the kept tables');
  assert.equal(sfnt.containerOf(r.preview),'woff2');assert.ok(r.preview.byteLength<r.woff2.byteLength||format==='otf','the preview is small');
  assert.deepEqual(r.original,new Uint8Array(bytes),'the original is kept as uploaded (for PDF export later)');
  assert.match(r.sha256,/^[0-9a-f]{64}$/);
 }
});

test('a broken font is refused with a plain reason: cut short, garbage after a font signature, a picture renamed, a collection',async()=>{
 const garbage=Buffer.concat([Buffer.from([0,1,0,0,0,9]),Buffer.alloc(400,7)]);
 const png=Buffer.from([137,80,78,71,13,10,26,10,...Buffer.alloc(64)]);
 const ttc=Buffer.concat([Buffer.from('ttcf'),Buffer.alloc(60)]);
 // A font whose glyph table is noise: the directory reads, HarfBuzz must not pass it through.
 const noisy=fx.withTable(demo.regular,'glyf',Buffer.alloc(20000,0xff));
 for(const [what,bytes,code] of [['cut short',demo.italic.subarray(0,demo.italic.length/2),'unreadable'],['garbage',garbage,'unreadable'],['a picture',png,'unreadable'],['a collection',ttc,'collection'],['noise for glyphs',noisy,null]]){
  const r=await san.sanitiseFont(new Uint8Array(bytes));
  if(code===null){
   // HarfBuzz rebuilds what it can parse: noise never reaches a browser as it was.
   if(r.ok)assert.notDeepEqual(Buffer.from((await tablesIn(r.woff2)).get('glyf')||[]),Buffer.alloc(20000,0xff),what+': the noise is not passed through');
   continue;
  }
  assert.equal(r.ok,false,what);assert.equal(r.code,code,what);
  assert.equal(r.reason,san.REASONS[code]);assert.doesNotMatch(r.reason,/OTS|HarfBuzz|sfnt|table/i,'plain words');
 }
 assert.equal((await san.sanitiseFont(new Uint8Array(san.MAX_FONT_BYTES+1))).code,'too-large');
});

test('the font’s own embedding permission (OS/2 fsType): restricted and bitmap-only are refused; preview & print and editable are allowed and shown',async()=>{
 const cases=[[0x0000,'installable',true],[0x0002,'restricted',false],[0x0004,'preview-print',true],[0x0008,'editable',true],[0x000c,'editable',true],[0x0006,'preview-print',true],[0x0200,'restricted',false],[0x0104,'preview-print',true]];
 for(const [fsType,embedding,ok] of cases){
  const r=await san.sanitiseFont(new Uint8Array(fx.withFsType(demo.regular,fsType)));
  assert.equal(r.ok,ok,`fsType ${fsType}`);
  if(ok)assert.equal(r.embedding,embedding,`fsType ${fsType}`);
  else{assert.equal(r.code,fsType&0x0200?'bitmap-only':'restricted');assert.equal(r.info.family,'Demo Sans','a refusal still says which font')}
 }
 // No subsetting (bit 8): the preview is the whole font, never a subset of it.
 const whole=await san.sanitiseFont(new Uint8Array(fx.withFsType(demo.regular,0x0100)));
 assert.deepEqual(whole.preview,whole.woff2);
 assert.equal(shared.EMBEDDING_LABELS['preview-print'],'Preview & print');
});

test('a font with extra tables comes out without them: an unknown table, an SVG table with a script, a signature, hinting programs',async()=>{
 let bytes=fx.withTable(demo.regular,'ZZZZ',Buffer.from('<script>alert(1)</script>'));
 bytes=fx.withTable(bytes,'SVG ',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
 bytes=fx.withTable(bytes,'DSIG',Buffer.from([0,0,0,1,0,0,0,0]));
 bytes=fx.withTable(bytes,'fpgm',Buffer.from([0xb0,0x00,0x2c]));
 assert.ok(['ZZZZ','SVG ','DSIG','fpgm','gasp'].every(t=>fx.tablesOf(bytes).tables.has(t)),'the upload has them');
 const r=await san.sanitiseFont(new Uint8Array(bytes));
 assert.equal(r.ok,true,r.reason);
 for(const out of [r.tables,[...(await tablesIn(r.woff2)).keys()],[...(await tablesIn(r.preview)).keys()]]){
  for(const t of ['ZZZZ','SVG ','DSIG','fpgm','gasp'])assert.ok(!out.includes(t),t+' is gone');
  assert.deepEqual(out.filter(t=>!san.KEPT_TABLES.includes(t)),[]);
 }
 assert.doesNotMatch(Buffer.from(await fontverter.convert(Buffer.from(r.woff2),'sfnt','woff2')).toString('latin1'),/<script|<svg/i,'no markup survives anywhere in the file');
 // The check itself refuses a file with anything else.
 assert.throws(()=>san.assertClean(new Uint8Array(fx.withTable(demo.regular,'ZZZZ',Buffer.from('x')))),/tables left: ZZZZ/);
});

test('family, style, weight, italic and the weight axis come from the font’s own tables',async()=>{
 const [regular,bold,italic]=await Promise.all([demo.regular,demo.bold,demo.italic].map(f=>san.sanitiseFont(new Uint8Array(f))));
 assert.deepEqual([regular,bold,italic].map(r=>[r.info.family,r.info.style,r.info.weight,r.info.italic]),[['Demo Sans','Regular',400,false],['Demo Sans','Bold',700,false],['Demo Sans','Italic',400,true]]);
 const variable=await san.sanitiseFont(new Uint8Array(await fx.demoVariable()));
 assert.equal(variable.ok,true);assert.deepEqual(variable.weightRange,[100,900]);assert.equal(variable.info.weight,400);
 const arabic=await san.sanitiseFont(new Uint8Array(await fx.demoArabic()));
 assert.equal(arabic.info.arabic,true,'a font that writes Arabic says so');assert.equal(regular.info.arabic,false);
 // Names are kept as one plain line, never an address.
 assert.equal(sfnt.cleanName(' Demo://Sans\u0000  Pro ',54),'Demo Sans Pro');
});

test('two uploads at once in one server process come out each as itself (the font tools are used one at a time)',async()=>{
 const inputs=[];for(const f of [demo.regular,demo.bold,demo.italic,fx.demoOtf()])inputs.push(new Uint8Array(await fx.toWoff2(f)));
 const one=[];for(const f of inputs)one.push(await san.sanitiseFont(f));
 const many=await Promise.all(inputs.map(f=>san.sanitiseFont(f)));
 assert.deepEqual(many.map(r=>r.ok&&Buffer.from(r.woff2).toString('base64')),one.map(r=>r.ok&&Buffer.from(r.woff2).toString('base64')));
});

// ── The routes ──────────────────────────────────────────────────────────
test('an owner uploads Regular, Bold and Italic (several at once); they join one family; each file is stored sanitised under the company’s font folder',async()=>{
 await wipe();as(OWNER);
 const results=await Promise.all([[demo.regular,'DemoSans-Regular.ttf'],[await fx.toWoff(demo.bold),'DemoSans-Bold.woff'],[await fx.toWoff2(demo.italic),'DemoSans-Italic.woff2']].map(([b,n])=>upload(b,n)));
 for(const r of results)assert.equal(r.status,200,r.text);
 const r=await list();
 assert.equal(r.status,200);assert.equal(r.body.ready,true);assert.equal(r.body.onPlan,true);assert.equal(r.body.mayUpload,true);
 assert.deepEqual(r.body.fonts.map(f=>[f.family,f.style,f.weight,f.italic,f.format,f.status,f.embedding]),[['Demo Sans','Regular',400,false,'ttf','ready','installable'],['Demo Sans','Italic',400,true,'woff2','ready','installable'],['Demo Sans','Bold',700,false,'woff','ready','installable']]);
 for(const f of r.body.fonts){assert.equal(f.url,`/api/brand-fonts/${f.id}/font`);assert.equal(f.previewUrl,`/api/brand-fonts/${f.id}/preview`)}
 // Storage: the sanitised WOFF2, its preview and the original, in the company's font folder only.
 const keys=await stored(`orgs/${ORG_A}/`);
 assert.equal(keys.length,9);
 for(const k of keys)assert.match(k,new RegExp(`^orgs/${ORG_A}/brand/fonts/[0-9a-f-]{36}/(font\\.woff2|preview\\.woff2|original\\.(ttf|woff|woff2))$`));
 for(const row of rows()){assert.ok(row.woff2_key.startsWith(`orgs/${ORG_A}/brand/fonts/${row.id}/`));assert.equal(row.org_id,ORG_A);assert.equal(row.created_by,OWNER.id)}
 // The file a browser loads is the sanitised one, never the original.
 const regular=r.body.fonts.find(f=>f.style==='Regular');
 const file=await call('GET',regular.url,ROUTES.file,{params:{id:regular.id}});
 assert.equal(file.status,307);assert.ok(file.location.startsWith(s3.url),'a signed link to private storage');
 const got=await realFetch(file.location);assert.equal(got.status,200);
 const bytes=new Uint8Array(await got.arrayBuffer());
 assert.equal(sfnt.containerOf(bytes),'woff2');assert.notDeepEqual(bytes,new Uint8Array(demo.regular));
 assert.match(file.location,/X-Amz-Expires=900/,'short-lived (15 minutes)');
});

test('the licence confirmation is required and recorded: who, when, the version and the exact words',async()=>{
 await wipe();as(OWNER);
 for(const opts of [{licence:false},{version:null},{version:'1999-01-01'}]){
  const r=await upload(demo.regular,'DemoSans-Regular.ttf',opts);
  assert.equal(r.status,400,JSON.stringify(opts));assert.equal(r.body.error,shared.WORDS.licenceRequired);
 }
 assert.deepEqual(rows(),[],'nothing recorded');assert.deepEqual(await stored(`orgs/${ORG_A}/brand/`),[],'nothing stored');
 const before=Date.now(),r=await upload(demo.regular,'DemoSans-Regular.ttf');
 assert.equal(r.status,200,r.text);
 const [row]=rows();
 assert.equal(row.licence_by,OWNER.id);assert.ok(row.licence_at>=before&&row.licence_at<=Date.now());
 assert.equal(row.licence_version,shared.LICENCE_VERSION);assert.equal(row.licence_text,LICENCE);assert.equal(shared.LICENCE_TEXT,LICENCE);
});

test('refused files are recorded with their reason and nothing of them is kept; the same file twice is one font; a wrong type or size is refused first',async()=>{
 await wipe();as(OWNER);
 let r=await upload(fx.withFsType(demo.bold,2),'DemoSans-Bold.otf');
 assert.equal(r.status,422);assert.equal(r.body.font.status,'refused');assert.equal(r.body.font.embedding,'restricted');
 assert.match(r.body.font.reason,/licence settings don’t allow it to be embedded/);assert.equal(r.body.font.url,null);
 assert.equal(r.body.font.family,'Demo Sans');assert.equal(r.body.font.style,'Bold');
 r=await upload(demo.italic.subarray(0,500),'Broken.ttf');
 assert.equal(r.status,422);assert.equal(r.body.font.family,'Broken','a file that doesn’t read is named by its file');
 assert.deepEqual(await stored(`orgs/${ORG_A}/`),[],'no file of a refused font is kept');
 assert.equal((await list()).body.fonts.filter(f=>f.status==='refused').length,2,'the owner sees why');
 assert.equal((await upload(demo.regular,'a.ttf')).status,200);
 r=await upload(demo.regular,'again.ttf');assert.equal(r.status,409);assert.equal(r.body.error,shared.WORDS.already);
 r=await upload(demo.regular,'font.svg');assert.equal(r.status,400);assert.equal(r.body.error,shared.WORDS.wrongType);
 r=await upload(Buffer.alloc(10*1024*1024+1),'big.ttf');assert.equal(r.status,413);
});

test('through the Studio’s direct upload: the file goes to private storage first, then the route reads it there',async()=>{
 await wipe();as(OWNER);
 const form=fontForm(demo.bold,'DemoSans-Bold.ttf'),encoded=new Response(form),blob=await encoded.blob(),type=encoded.headers.get('content-type');
 const ticket=await call('POST','/api/uploads',ROUTES.uploads,{body:{target:'/api/brand-fonts',type,size:blob.size}});
 assert.equal(ticket.status,200,ticket.text);
 const put=await realFetch(ticket.body.url,{method:'PUT',body:blob,headers:{'Content-Type':type}});assert.equal(put.status,200);
 const r=await call('POST','/api/brand-fonts',ROUTES.fonts,{body:{uploadToken:ticket.body.token}});
 assert.equal(r.status,200,r.text);assert.equal(r.body.font.style,'Bold');
 assert.deepEqual((await store.list({prefix:'staging/'})).objects,[],'the staged upload is gone');
});

test('only owners upload or remove: a creator, a viewer and staff viewing the company cannot, and are told who can',async()=>{
 await wipe();as(OWNER);
 const {body:{font}}=await upload(demo.regular,'DemoSans-Regular.ttf');
 for(const [who,ctx,re] of [['creator',[CREATOR],/Only your company’s owners/],['viewer',[VIEWER],/Your role is viewer/],['staff',[STAFF,ORG_A],/read|view|only/i]]){
  as(...ctx);
  let r=await upload(demo.bold,'DemoSans-Bold.ttf');assert.equal(r.status,403,who+' '+r.text);assert.match(r.body.error,re,who);
  r=await call('DELETE','/api/brand-fonts/'+font.id,ROUTES.font,{params:{id:font.id}});assert.equal(r.status,403,who);
  r=await list();assert.equal(r.status,200);assert.equal(r.body.mayUpload,false,who);assert.equal(r.body.fonts.length,1,who+' sees the company’s fonts');
  // …and loads them, like everyone in the company.
  assert.equal((await call('GET',font.url,ROUTES.file,{params:{id:font.id}})).status,307,who);
 }
 assert.equal(rows().length,1,'nothing more recorded');
});

test('another company never sees or loads a company’s font, even by its id',async()=>{
 await wipe();as(OWNER);
 const {body:{font}}=await upload(demo.regular,'DemoSans-Regular.ttf');
 as(B_OWNER);
 assert.deepEqual((await list()).body.fonts,[]);
 for(const file of ['font','preview'])assert.equal((await call('GET',`/api/brand-fonts/${font.id}/${file}`,file==='font'?ROUTES.file:ROUTES.preview,{params:{id:font.id}})).status,404,file);
 assert.equal((await call('DELETE','/api/brand-fonts/'+font.id,ROUTES.font,{params:{id:font.id}})).status,404,'nor removes it');
 // Its own upload of the same file is its own font, in its own folder.
 const r=await upload(demo.regular,'DemoSans-Regular.ttf');assert.equal(r.status,200,r.text);
 assert.ok((await stored(`orgs/${ORG_B}/brand/fonts/`)).length===3);
 as(OWNER);assert.equal((await list()).body.fonts.length,1,'A still has only its own');
});

test('removing a font (owner) is soft: it leaves the list, no browser can load it, the row and licence record stay',async()=>{
 await wipe();as(OWNER);
 const {body:{font}}=await upload(demo.regular,'DemoSans-Regular.ttf');
 const r=await call('DELETE','/api/brand-fonts/'+font.id,ROUTES.font,{params:{id:font.id}});
 assert.equal(r.status,200,r.text);
 assert.deepEqual((await list()).body.fonts,[]);
 assert.equal((await call('GET',font.url,ROUTES.file,{params:{id:font.id}})).status,404);
 const [row]=rows();assert.ok(row.deleted_at>0);assert.equal(row.deleted_by,OWNER.id);assert.equal(row.licence_text,LICENCE);
 assert.equal((await call('DELETE','/api/brand-fonts/'+font.id,ROUTES.font,{params:{id:font.id}})).status,404,'once');
 assert.equal((await upload(demo.regular,'DemoSans-Regular.ttf')).status,200,'the same file can come back');
});

test('plan gating: without studio.brand_fonts in the plans data, uploading stays off with “Available on Growth · Ask Nmesis”; Nmesis’s own workspace has it',async()=>{
 await wipe();as(C_OWNER);
 let r=await list();assert.equal(r.body.onPlan,false);assert.equal(r.body.upsell,'Growth');assert.equal(shared.WORDS.notOnPlan(r.body.upsell),'Available on Growth · Ask Nmesis');
 r=await upload(demo.regular,'DemoSans-Regular.ttf');
 assert.equal(r.status,403);assert.match(r.body.error,/Brand fonts is not on your company's plan\. It is available on Growth/);
 assert.deepEqual(rows(),[]);
 const plan=await import('@/lib/accounts/plan.ts');
 assert.ok(plan.FEATURES.includes('studio.brand_fonts'));
 assert.equal(plan.featureOn({legacy:false,status:'active',features:{}},'studio.brand_fonts'),false,'a plan without the key: off');
 assert.equal(plan.featureOn({legacy:true,status:null,features:{}},'studio.brand_fonts'),true,'Nmesis’s own workspace (no plan, internal): on');
});

test('before migration 0013 the list is empty (ready: false) and uploading says it isn’t on yet',async()=>{
 const store=await import('@/lib/brand-fonts/store.ts');
 const missing={prepare:()=>({bind(){return this},first:async()=>{throw new Error('no such table: brand_fonts')},all:async()=>{throw new Error('relation "brand_fonts" does not exist')},run:async()=>{throw new Error('no such table: brand_fonts')}})};
 assert.equal(await store.fontsReady(missing),false);
 await assert.rejects(()=>store.listFonts(missing,ORG_A),e=>e instanceof store.BrandFontError&&e.status===503&&e.message===shared.WORDS.notYet);
 const broken={prepare:()=>({bind(){return this},first:async()=>{throw new Error('connection reset')}})};
 await assert.rejects(()=>store.fontsReady(broken),/connection reset/,'any other failure is a real one');
});

test('the routes are in the route table: reads for every member (the library may show them), uploads need the plan key',async()=>{
 const plan=await import('@/lib/accounts/plan.ts');
 assert.equal(plan.routeRule('/api/brand-fonts','GET').library,true);
 assert.equal(plan.routeRule('/api/brand-fonts/0000aaaa-0000/font','GET').library,true);
 assert.equal(plan.routeRule('/api/brand-fonts/0000aaaa-0000/preview','GET').feature,null);
 assert.equal(plan.routeRule('/api/brand-fonts','POST').feature,'studio.brand_fonts');
 assert.equal(plan.routeRule('/api/brand-fonts/0000aaaa-0000','DELETE').feature,null,'removing never needs the plan');
 assert.equal(plan.routeRule('/api/brand-fonts/0000aaaa-0000/original','GET'),null,'the original has no address');
 const uploads=await import('@/lib/portable/uploads.ts');assert.equal(uploads.uploadTarget('/api/brand-fonts'),true);
});

// ── Recent fonts and colours with the account (Phase 3 follow-up) ─────────
test('recents sync across two browsers: what one browser picks, the other lists; both picking at once keeps both; nobody else sees them',async()=>{
 as(OWNER);
 const browserA=body=>call('PUT','/api/account/recent',ROUTES.recent,{body}),browserB=()=>call('GET','/api/account/recent',ROUTES.recent);
 assert.deepEqual((await browserB()).body.recent,{fonts:[],colours:[]});
 assert.equal((await browserA({kind:'fonts',value:'brand:Demo Sans'})).status,200);
 assert.equal((await browserA({kind:'colours',value:'#0a84ff'})).status,200);
 assert.deepEqual((await browserB()).body.recent,{fonts:['brand:Demo Sans'],colours:['#0A84FF']},'the second browser lists the first one’s picks');
 await Promise.all([browserA({kind:'fonts',value:'Inter'}),call('PUT','/api/account/recent',ROUTES.recent,{body:{kind:'fonts',value:'Cairo'}})]);
 const fonts=(await browserB()).body.recent.fonts;
 assert.deepEqual([...fonts.slice(0,2)].sort(),['Cairo','Inter']);assert.equal(fonts[2],'brand:Demo Sans');
 for(const body of [{kind:'fonts',value:'https://example.test/x.woff2'},{kind:'colours',value:'blue'},{kind:'other',value:'x'}])assert.equal((await browserA(body)).status,400,JSON.stringify(body));
 // Kept in the person's own folder, and only theirs.
 assert.deepEqual(await stored(`orgs/${ORG_A}/users/${OWNER.id}/settings/`),[`orgs/${ORG_A}/users/${OWNER.id}/settings/editor-recent.json`]);
 as(CREATOR);assert.deepEqual((await browserB()).body.recent,{fonts:[],colours:[]},'a teammate has their own');
 as(B_OWNER);assert.deepEqual((await browserB()).body.recent,{fonts:[],colours:[]});
});
