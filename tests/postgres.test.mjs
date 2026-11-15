// Runs the studio's database layer against a real Postgres (17) when
// TEST_DATABASE_URL points at a disposable database as a superuser, e.g.
// (the owner's setup SQL itself runs as a non-superuser CREATEROLE role, as on
// hosted Supabase)
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
import {register} from 'node:module';
// lib/credits/store.ts uses extensionless imports, like the rest of lib/.
register('../scripts/verify/hooks.mjs',import.meta.url);

const ADMIN=process.env.TEST_DATABASE_URL;
const skip=ADMIN?false:'TEST_DATABASE_URL is not set: Postgres adapter, migration and privilege tests skipped';
if(skip)console.log('# '+skip);
const PASSWORD='local-test-password-0123456789';
// Stands in for hosted Supabase's SQL-editor user (not a superuser; CREATEROLE).
const SETUP_ROLE='studio_setup_test';
const TABLES=['film_budgets','films','swap_jobs','storyboards','image_jobs','topaz_jobs','staff_access_log'];
const MIGRATIONS=['0001_studio.sql','0002_accounts_access.sql','0003_credits.sql','0004_environment.sql'];
// Client work, filtered by environment (0004); the holds and the staff log record it.
const SCOPED=['films','swap_jobs','storyboards','image_jobs','topaz_jobs','film_budgets'];
const RECORDED=['credit_holds','staff_access_log'];
// The environment these tests run as: no VERCEL_ENV, not production.
const ENV='development';
// S3: the credits and support-access tables (their own tests below).
const CREDIT_TABLES=['credit_accounts','credit_holds','support_grants'];
// Synthetic companies and people in the accounts fixture.
const ORG_A='0000000a-0000-4000-8000-00000000000a',ORG_B='0000000b-0000-4000-8000-00000000000b',ORG_N='00000001-0000-4000-8000-000000000001';
// Company C and its owner and creator: the credits and support-access tests.
const ORG_C='0000000c-0000-4000-8000-00000000000c',USER_C='00000000-0000-4000-8000-0000000000e1',USER_D='00000000-0000-4000-8000-0000000000e2';
const USER_A='00000000-0000-4000-8000-0000000000a1',USER_B='00000000-0000-4000-8000-0000000000b1',INVITED='00000000-0000-4000-8000-0000000000c1',STAFF='00000000-0000-4000-8000-0000000000d1';
const ownerOf=(org,user)=>`orgs/${org}/users/${user}/`;
const asRole=(url,user,password)=>{const u=new URL(url);u.username=user;u.password=password;return u.href};
const ssl=url=>/[?&]sslmode=disable\b/.test(url)?false:'require';

