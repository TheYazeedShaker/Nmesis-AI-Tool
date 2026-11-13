// Runs the studio's database layer against a real Postgres (17) when
// TEST_DATABASE_URL points at a disposable database as a superuser, e.g.
//   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/studio_test?sslmode=disable
// It recreates the `studio` schema and the `studio_app` role there, and loads a
// synthetic stand-in for the admin's `accounts` schema (tests/fixtures/accounts-schema.sql).
// Skipped otherwise. In CI it runs against a Postgres service container.
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
const TABLES=['film_budgets','films','swap_jobs','storyboards','image_jobs','topaz_jobs','staff_access_log'];
const MIGRATIONS=['0001_studio.sql','0002_accounts_access.sql'];
// Synthetic companies and people in the accounts fixture.
const ORG_A='0000000a-0000-4000-8000-00000000000a',ORG_B='0000000b-0000-4000-8000-00000000000b',ORG_N='00000001-0000-4000-8000-000000000001';
const USER_A='00000000-0000-4000-8000-0000000000a1',USER_B='00000000-0000-4000-8000-0000000000b1',INVITED='00000000-0000-4000-8000-0000000000c1',STAFF='00000000-0000-4000-8000-0000000000d1';
const ownerOf=(org,user)=>`orgs/${org}/users/${user}/`;
const asRole=(url,user,password)=>{const u=new URL(url);u.username=user;u.password=password;return u.href};
const ssl=url=>/[?&]sslmode=disable\b/.test(url)?false:'require';

let admin,appUrl,migrate,connect,StudioDatabase,toPositional,policy;
const setupSql=()=>readFileSync(new URL('../docs/supabase-setup.sql',import.meta.url),'utf8').replaceAll('REPLACE_WITH_A_LONG_RANDOM_PASSWORD',PASSWORD);
const migrationSql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
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
 // The admin's accounts schema (synthetic), then the owner's one-time setup.
 await admin.unsafe(readFileSync(new URL('./fixtures/accounts-schema.sql',import.meta.url),'utf8'));
 await admin.unsafe(`insert into auth.users(id,email) values ('${USER_A}','a@example.test'),('${USER_B}','b@example.test'),('${INVITED}','invited@example.test'),('${STAFF}','staff@example.test') on conflict (id) do nothing;
  insert into accounts.organisations(id,name,kind) values ('${ORG_A}','Company A','client'),('${ORG_B}','Company B','client'),('${ORG_N}','Nmesis','internal') on conflict (id) do nothing;
  insert into accounts.members(org_id,user_id,role,status) values ('${ORG_A}','${USER_A}','owner','active'),('${ORG_B}','${USER_B}','owner','active'),('${ORG_A}','${INVITED}','creator','invited')
   on conflict (org_id,user_id) do update set status=excluded.status, role=excluded.role;
  insert into accounts.staff(user_id,name,role,active) values ('${STAFF}','Staff','ops',true) on conflict (user_id) do nothing;`);
 await admin.unsafe(setupSql());
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
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),MIGRATIONS);
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),[]);
 assert.deepEqual(log,[...MIGRATIONS.map(m=>'Applied: '+m),...MIGRATIONS.map(m=>'Already applied: '+m)]);
 const folder=mkdtempSync(join(tmpdir(),'studio-migrations-'));
 try{
  const original=readFileSync(new URL('../supabase/migrations/0001_studio.sql',import.meta.url),'utf8');
  writeFileSync(join(folder,'0001_studio.sql'),original+'\n-- edited after it was applied\n');
  await assert.rejects(()=>migrate(appUrl,{folder:pathToFileURL(folder+'/'),log:()=>{}}),/Previously applied migration changed: 0001_studio.sql/);
  // A second run of everything: the owner's setup (all five sections) and both
  // migrations, outside the ledger. Each is idempotent.
  await admin.unsafe(setupSql());
  const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});try{for(const m of MIGRATIONS)await app.unsafe(migrationSql(m))}finally{await app.end({timeout:5})}
  assert.deepEqual(await migrate(appUrl,{log:()=>{}}),[]);
 }finally{rmSync(folder,{recursive:true,force:true})}
});

