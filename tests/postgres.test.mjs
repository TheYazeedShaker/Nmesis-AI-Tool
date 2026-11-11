// Runs the studio's database layer against a real Postgres (17) when
// TEST_DATABASE_URL points at a disposable database as a superuser, e.g.
//   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/studio_test?sslmode=disable
// It recreates the `studio` schema and the `studio_app` role there. Skipped otherwise.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import postgres from 'postgres';

const ADMIN=process.env.TEST_DATABASE_URL;
const skip=ADMIN?false:'TEST_DATABASE_URL is not set: Postgres adapter, migration and privilege tests skipped';
if(skip)console.log('# '+skip);
const PASSWORD='local-test-password-0123456789';
const TABLES=['film_budgets','films','swap_jobs','storyboards','image_jobs','topaz_jobs'];
const asRole=(url,user,password)=>{const u=new URL(url);u.username=user;u.password=password;return u.href};
const ssl=url=>/[?&]sslmode=disable\b/.test(url)?false:'require';

let admin,appUrl,migrate,connect,StudioDatabase,toPositional,policy;
after(()=>admin?.end({timeout:5}));
const q=(text,args)=>[toPositional(text),args];
async function until(check){for(let i=0;i<500&&!check();i++)await new Promise(r=>setTimeout(r,10));assert.ok(check(),'timed out')}
async function setup(){
 if(admin)return;
 admin=postgres(ADMIN,{max:2,prepare:false,ssl:ssl(ADMIN),onnotice:()=>{}});
 // A clean slate, plus the API roles every Supabase project has.
 await admin.unsafe(`drop schema if exists studio cascade; drop schema if exists other_app cascade; drop table if exists public.secret_probe;
  do $$ begin
   if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
   if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;`);
 await admin.unsafe(readFileSync(new URL('../docs/supabase-setup.sql',import.meta.url),'utf8').replace('REPLACE_WITH_A_LONG_RANDOM_PASSWORD',PASSWORD));
 // Data the studio role must never reach.
 await admin.unsafe(`create table public.secret_probe(id int); insert into public.secret_probe values(1);
  create schema other_app; create table other_app.secret_probe(id int); insert into other_app.secret_probe values(1);`);
 appUrl=asRole(ADMIN,'studio_app',PASSWORD);
 ({migrate}=await import('../scripts/migrate.mjs'));
 ({connect,StudioDatabase,toPositional}=await import('../lib/portable/database.ts'));
 policy=await import('../lib/film-policy.ts');
}

test('migrations apply once, are idempotent, and refuse a changed file',{skip},async()=>{
 await setup();const log=[];
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),['0001_studio.sql']);
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),[]);
 assert.deepEqual(log,['Applied: 0001_studio.sql','Already applied: 0001_studio.sql']);
 const folder=mkdtempSync(join(tmpdir(),'studio-migrations-'));
 try{
  const original=readFileSync(new URL('../supabase/migrations/0001_studio.sql',import.meta.url),'utf8');
  writeFileSync(join(folder,'0001_studio.sql'),original+'\n-- edited after it was applied\n');
  await assert.rejects(()=>migrate(appUrl,{folder:pathToFileURL(folder+'/'),log:()=>{}}),/Previously applied migration changed: 0001_studio.sql/);
  // The migration SQL itself is idempotent when re-run outside the ledger.
  const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});try{await app.unsafe(original)}finally{await app.end({timeout:5})}
 }finally{rmSync(folder,{recursive:true,force:true})}
});

test('every table has org_id and RLS; anon/authenticated are refused; studio_app reaches only its schema',{skip},async()=>{
 await setup();
 const tables=await admin`select c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner,
   exists(select 1 from information_schema.columns k where k.table_schema='studio' and k.table_name=c.relname and k.column_name='org_id' and k.is_nullable='NO') as org_id
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' order by 1`;
 assert.deepEqual(tables.map(t=>t.relname).sort(),['__studio_migrations',...TABLES].sort());
 for(const t of tables){assert.equal(t.relrowsecurity,true,t.relname+' RLS');assert.equal(t.owner,'studio_app');if(t.relname!=='__studio_migrations')assert.equal(t.org_id,true,t.relname+' org_id')}
 const [role]=await admin`select rolsuper,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname='studio_app'`;
 assert.deepEqual({...role},{rolsuper:false,rolbypassrls:false,rolinherit:false,rolcanlogin:true});
 for(const api of ['anon','authenticated'])for(const table of TABLES)
  await assert.rejects(()=>admin.begin(async tx=>{await tx.unsafe('set local role '+api);await tx.unsafe('select * from studio.'+table)}),/permission denied/);
 const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});
 try{
  await assert.rejects(()=>app`select * from public.secret_probe`,/permission denied/);
  await assert.rejects(()=>app`select * from other_app.secret_probe`,/permission denied/);
  await assert.rejects(()=>app`create table public.studio_probe(id int)`,/permission denied/);
  const [{schema}]=await app`select current_schema() as schema`;assert.equal(schema,'studio');
 }finally{await app.end({timeout:5})}
});