let admin,setupUser,appUrl,migrate,connect,StudioDatabase,toPositional,CreditStore,LOCK_CREDITS_SQL,RESERVE_CREDITS_SQL;
const setupSql=()=>readFileSync(new URL('../docs/supabase-setup.sql',import.meta.url),'utf8').replaceAll('REPLACE_WITH_A_LONG_RANDOM_PASSWORD',PASSWORD);
const migrationSql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
after(async()=>{await setupUser?.end({timeout:5});await admin?.end({timeout:5})});
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
 // No studio role yet, as in a new project: the setup SQL creates it.
 await admin.unsafe(`do $$ begin
   if exists (select 1 from pg_roles where rolname='${SETUP_ROLE}') then
    execute 'reassign owned by ${SETUP_ROLE} to current_user'; execute 'drop owned by ${SETUP_ROLE}'; execute 'drop role ${SETUP_ROLE}';
   end if;
   if exists (select 1 from pg_roles where rolname='studio_app') then execute 'drop owned by studio_app'; execute 'drop role studio_app'; end if;
  end $$;`);
 // The admin's accounts schema (synthetic), then the owner's one-time setup.
 await admin.unsafe(readFileSync(new URL('./fixtures/accounts-schema.sql',import.meta.url),'utf8'));
 // The setup runs as hosted Supabase's SQL-editor user is: not a superuser, with
 // CREATEROLE, owning the admin's accounts objects (its migrations ran as that
 // user) and allowed to read auth.users and create schemas.
 await admin.unsafe(`create role ${SETUP_ROLE} login createrole nosuperuser password '${PASSWORD}';
  grant create on database "${new URL(ADMIN).pathname.slice(1)}" to ${SETUP_ROLE};
  alter schema accounts owner to ${SETUP_ROLE};
  do $$ declare t text; begin
   for t in select tablename from pg_tables where schemaname='accounts' loop execute format('alter table accounts.%I owner to ${SETUP_ROLE}',t); end loop;
  end $$;
  alter function accounts.entitlements(uuid) owner to ${SETUP_ROLE};
  alter function accounts.credits_balance(uuid) owner to ${SETUP_ROLE};
  alter function accounts.refuse_change() owner to ${SETUP_ROLE};
  grant usage on schema auth to ${SETUP_ROLE}; grant select on auth.users to ${SETUP_ROLE};`);
 setupUser=postgres(asRole(ADMIN,SETUP_ROLE,PASSWORD),{max:1,prepare:false,ssl:ssl(ADMIN),onnotice:()=>{}});
 const [who]=await setupUser`select rolsuper,rolcreaterole from pg_roles where rolname=current_user`;
 assert.deepEqual({...who},{rolsuper:false,rolcreaterole:true},'the setup SQL runs as a non-superuser with CREATEROLE');
 await admin.unsafe(`insert into auth.users(id,email) values ('${USER_C}','c@example.test'),('${USER_D}','d@example.test'),('${USER_A}','a@example.test'),('${USER_B}','b@example.test'),('${INVITED}','invited@example.test'),('${STAFF}','staff@example.test') on conflict (id) do nothing;
  insert into accounts.organisations(id,name,kind) values ('${ORG_C}','Company C','client'),('${ORG_A}','Company A','client'),('${ORG_B}','Company B','client'),('${ORG_N}','Nmesis','internal') on conflict (id) do nothing;
  insert into accounts.members(org_id,user_id,role,status) values ('${ORG_C}','${USER_C}','owner','active'),('${ORG_C}','${USER_D}','creator','active'),('${ORG_A}','${USER_A}','owner','active'),('${ORG_B}','${USER_B}','owner','active'),('${ORG_A}','${INVITED}','creator','invited')
   on conflict (org_id,user_id) do update set status=excluded.status, role=excluded.role;
  insert into accounts.staff(user_id,name,role,active) values ('${STAFF}','Staff','ops',true) on conflict (user_id) do nothing;`);
 await setupUser.unsafe(setupSql());
 // Data the studio role must never reach.
 await admin.unsafe(`create table public.secret_probe(id int); insert into public.secret_probe values(1);
  create schema other_app; create table other_app.secret_probe(id int); insert into other_app.secret_probe values(1);`);
 appUrl=asRole(ADMIN,'studio_app',PASSWORD);
 ({migrate}=await import('../scripts/migrate.mjs'));
 ({connect,StudioDatabase,toPositional}=await import('../lib/portable/database.ts'));
 ({CreditStore,LOCK_CREDITS_SQL,RESERVE_CREDITS_SQL}=await import('../lib/credits/store.ts'));
}