test('every table has org_id and RLS; anon/authenticated are refused; studio_app reaches only its schema',{skip},async()=>{
 await setup();
 const tables=await admin`select c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner,
   exists(select 1 from information_schema.columns k where k.table_schema='studio' and k.table_name=c.relname and k.column_name='org_id' and k.is_nullable='NO') as org_id
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' order by 1`;
 assert.deepEqual(tables.map(t=>t.relname).sort(),['__studio_migrations','car_settings',...TABLES].sort());
 for(const t of tables){assert.equal(t.relrowsecurity,true,t.relname+' RLS');assert.equal(t.owner,'studio_app');if(!['__studio_migrations','car_settings'].includes(t.relname))assert.equal(t.org_id,true,t.relname+' org_id')}
 const forced=await admin`select c.relname, c.relforcerowsecurity as forced, (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' and c.relname<>'__studio_migrations'`;
 for(const t of forced){assert.equal(t.forced,true,t.relname+' forced RLS');assert.equal(t.policies,1,t.relname+' one policy')}
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
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql).forUser(USER_A);
 try{
  const owner=ownerOf(ORG_A,USER_A),now=Date.now();
  const insert=await db.prepare("INSERT INTO storyboards(id,org_id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind('board-0001',ORG_A,owner,JSON.stringify({title:'What? A ? in data'}),now,now).run();
  assert.equal(insert.meta.changes,1);
  const row=await db.prepare("SELECT * FROM storyboards WHERE id=? AND owner=? AND data<>'?'").bind('board-0001',owner).first();
  assert.equal(row.created_at,now);assert.equal(typeof row.created_at,'number');assert.equal(row.revision,1);assert.equal(row.org_id,ORG_A);
  assert.equal(await db.prepare('SELECT revision FROM storyboards WHERE id=?').bind('board-0001').first('revision'),1);
  assert.equal(await db.prepare('SELECT * FROM storyboards WHERE owner=?').bind('someone-else').first(),null);
  assert.equal((await db.prepare('SELECT id FROM storyboards WHERE org_id=? AND owner=? ORDER BY updated_at DESC LIMIT 60').bind(ORG_A,owner).all()).results.length,1);
  const lease=()=>db.prepare('UPDATE storyboards SET lock_until=?,lock_token=? WHERE id=? AND owner=? AND revision=? AND lock_until<?').bind(now+300000,'t',
   'board-0001',owner,1,now).run();
  assert.equal((await lease()).meta.changes,1);assert.equal((await lease()).meta.changes,0);
  const none=await db.prepare('UPDATE storyboards SET lock_until=0 WHERE id=?').bind('missing').run();assert.equal(none.meta.changes,0);
  // SUM over bigint is numeric in Postgres; the studio casts it back to a number.
  const budget=await db.prepare('SELECT CAST(COALESCE((SELECT SUM(estimate) FROM films WHERE payer=?),0) AS BIGINT) AS amount').bind(owner).first('amount');assert.equal(budget,0);
 }finally{await sql.end({timeout:5})}
});

for(const kind of ['film','swap','image'])test(`${kind} reservations: of two overlapping reservations within one budget only one wins`,{skip},async()=>{
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql).forUser(USER_A);
 const table={film:'films',swap:'swap_jobs',image:'image_jobs'}[kind],K=kind.toUpperCase();
 // A raw transaction says who is asking, as the adapter does for every statement.
 const asUser=tx=>tx`select set_config('studio.user_id', ${USER_A}, true)`;
 const LOCK=policy[`LOCK_${K}_BUDGET_SQL`],RESERVE=policy[`RESERVE_${K}_SQL`];
 const owner=ownerOf(ORG_A,USER_A),payer='orgs/'+ORG_A+'/keys/'+kind+'/',day='2026-11-11',now=Date.now();
 const args=id=>kind==='image'?[day,now,id,owner,day,day,day]:[day,now,now+150000,id,owner,day,day,day];
 try{
  await db.prepare('INSERT INTO film_budgets(payer,org_id,daily_limit) VALUES(?,?,?)').bind(payer,ORG_A,100).run();
  for(const id of [kind+'-job-a',kind+'-job-b',kind+'-job-c',kind+'-job-d'])
   await db.prepare(`INSERT INTO ${table}(id,org_id,owner,payer,status,data,estimate,created_at,updated_at) VALUES(?,?,?,?,'quoted','{}',60,?,?)`).bind(id,ORG_A,owner,payer,now,now).run();
  // A holds the budget lock and has reserved but not committed; B starts meanwhile.
  let release;const gate=new Promise(r=>{release=r});let reservedA;
  const a=sql.begin(async tx=>{await asUser(tx);await tx.unsafe(...q(LOCK,[kind+'-job-a',owner]));reservedA=(await tx.unsafe(...q(RESERVE,args(kind+'-job-a')))).count;await gate});
  await until(()=>reservedA!==undefined);
  const b=db.batch([db.prepare(LOCK).bind(kind+'-job-b',owner),db.prepare(RESERVE).bind(...args(kind+'-job-b'))]);
  await new Promise(r=>setTimeout(r,200));release();await a;
  const [,resultB]=await b;
  assert.equal(reservedA,1);assert.equal(resultB.meta.changes,0);
  // Control: without the lock, the same overlap lets both through (why the lock exists).
  await db.prepare('UPDATE film_budgets SET daily_limit=150 WHERE payer=?').bind(payer).run();
  let releaseC;const gateC=new Promise(r=>{releaseC=r});let reservedC;
  const c=sql.begin(async tx=>{await asUser(tx);reservedC=(await tx.unsafe(...q(RESERVE,args(kind+'-job-c')))).count;await gateC});
  await until(()=>reservedC!==undefined);
  const d=await db.prepare(RESERVE).bind(...args(kind+'-job-d')).run();releaseC();await c;
  assert.equal(reservedC,1);assert.equal(d.meta.changes,1,'unlocked reservations overlap: 180 reserved against a 150 limit');
 }finally{await sql.end({timeout:5})}
});