test('the adapter translates placeholders and returns rows, columns, changes and numbers',{skip},async()=>{
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql);
 try{
  const owner='orgs/nmesis/users/'+'a'.repeat(64)+'/',now=Date.now();
  const insert=await db.prepare("INSERT INTO storyboards(id,org_id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind('board-0001','nmesis',owner,JSON.stringify({title:'What? A ? in data'}),now,now).run();
  assert.equal(insert.meta.changes,1);
  const row=await db.prepare("SELECT * FROM storyboards WHERE id=? AND owner=? AND data<>'?'").bind('board-0001',owner).first();
  assert.equal(row.created_at,now);assert.equal(typeof row.created_at,'number');assert.equal(row.revision,1);assert.equal(row.org_id,'nmesis');
  assert.equal(await db.prepare('SELECT revision FROM storyboards WHERE id=?').bind('board-0001').first('revision'),1);
  assert.equal(await db.prepare('SELECT * FROM storyboards WHERE owner=?').bind('someone-else').first(),null);
  assert.equal((await db.prepare('SELECT id FROM storyboards WHERE org_id=? AND owner=? ORDER BY updated_at DESC LIMIT 60').bind('nmesis',owner).all()).results.length,1);
  const lease=()=>db.prepare('UPDATE storyboards SET lock_until=?,lock_token=? WHERE id=? AND owner=? AND revision=? AND lock_until<?').bind(now+300000,'t',
   'board-0001',owner,1,now).run();
  assert.equal((await lease()).meta.changes,1);assert.equal((await lease()).meta.changes,0);
  const none=await db.prepare('UPDATE storyboards SET lock_until=0 WHERE id=?').bind('missing').run();assert.equal(none.meta.changes,0);
  // SUM over bigint is numeric in Postgres; the studio casts it back to a number.
  const budget=await db.prepare('SELECT CAST(COALESCE((SELECT SUM(estimate) FROM films WHERE payer=?),0) AS BIGINT) AS amount').bind(owner).first('amount');assert.equal(budget,0);
 }finally{await sql.end({timeout:5})}
});

for(const kind of ['film','swap','image'])test(`${kind} reservations: of two overlapping reservations within one budget only one wins`,{skip},async()=>{
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql);
 const table={film:'films',swap:'swap_jobs',image:'image_jobs'}[kind],K=kind.toUpperCase();
 const LOCK=policy[`LOCK_${K}_BUDGET_SQL`],RESERVE=policy[`RESERVE_${K}_SQL`];
 const owner='orgs/nmesis/users/'+'b'.repeat(64)+'/',payer=owner+kind+'/',day='2026-11-11',now=Date.now();
 const args=id=>kind==='image'?[day,now,id,owner,day,day,day]:[day,now,now+150000,id,owner,day,day,day];
 try{
  await db.prepare('INSERT INTO film_budgets(payer,org_id,daily_limit) VALUES(?,?,?)').bind(payer,'nmesis',100).run();
  for(const id of [kind+'-job-a',kind+'-job-b',kind+'-job-c',kind+'-job-d'])
   await db.prepare(`INSERT INTO ${table}(id,org_id,owner,payer,status,data,estimate,created_at,updated_at) VALUES(?,?,?,?,'quoted','{}',60,?,?)`).bind(id,'nmesis',owner,payer,now,now).run();
  // A holds the budget lock and has reserved but not committed; B starts meanwhile.
  let release;const gate=new Promise(r=>{release=r});let reservedA;
  const a=sql.begin(async tx=>{await tx.unsafe(...q(LOCK,[kind+'-job-a',owner]));reservedA=(await tx.unsafe(...q(RESERVE,args(kind+'-job-a')))).count;await gate});
  await until(()=>reservedA!==undefined);
  const b=db.batch([db.prepare(LOCK).bind(kind+'-job-b',owner),db.prepare(RESERVE).bind(...args(kind+'-job-b'))]);
  await new Promise(r=>setTimeout(r,200));release();await a;
  const [,resultB]=await b;
  assert.equal(reservedA,1);assert.equal(resultB.meta.changes,0);
  // Control: without the lock, the same overlap lets both through (why the lock exists).
  await db.prepare('UPDATE film_budgets SET daily_limit=150 WHERE payer=?').bind(payer).run();
  let releaseC;const gateC=new Promise(r=>{releaseC=r});let reservedC;
  const c=sql.begin(async tx=>{reservedC=(await tx.unsafe(...q(RESERVE,args(kind+'-job-c')))).count;await gateC});
  await until(()=>reservedC!==undefined);
  const d=await db.prepare(RESERVE).bind(...args(kind+'-job-d')).run();releaseC();await c;
  assert.equal(reservedC,1);assert.equal(d.meta.changes,1,'unlocked reservations overlap: 180 reserved against a 150 limit');
 }finally{await sql.end({timeout:5})}
});

test('only one active upscale per source image, even for concurrent inserts',{skip},async()=>{
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql);
 const owner='orgs/nmesis/users/'+'c'.repeat(64)+'/',now=Date.now();
 const insert=id=>db.prepare("INSERT INTO topaz_jobs(id,org_id,owner,parent_id,status,data,created_at,updated_at,lock_until) SELECT ?,?,?,?,'submitting',?,CAST(? AS BIGINT),CAST(? AS BIGINT),CAST(? AS BIGINT) WHERE NOT EXISTS (SELECT 1 FROM topaz_jobs WHERE owner=? AND parent_id=? AND status IN ('submitting','unknown','queued','processing','archiving')) ON CONFLICT DO NOTHING")
  .bind(id,'nmesis',owner,'parent-1','{}',now,now,now+90000,owner,'parent-1').run();
 try{
  const results=await Promise.all([insert('topaz-a'),insert('topaz-b')]);
  assert.deepEqual(results.map(r=>r.meta.changes).sort(),[0,1]);
  await db.prepare("UPDATE topaz_jobs SET status='ready' WHERE owner=?").bind(owner).run();
  assert.equal((await insert('topaz-c')).meta.changes,1);
 }finally{await sql.end({timeout:5})}
});
