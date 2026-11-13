// End-to-end check of the studio's real route handlers against a Postgres database
// (connected as studio_app, migrations applied) and a local in-memory S3 stand-in.
// Sign-in is replaced ONLY inside this harness: hooks.mjs resolves '@/lib/studio-context'
// to auth-stub.mjs; no application code is changed. It uploads a reference through a signed URL,
// creates and lists a storyboard, sets and reserves a budget (two concurrent
// reservations against one limit), lists the library and archives an empty draft.
// Use a disposable local database only; it writes rows and never cleans them up.
// The studio's TypeScript runs on Node's own module loader through hooks.mjs (alias,
// extensionless imports, transpiling with the repository's TypeScript); Node 20.6+.
// usage (after npm run db:migrate against that database):
//   STUDIO_DB=postgres://studio_app:<password>@127.0.0.1:5432/<db>?sslmode=disable \
//   node scripts/verify/studio-flow.mjs
import {register} from 'node:module';
import {encode} from 'fast-png';
import {startS3} from './s3-standin.mjs';
if(!process.env.STUDIO_DB){console.error('Set STUDIO_DB to a studio_app connection string for a disposable database.');process.exit(1)}
register('./hooks.mjs',import.meta.url);
const s3=await startS3();
Object.assign(process.env,{DATABASE_URL:process.env.STUDIO_DB,S3_REGION:'eu-central-1',S3_BUCKET:'studio-local',S3_ENDPOINT:s3.url,S3_FORCE_PATH_STYLE:'true',S3_ACCESS_KEY_ID:'local',S3_SECRET_ACCESS_KEY:'local-secret',KEY_ENCRYPTION_SECRET:'k'.repeat(48)});
const route=path=>import('@/'+path);
const ORIGIN='http://studio.local';
const call=async(mod,method,path,body,params)=>{const r=await mod[method](new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json'},...body!==undefined?{body:JSON.stringify(body)}:{}}),params?{params:Promise.resolve(params)}:undefined);const data=await r.json().catch(()=>null);console.log(`${method} ${path} -> ${r.status}`);if(!r.ok)throw new Error(JSON.stringify(data));return data};

try{
 const uploads=await route('app/api/uploads/route.ts'),assets=await route('app/api/assets/route.ts'),visuals=await route('app/api/visuals/route.ts');
 const storyboards=await route('app/api/storyboards/route.ts'),films=await route('app/api/films/route.ts'),video=await route('app/api/video-connection/route.ts');
 const cleanup=await route('app/api/visuals/cleanup/route.ts');
 const {getDatabase}=await route('lib/portable/database.ts');const policy=await route('lib/film-policy.ts');const db=getDatabase();

 console.log('\n# 1. Upload a reference through a signed URL');
 const png=encode({width:64,height:36,data:new Uint8Array(64*36*4).fill(180),channels:4});
 const form=new FormData();form.set('image',new File([png],'reference.png',{type:'image/png'}));
 const multipart=new Response(form),type=multipart.headers.get('content-type'),bytes=new Uint8Array(await multipart.arrayBuffer());
 const ticket=await call(uploads,'POST','/api/uploads',{target:'/api/assets',type,size:bytes.byteLength});
 const signed=new URL(ticket.url);console.log('signed URL host:',signed.host,'path:',decodeURIComponent(signed.pathname).replace(/[a-f0-9]{64}/,'<user-hash>').replace(/[0-9a-f-]{36}$/,'<uuid>'),'signature:',signed.searchParams.has('X-Amz-Signature'));
 const put=await fetch(ticket.url,{method:'PUT',headers:{'content-type':type},body:bytes});console.log('browser PUT to storage ->',put.status);
 const asset=await call(assets,'POST','/api/assets',{uploadToken:ticket.token});

 console.log('\n# 2. Create and list a storyboard');
 const board=await call(storyboards,'POST','/api/storyboards',{title:'Demo story',vehicle:'Demo SUV',configurator:'https://configurator.example.com/demo/',views:[],idea:'',direction:'',moodId:'',pin:'',shots:[],brand:'',tagline:''});
 const boards=await call(storyboards,'GET','/api/storyboards');console.log('boards listed:',boards.boards.length,'first id matches:',boards.boards[0]?.id===board.board?.id);

 console.log('\n# 3. Budget and reservation');
 const state=await call(video,'GET','/api/video-connection');console.log('budget:',JSON.stringify({dailyLimit:state.dailyLimit,used:state.used,paused:state.paused}));
 const patched=await call(video,'PATCH','/api/video-connection',{dailyLimit:1_000_000,paused:false});console.log('budget after PATCH:',patched.dailyLimit);
 const f1=await call(films,'POST','/api/films',{sourceId:asset.id,title:'Clip A',vehicle:'Demo SUV'}),f2=await call(films,'POST','/api/films',{sourceId:asset.id,title:'Clip B',vehicle:'Demo SUV'});
 const owner=(await db.prepare('SELECT owner FROM films WHERE id=?').bind(f1.film.id).first('owner'));
 for(const id of [f1.film.id,f2.film.id])await db.prepare("UPDATE films SET status='quoted',estimate=600000 WHERE id=? AND owner=?").bind(id,owner).run();
 const day=policy.budgetDay(),reserve=id=>db.batch([db.prepare(policy.LOCK_FILM_BUDGET_SQL).bind(id,owner),db.prepare(policy.RESERVE_FILM_SQL).bind(day,Date.now(),Date.now()+150000,id,owner,day,day,day)]);
 const [r1,r2]=await Promise.all([reserve(f1.film.id),reserve(f2.film.id)]);
 console.log('concurrent reservations of 0.60 + 0.60 against a 1.00 daily limit -> changes:',r1[1].meta.changes,r2[1].meta.changes);
 const after=await call(video,'GET','/api/video-connection');console.log('used after reservation (USD millionths):',after.used);
 const listed=await call(films,'GET','/api/films');console.log('films listed:',listed.films.map(f=>f.status).sort().join(','));

 console.log('\n# 4. List the library and clean empty drafts (compare-and-swap archive)');
 await db.prepare("INSERT INTO image_jobs(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?)").bind('draft-0001-empty','nmesis',owner,owner,JSON.stringify({visual:{id:'draft-0001-empty',title:'Empty draft',createdAt:new Date().toISOString()}}),Date.now(),Date.now()).run();
 const lib=await call(visuals,'GET','/api/visuals');console.log('library visuals:',lib.visuals.length);
 const cleaned=await call(cleanup,'POST','/api/visuals/cleanup',{});console.log('cleanup:',JSON.stringify(cleaned));
 const archived=await db.prepare('SELECT status,data FROM image_jobs WHERE id=?').bind('draft-0001-empty').first();console.log('draft now:',archived.status,'archivedStatus:',JSON.parse(archived.data).archivedStatus);

 console.log('\n# 5. Rows and objects carry the organization');
 for(const t of ['films','storyboards','film_budgets','image_jobs'])console.log(t,JSON.stringify((await db.prepare(`SELECT org_id, count(*) AS n FROM ${t} GROUP BY org_id`).all()).results));
 console.log('stored keys:');for(const k of [...s3.objects.keys()].sort())console.log('  '+k.replace(/[a-f0-9]{64}/,'<user-hash>').replace(/[0-9a-f-]{36}/g,'<uuid>'));
 console.log('storage requests:',s3.log.length,'(presigned:',s3.log.filter(x=>x.includes('presigned')).length+')');
}catch(e){console.error('FAILED',e);process.exitCode=1}finally{s3.server.close();setTimeout(()=>process.exit(process.exitCode||0),200)}