test('only one active upscale per source image, even for concurrent inserts',{skip},async()=>{
 await setup();const sql=connect(appUrl);const db=new StudioDatabase(sql).forUser(USER_A);
 const owner=ownerOf(ORG_A,USER_A)+'upscales/',now=Date.now();
 const insert=id=>db.prepare("INSERT INTO topaz_jobs(id,org_id,owner,parent_id,status,data,created_at,updated_at,lock_until) SELECT ?,?,?,?,'submitting',?,CAST(? AS BIGINT),CAST(? AS BIGINT),CAST(? AS BIGINT) WHERE NOT EXISTS (SELECT 1 FROM topaz_jobs WHERE owner=? AND parent_id=? AND status IN ('submitting','unknown','queued','processing','archiving')) ON CONFLICT DO NOTHING")
  .bind(id,ORG_A,owner,'parent-1','{}',now,now,now+90000,owner,'parent-1').run();
 try{
  const results=await Promise.all([insert('topaz-a'),insert('topaz-b')]);
  assert.deepEqual(results.map(r=>r.meta.changes).sort(),[0,1]);
  await db.prepare("UPDATE topaz_jobs SET status='ready' WHERE owner=?").bind(owner).run();
  assert.equal((await insert('topaz-c')).meta.changes,1);
 }finally{await sql.end({timeout:5})}
});