test('migrations apply once, are idempotent, and refuse a changed file; rows from before 0004 are Production\'s',{skip},async()=>{
 await setup();const log=[];
 // As on the hosted project: 0001–0003 already applied, with work in every table.
 const before=mkdtempSync(join(tmpdir(),'studio-migrations-before-'));
 try{
  for(const m of MIGRATIONS.slice(0,3))writeFileSync(join(before,m),migrationSql(m));
  assert.deepEqual(await migrate(appUrl,{folder:pathToFileURL(before+'/'),log:x=>log.push(x)}),MIGRATIONS.slice(0,3));
 }finally{rmSync(before,{recursive:true,force:true})}
 for(const table of SCOPED)await admin.unsafe(...ROW[table]('legacy-1',ORG_A));
 await admin.unsafe(`insert into studio.credit_holds(id,org_id,actor,tool,action,provider,billing,credits,created_at,updated_at,expires_at) values('legacy-hold','${ORG_A}','x','t','a','p','credits',1,1,1,1)`);
 await admin.unsafe(ROW.staff_access_log('legacy-1',ORG_A)[0],ROW.staff_access_log('legacy-1',ORG_A)[1]);
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),MIGRATIONS.slice(3));
 for(const table of [...SCOPED,...RECORDED]){
  const rows=await admin.unsafe(`select environment from studio.${table}`);
  assert.ok(rows.length>0,table+' has its existing row');
  assert.deepEqual([...new Set(rows.map(r=>r.environment))],['production'],table+': existing rows are Production\'s');
  await admin.unsafe(`delete from studio.${table}`);
 }
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),[]);
 const [m1,m2,m3,m4]=MIGRATIONS;
 assert.deepEqual(log,[...[m1,m2,m3].map(m=>'Applied: '+m),...[m1,m2,m3].map(m=>'Already applied: '+m),'Applied: '+m4,...MIGRATIONS.map(m=>'Already applied: '+m)]);
 const folder=mkdtempSync(join(tmpdir(),'studio-migrations-'));
 try{
  const original=readFileSync(new URL('../supabase/migrations/0001_studio.sql',import.meta.url),'utf8');
  writeFileSync(join(folder,'0001_studio.sql'),original+'\n-- edited after it was applied\n');
  await assert.rejects(()=>migrate(appUrl,{folder:pathToFileURL(folder+'/'),log:()=>{}}),/Previously applied migration changed: 0001_studio.sql/);
  // A second run of everything: the owner's setup (all five sections, again as the
  // non-superuser setup role) and both
  // migrations, outside the ledger. Each is idempotent.
  await setupUser.unsafe(setupSql());
  const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});try{for(const m of MIGRATIONS)await app.unsafe(migrationSql(m))}finally{await app.end({timeout:5})}
  assert.deepEqual(await migrate(appUrl,{log:()=>{}}),[]);
 }finally{rmSync(folder,{recursive:true,force:true})}
});