// Row level security (migration 0002), forced for the studio's own role: one row
// per company in every table, written as the superuser, then read and written
// through the studio's adapter as different people.
const ROW={
 film_budgets:(id,org)=>[`insert into studio.film_budgets(payer,org_id) values($1,$2)`,['orgs/'+org+'/keys/'+id,org]],
 films:(id,org)=>[`insert into studio.films(id,org_id,owner,payer,data,created_at,updated_at) values($1,$2,$3,$3,'{}',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 swap_jobs:(id,org)=>[`insert into studio.swap_jobs(id,org_id,owner,payer,data,created_at,updated_at) values($1,$2,$3,$3,'{}',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 storyboards:(id,org)=>[`insert into studio.storyboards(id,org_id,owner,data,created_at,updated_at) values($1,$2,$3,'{}',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 image_jobs:(id,org)=>[`insert into studio.image_jobs(id,org_id,owner,payer,data,created_at,updated_at) values($1,$2,$3,$3,'{}',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 topaz_jobs:(id,org)=>[`insert into studio.topaz_jobs(id,org_id,owner,parent_id,status,data,created_at,updated_at) values($1,$2,$3,'p','ready','{}',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 staff_access_log:(id,org)=>[`insert into studio.staff_access_log(id,org_id,staff_user,at) values($1,$2,'x',1)`,[id,org]],
};
const KEY={film_budgets:'payer'};
test('RLS: a member sees and changes only their company; invited-only and no user see nothing; staff see all',{skip},async()=>{
 await setup();
 for(const table of TABLES){await admin.unsafe(`delete from studio.${table}`);for(const org of [ORG_A,ORG_B])await admin.unsafe(...ROW[table]('rls-'+org.slice(7,8),org))}
 const sql=connect(appUrl),base=new StudioDatabase(sql);
 const orgsSeen=async(db,table)=>(await db.prepare(`SELECT org_id FROM ${table} ORDER BY org_id`).all()).results.map(r=>r.org_id);
 try{
  const a=base.forUser(USER_A),invited=base.forUser(INVITED),staff=base.forUser(STAFF),nobody=base;
  for(const table of TABLES){
   assert.deepEqual(await orgsSeen(a,table),[ORG_A],table+': A sees only company A');
   assert.deepEqual(await orgsSeen(invited,table),[],table+': invited-only sees nothing');
   assert.deepEqual(await orgsSeen(staff,table),[ORG_A,ORG_B],table+': staff see every company');
   assert.deepEqual(await orgsSeen(nobody,table),[],table+': no user set sees nothing');
   // A cannot change or remove company B's row, even naming it directly.
   const key=KEY[table]||'id',bKey=table==='film_budgets'?'orgs/'+ORG_B+'/keys/rls-b':'rls-b';
   assert.equal((await a.prepare(`UPDATE ${table} SET org_id=org_id WHERE ${key}=?`).bind(bKey).run()).meta.changes,0,table+': A updates nothing of B');
   assert.equal((await a.prepare(`DELETE FROM ${table} WHERE ${key}=?`).bind(bKey).run()).meta.changes,0,table+': A deletes nothing of B');
   assert.equal((await a.prepare(`UPDATE ${table} SET org_id=? WHERE ${key}=?`).bind(ORG_B,table==='film_budgets'?'orgs/'+ORG_A+'/keys/rls-a':'rls-a').run().catch(e=>e)).message?.match(/row-level security/)?.[0],'row-level security',table+': A cannot move a row into company B');
  }
  // Inserting into another company is refused; into one's own, allowed.
  const board=(id,org)=>`INSERT INTO storyboards(id,org_id,owner,data,created_at,updated_at) VALUES('${id}','${org}','orgs/${org}/users/x/','{}',1,1)`;
  for(const [db,who] of [[a,'A'],[invited,'invited-only'],[nobody,'no user']])
   await assert.rejects(()=>db.prepare(board('rls-into-b-'+who.length,ORG_B)).run(),/row-level security/,who+' cannot insert into company B');
  await assert.rejects(()=>invited.prepare(board('rls-invited',ORG_A)).run(),/row-level security/,'an invitation alone writes nothing');
  assert.equal((await a.prepare(board('rls-own-a',ORG_A)).run()).meta.changes,1,'A writes in company A');
  assert.equal((await staff.prepare(board('rls-staff-b',ORG_B)).run()).meta.changes,1,'staff may write in any company');
  // Becoming active (accepting the invitation) opens company A, and only it.
  await admin.unsafe(`select accounts.studio_accept_membership('${INVITED}')`);
  assert.deepEqual(await orgsSeen(invited,'storyboards'),[ORG_A,ORG_A],'after accepting: company A only');
  // Superuser rows untouched by everything above.
  const [{n}]=await admin`select count(*)::int as n from studio.storyboards where org_id=${ORG_B}`;assert.equal(n,2);
 }finally{await admin.unsafe(`update accounts.members set status='invited', joined_at=null where user_id='${INVITED}'`);await sql.end({timeout:5})}
});
test('the accounts views give the studio role what it needs and nothing else',{skip},async()=>{
 await setup();
 const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});
 try{
  const [m]=await app`select count(*)::int as n from accounts.studio_memberships where user_id=${USER_A}`;assert.equal(m.n,1);
  const [e]=await app`select accounts.entitlements(${ORG_A}::uuid) as e`;assert.equal(e.e.legacy,true);
  for(const t of ['members','staff','organisations','invitations','cars','configurator_access','organisation_brands'])
   await assert.rejects(()=>app.unsafe('select * from accounts.'+t),/permission denied/,'no direct access to accounts.'+t);
  await assert.rejects(()=>app`select * from auth.users`,/permission denied/);
  await assert.rejects(()=>app`update accounts.studio_memberships set role='owner'`,/permission denied|cannot update/);
 }finally{await app.end({timeout:5})}
});