test('every table has org_id and RLS; anon/authenticated are refused; studio_app reaches only its schema',{skip},async()=>{
 await setup();
 const tables=await admin`select c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner,
   exists(select 1 from information_schema.columns k where k.table_schema='studio' and k.table_name=c.relname and k.column_name='org_id' and k.is_nullable='NO') as org_id
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' order by 1`;
 assert.deepEqual(tables.map(t=>t.relname).sort(),['__studio_migrations','car_settings',...TABLES,...CREDIT_TABLES].sort());
 const envColumns=(await admin`select table_name from information_schema.columns where table_schema='studio' and column_name='environment' and is_nullable='NO'`).map(r=>r.table_name).sort();
 assert.deepEqual(envColumns,[...SCOPED,...RECORDED].sort(),'client work and the shared records carry their environment');
 for(const t of SCOPED){const [{q}]=await admin`select pg_get_expr(p.polqual,p.polrelid) as q from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relname=${t}`;assert.match(q,/environment = \( SELECT studio\.request_env\(\)/,t+' policy filters by environment')}
 for(const t of tables){assert.equal(t.relrowsecurity,true,t.relname+' RLS');assert.equal(t.owner,'studio_app');if(!['__studio_migrations','car_settings'].includes(t.relname))assert.equal(t.org_id,true,t.relname+' org_id')}
 const forced=await admin`select c.relname, c.relforcerowsecurity as forced, (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' and c.relname<>'__studio_migrations'`;
 for(const t of forced){assert.equal(t.forced,true,t.relname+' forced RLS');assert.equal(t.policies,t.relname==='support_grants'?4:1,t.relname+' policies')}
 const [role]=await admin`select rolsuper,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname='studio_app'`;
 assert.deepEqual({...role},{rolsuper:false,rolbypassrls:false,rolinherit:false,rolcanlogin:true});
 for(const api of ['anon','authenticated'])for(const table of [...TABLES,...CREDIT_TABLES])
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
// A row written as the superuser, in one environment (what the adapter's
// studio.env does for the Studio's own statements).
const insertIn=(env,[text,args])=>admin.begin(async tx=>{await tx`select set_config('studio.env', ${env}, true)`;await tx.unsafe(text,args)});
test('RLS: a member sees and changes only their company; invited-only and no user see nothing; staff see all',{skip},async()=>{
 await setup();
 for(const table of TABLES){await admin.unsafe(`delete from studio.${table}`);for(const org of [ORG_A,ORG_B])await insertIn(ENV,ROW[table]('rls-'+org.slice(7,8),org))}
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

// ── S3: credits on Postgres (V1, V2, record_usage, the views) ────────────────
// The ledger is append-only, so every test spends in a company of its own: USER_C
// is its owner and USER_D a creator. Its plan grants `monthly` credits a month
// from a subscription that started today.
let orgCount=0;
async function companyWith(monthly){
 const org=`0000c${String(++orgCount).padStart(3,'0')}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12,'0')}`;
 await admin.unsafe(`insert into accounts.organisations(id,name,kind) values ('${org}','Credits ${orgCount}','client');
  insert into accounts.members(org_id,user_id,role,status) values ('${org}','${USER_C}','owner','active'),('${org}','${USER_D}','creator','active');
  insert into accounts.plan_features(plan_id,feature_key,value) values ('credits-${monthly}','studio.credits_monthly','${monthly}'::jsonb) on conflict (plan_id,feature_key) do nothing;
  insert into accounts.subscriptions(org_id,plan_id,status,starts_on) values ('${org}','credits-${monthly}','active',(now() at time zone 'utc')::date);`);
 return org;
}
const holdFor=(org,i,credits=10)=>({id:`hold-${org.slice(0,8)}-${String(i).padStart(3,'0')}`,org,actor:USER_C,tool:'studio.key_visuals',action:'Key visual',provider:'openai',billing:'credits',credits,costMicros:credits*40000,expiresAt:Date.now()+600_000});
const settleOf=(h,credits=h.credits)=>({holdId:h.id,org:h.org,actor:h.actor,tool:h.tool,credits,provider:h.provider,costUsd:h.costMicros/1e6,action:h.action});
const balanceOf=async org=>(await admin`select accounts.credits_balance(${org}::uuid) as b`)[0].b;

test('V1 credits: 20 concurrent actions against a balance that fits 10: exactly 10 hold, and the ledger and holds add up',{skip},async()=>{
 await setup();const org=await companyWith(100);
 process.env.DATABASE_POOL_MAX='24';const sql=connect(appUrl);delete process.env.DATABASE_POOL_MAX;
 try{
  const store=new CreditStore(new StudioDatabase(sql).forUser(USER_C));
  const holds=Array.from({length:20},(_,i)=>holdFor(org,i));
  const won=await Promise.all(holds.map(h=>store.reserve(h)));
  console.log('# V1 reservations (20 concurrent, 10 credits each, 100 available):',won.map(Number).join(''));
  assert.equal(won.filter(Boolean).length,10,'exactly 10 succeed');
  const [held]=await admin`select count(*)::int as n, coalesce(sum(credits),0)::int as credits from studio.credit_holds where org_id=${org} and status='held'`;
  assert.deepEqual({...held},{n:10,credits:100},'ten holds of 10 credits');
  // The ten winners settle concurrently (twice each: a retried settlement is recorded once).
  const winners=holds.filter((_,i)=>won[i]);
  await Promise.all([...winners,...winners].map(h=>store.settle(settleOf(h))));
  const [ledger]=await admin`select count(*)::int as rows, count(distinct ref)::int as refs, coalesce(-sum(credits),0)::int as spent, coalesce(sum(provider_cost_usd),0)::float as cost from accounts.usage_ledger where org_id=${org}`;
  assert.deepEqual({...ledger},{rows:10,refs:10,spent:100,cost:4},'ten ledger rows, 100 credits, the provider cost kept for Nmesis');
  const [settled]=await admin`select count(*)::int as n, coalesce(sum(charged),0)::int as charged from studio.credit_holds where org_id=${org} and status='settled'`;
  assert.deepEqual({...settled},{n:10,charged:100},'every winner settled, none left held');
  assert.equal(Number((await balanceOf(org)).total),0,'the balance is spent');
  assert.equal(await store.reserve(holdFor(org,99)),false,'and the next action is refused');
  console.log('# V1 ledger:',JSON.stringify(ledger),'holds settled:',JSON.stringify(settled),'balance after:',JSON.stringify(await balanceOf(org)));
 }finally{await sql.end({timeout:5})}
});

test('V1 credits: the company lock is what serialises two overlapping reservations',{skip},async()=>{
 await setup();const org=await companyWith(15);const sql=connect(appUrl);
 // What the database layer sends with every statement: the person and the environment.
 const asUser=tx=>tx`select set_config('studio.user_id', ${USER_C}, true), set_config('studio.env', ${ENV}, true)`;
 const args=h=>[h.id,h.org,h.actor,h.tool,h.action,h.provider,h.billing,h.credits,h.costMicros,null,Date.now(),Date.now(),h.expiresAt,h.org,h.org,Date.now(),h.credits];
 try{
  // A holds the lock and has reserved 10 of 15 but not committed; B (10) starts meanwhile and waits.
  let release;const gate=new Promise(r=>{release=r});let reservedA;
  const a=sql.begin(async tx=>{await asUser(tx);await tx.unsafe(...q(LOCK_CREDITS_SQL,[org,Date.now()]));reservedA=(await tx.unsafe(...q(RESERVE_CREDITS_SQL,args(holdFor(org,1))))).count;await gate});
  await until(()=>reservedA!==undefined);
  const store=new CreditStore(new StudioDatabase(sql).forUser(USER_C));
  const b=store.reserve(holdFor(org,2));
  await new Promise(r=>setTimeout(r,200));release();await a;
  assert.equal(reservedA,1);assert.equal(await b,false,'B saw A\'s hold once A committed');
  // Control: without the lock, the same overlap lets both through (why the lock exists).
  const org2=await companyWith(15);let releaseC;const gateC=new Promise(r=>{releaseC=r});let reservedC;
  const c=sql.begin(async tx=>{await asUser(tx);reservedC=(await tx.unsafe(...q(RESERVE_CREDITS_SQL,args(holdFor(org2,1))))).count;await gateC});
  await until(()=>reservedC!==undefined);
  const d=await sql.begin(async tx=>{await asUser(tx);return (await tx.unsafe(...q(RESERVE_CREDITS_SQL,args(holdFor(org2,2))))).count});releaseC();await c;
  assert.equal(reservedC,1);assert.equal(d,1,'unlocked reservations overlap: 20 held against 15');
 }finally{await sql.end({timeout:5})}
});

test('V2 credits: a released hold charges nothing and frees its credits',{skip},async()=>{
 await setup();const org=await companyWith(10);const sql=connect(appUrl);
 try{
  const store=new CreditStore(new StudioDatabase(sql).forUser(USER_C)),h=holdFor(org,1);
  assert.equal(await store.reserve(h),true);assert.equal(await store.reserve(holdFor(org,2)),false,'the hold covers the balance');
  await store.release(h.id,org);
  const [row]=await admin`select status from studio.credit_holds where id=${h.id}`;assert.equal(row.status,'released');
  const [{n}]=await admin`select count(*)::int as n from accounts.usage_ledger where org_id=${org}`;assert.equal(n,0,'nothing in the ledger');
  assert.equal(await store.reserve(holdFor(org,3)),true,'the credits are free again');
 }finally{await sql.end({timeout:5})}
});

test('record_usage: allowance first, then packs soonest-expiring first, expired packs never; once per reference; validated',{skip},async()=>{
 await setup();const org=await companyWith(10);
 await admin.unsafe(`insert into accounts.credit_packs(org_id,credits,expires_on) values
  ('${org}',20,(now() at time zone 'utc')::date + 30),('${org}',20,(now() at time zone 'utc')::date + 1),('${org}',50,(now() at time zone 'utc')::date - 1)`);
 const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});
 const record=(credits,ref,provider='openai',actor=USER_C,feature='studio.key_visuals')=>app`select accounts.record_usage(${org}::uuid,${actor},${feature},${credits}::numeric,${provider},${0.04*credits}::numeric,${ref},'{"action":"Key visual"}'::jsonb) as charged`;
 try{
  assert.equal(Number((await balanceOf(org)).total),50,'10 allowance + 40 in unexpired packs (the expired 50 do not count)');
  assert.equal(Number((await record(25,'hold-record-0001'))[0].charged),25);
  const rows=await admin`select -l.credits::int as credits, p.expires_on is not null as pack, (p.expires_on - (now() at time zone 'utc')::date) as days from accounts.usage_ledger l left join accounts.credit_packs p on p.id=l.pack_id where l.org_id=${org} order by l.id`;
  assert.deepEqual(rows.map(r=>({...r})),[{credits:10,pack:false,days:null},{credits:15,pack:true,days:1}],'the allowance, then the pack that expires first');
  assert.equal(Number((await record(25,'hold-record-0001'))[0].charged),25,'the same reference answers what it charged');
  assert.equal((await admin`select count(*)::int as n from accounts.usage_ledger where org_id=${org}`)[0].n,2,'and records nothing again');
  assert.equal(Number((await balanceOf(org)).total),25);
  // The company's own key: 0 credits, provider "own key".
  assert.equal(Number((await record(0,'hold-record-0002','own key'))[0].charged),0);
  for(const [why,run] of [['own key with credits',()=>record(5,'hold-record-0003','own key')],['fractional credits',()=>record(1.5,'hold-record-0004')],['negative credits',()=>record(-1,'hold-record-0005')],['unknown provider',()=>record(1,'hold-record-0006','somewhere')],['actor not a user id',()=>record(1,'hold-record-0007','openai','someone')],['feature outside the Studio',()=>record(1,'hold-record-0008','openai',USER_C,'configurator.cars_max')],['bad reference',()=>record(1,'x')]])
   await assert.rejects(run,/record_usage:/,why);
  // The Studio role reaches the ledger only through the function and the views.
  await assert.rejects(()=>app`insert into accounts.usage_ledger(org_id,credits) values (${org}::uuid,100)`,/permission denied/);
  await assert.rejects(()=>app`select provider_cost_usd from accounts.usage_ledger`,/permission denied/);
  await assert.rejects(()=>admin`update accounts.usage_ledger set credits=0 where org_id=${org}`,/append-only/);
  const cols=async v=>(await admin`select column_name from information_schema.columns where table_schema='accounts' and table_name=${v}`).map(r=>r.column_name);
  for(const v of ['studio_usage','studio_credit_packs','studio_price_book','studio_people'])for(const secret of ['provider_cost_usd','provider','price'])assert.ok(!(await cols(v)).includes(secret),`${v} has no ${secret}`);
  const [usage]=await app`select credits::int as credits, action, own_key from accounts.studio_usage where org_id=${org}::uuid and ref='hold-record-0002'`;
  assert.deepEqual({...usage},{credits:0,action:'Key visual',own_key:true});
 }finally{await app.end({timeout:5})}
});

test('the period the Studio meters: the allowance resets on the subscription\'s billing day',{skip},async()=>{
 await setup();const org=await companyWith(30);
 await admin.unsafe(`update accounts.subscriptions set starts_on='2026-01-09' where org_id='${org}'`);
 const at=day=>admin.begin(async tx=>{await tx`select set_config('test.today', ${day}, true)`;return (await tx`select accounts.credits_balance(${org}::uuid) as b`)[0].b});
 const periods=[];for(const day of ['2026-02-08','2026-02-09','2026-03-08','2026-03-09']){const b=await at(day);periods.push(b.period_from+'..'+b.period_to)}
 assert.deepEqual(periods,['2026-01-09..2026-02-08','2026-02-09..2026-03-08','2026-02-09..2026-03-08','2026-03-09..2026-04-08']);
 // The Studio's meter reads the same period (studio.credits_balance → the admin's function).
 const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});
 try{const [r]=await app`select credits_balance(${org}) as b`;assert.equal(JSON.parse(r.b).monthly,30)}finally{await app.end({timeout:5})}
});

test('support access (RLS): the owner grants, a creator cannot, staff may read but never write, other companies see nothing',{skip},async()=>{
 await setup();const sql=connect(appUrl),base=new StudioDatabase(sql);
 const owner=base.forUser(USER_C),creator=base.forUser(USER_D),staff=base.forUser(STAFF),other=base.forUser(USER_A);
 const grant=(db,until)=>db.prepare('INSERT INTO support_grants(org_id,granted_by,granted_at,until,note) VALUES(?,?,CAST(? AS BIGINT),CAST(? AS BIGINT),?) ON CONFLICT(org_id) DO UPDATE SET until=excluded.until').bind(ORG_C,USER_C,Date.now(),until,'Please look at the line-up').run();
 try{
  await assert.rejects(()=>grant(creator,Date.now()+86_400_000),/row-level security/,'a creator cannot grant');
  await assert.rejects(()=>grant(staff,Date.now()+86_400_000),/row-level security/,'staff cannot grant themselves access');
  assert.equal((await grant(owner,Date.now()+7*86_400_000)).meta.changes,1,'the owner grants for 7 days');
  assert.equal((await staff.prepare('SELECT org_id FROM support_grants WHERE org_id=?').bind(ORG_C).all()).results.length,1,'staff read it');
  assert.equal((await creator.prepare('SELECT org_id FROM support_grants').all()).results.length,1,'the company\'s members read it');
  assert.equal((await other.prepare('SELECT org_id FROM support_grants').all()).results.length,0,'another company sees nothing');
  assert.equal((await staff.prepare('UPDATE support_grants SET until=until+1 WHERE org_id=?').bind(ORG_C).run()).meta.changes,0,'staff cannot extend it');
  assert.equal((await staff.prepare('DELETE FROM support_grants WHERE org_id=?').bind(ORG_C).run()).meta.changes,0,'or remove it');
  // The admin's "Open in Studio" button asks as the member of staff who would open it.
  const access=async(org,who)=>(await admin`select accounts.studio_support_access(${org}::uuid, ${who}::uuid) as a`)[0].a;
  assert.equal((await access(ORG_C,STAFF)).granted,true);
  assert.equal((await access(ORG_C,USER_A)).granted,false,'not staff: nothing');
  assert.equal((await access(ORG_B,STAFF)).granted,false,'no grant: "Support access not granted"');
  await assert.rejects(()=>owner.prepare('UPDATE support_grants SET until=CAST(? AS BIGINT) WHERE org_id=?').bind(Date.now()-86_400_000,ORG_C).run(),/support_grants_until_ck/,'until may not go before the grant itself');
  assert.equal((await owner.prepare('UPDATE support_grants SET granted_at=CAST(? AS BIGINT),until=CAST(? AS BIGINT) WHERE org_id=?').bind(Date.now()-2000,Date.now()-1000,ORG_C).run()).meta.changes,1,'the owner ends it');
  assert.equal((await access(ORG_C,STAFF)).granted,false,'an ended grant is refused');
 }finally{await sql.end({timeout:5})}
});

// Production and Preview share the database (owner, 2026-11-15). Each sees and
// writes only its own client work, for members and staff alike, whatever the
// statement asks for.
test('environments: Production and Preview never see, change or take each other\'s client work',{skip},async()=>{
 await setup();
 for(const table of SCOPED){
  await admin.unsafe(`delete from studio.${table}`);
  await insertIn('production',ROW[table]('prod-1',ORG_A));
  await insertIn('preview',ROW[table]('prev-1',ORG_A));
 }
 const sql=connect(appUrl);
 const prod=new StudioDatabase(sql,null,'production'),prev=new StudioDatabase(sql,null,'preview');
 const key=t=>KEY[t]||'id',idOf=(t,id)=>t==='film_budgets'?'orgs/'+ORG_A+'/keys/'+id:id;
 const seen=async(db,t)=>(await db.prepare(`SELECT ${key(t)} AS k FROM ${t} ORDER BY 1`).all()).results.map(r=>r.k);
 try{
  for(const [who,user] of [['the owner',USER_A],['staff',STAFF]]){
   const p=prod.forUser(user),v=prev.forUser(user);
   for(const t of SCOPED){
    assert.deepEqual(await seen(p,t),[idOf(t,'prod-1')],`${t}: ${who} on Production sees only Production's row`);
    assert.deepEqual(await seen(v,t),[idOf(t,'prev-1')],`${t}: ${who} on Preview sees only Preview's row`);
    // Naming the other environment's row changes nothing.
    assert.equal((await v.prepare(`UPDATE ${t} SET org_id=org_id WHERE ${key(t)}=?`).bind(idOf(t,'prod-1')).run()).meta.changes,0,t+': Preview updates nothing of Production');
    assert.equal((await v.prepare(`DELETE FROM ${t} WHERE ${key(t)}=?`).bind(idOf(t,'prod-1')).run()).meta.changes,0,t+': Preview deletes nothing of Production');
    assert.equal((await p.prepare(`DELETE FROM ${t} WHERE ${key(t)}=?`).bind(idOf(t,'prev-1')).run()).meta.changes,0,t+': Production deletes nothing of Preview');
    // Nor can a row be moved across, or written straight into the other environment.
    await assert.rejects(()=>v.prepare(`UPDATE ${t} SET environment='production' WHERE ${key(t)}=?`).bind(idOf(t,'prev-1')).run(),/row-level security/,t+': a Preview row cannot become Production\'s');
   }
  }
  const owner=prev.forUser(USER_A);
  const board=(id,env)=>`INSERT INTO storyboards(id,org_id,owner,data,created_at,updated_at${env?',environment':''}) VALUES('${id}','${ORG_A}','orgs/${ORG_A}/users/x/','{}',1,1${env?",'"+env+"'":''})`;
  await assert.rejects(()=>owner.prepare(board('prev-into-prod','production')).run(),/row-level security/,'Preview cannot write a Production row');
  assert.equal((await owner.prepare(board('prev-own')).run()).meta.changes,1,'Preview writes its own row');
  const [{environment}]=await admin`select environment from studio.storyboards where id='prev-own'`;
  assert.equal(environment,'preview','a new row takes the environment of the request by default');
  // An id (an application UUID) is unique across both environments: a reused id
  // is refused, never merged into the other environment's row.
  await insertIn('production',ROW.storyboards('same-id',ORG_A));
  assert.equal((await owner.prepare(board('same-id')).run().catch(e=>e)).message?.match(/duplicate key/)?.[0],'duplicate key','storyboard ids are application UUIDs; a reused id is refused, not merged across');
  // One active upscale per source image, per environment.
  const active=(env,id)=>insertIn(env,[`insert into studio.topaz_jobs(id,org_id,owner,parent_id,status,data,created_at,updated_at) values($1,$2,$3,'same-parent','queued','{}',1,1)`,[id,ORG_A,'orgs/'+ORG_A+'/users/x/']]);
  await active('production','up-prod');await active('preview','up-prev');
  await assert.rejects(()=>active('preview','up-prev-2'),/topaz_jobs_env_one_active/,'a second active upscale in the same environment is refused');
  // A request that says no environment (or an unknown one) reads nothing and writes nothing.
  for(const env of [null,'staging']){
   const rows=await sql.begin(tx=>[tx`select set_config('studio.user_id', ${USER_A}, true), set_config('studio.env', ${env||''}, true)`,tx`select count(*)::int as n from studio.storyboards`]);
   assert.equal(rows[1][0].n,0,`environment ${env}: nothing to read`);
   await assert.rejects(()=>sql.begin(tx=>[tx`select set_config('studio.user_id', ${USER_A}, true), set_config('studio.env', ${env||''}, true)`,tx.unsafe(board('no-env-'+(env||'none')))]),/null value in column "environment"|row-level security/,`environment ${env}: nothing written`);
  }
  // The credit holds stay shared: both environments spend the one company
  // balance, so a Preview hold counts against a Production reservation.
  await admin.unsafe(`delete from studio.credit_holds where org_id='${ORG_A}'`);
  const holds=n=>({id:'env-hold-'+n,org:ORG_A,actor:USER_A,tool:'studio.key_visuals',action:'Key visual',provider:'openai',billing:'own key',credits:0,costMicros:0,expiresAt:Date.now()+60000});
  assert.equal(await new CreditStore(prev.forUser(USER_A)).reserve(holds(1)),true);
  const [{env:holdEnv}]=await admin`select environment as env from studio.credit_holds where id='env-hold-1'`;assert.equal(holdEnv,'preview','the hold records where it came from');
  assert.equal((await prod.forUser(USER_A).prepare("SELECT id FROM credit_holds WHERE id='env-hold-1'").all()).results.length,1,'and Production counts it');
 }finally{await sql.end({timeout:5})}
});
