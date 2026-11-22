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
const TABLES=['film_budgets','films','swap_jobs','storyboards','image_jobs','topaz_jobs','staff_access_log','folders','folder_items','library_items'];
const MIGRATIONS=['0001_studio.sql','0002_accounts_access.sql','0003_credits.sql','0004_environment.sql','0005_trash.sql','0006_folders.sql','0007_library_index.sql','0008_alert_recipients.sql','0009_library_backfills.sql','0010_brand_kits.sql','0011_shares.sql','0012_designs.sql','0013_brand_fonts.sql'];
// Client work, filtered by environment (0004); the holds and the staff log record it.
// The tables 0004 scoped (they existed before it); 0006 adds folders scoped the same way from the start.
const SCOPED_0004=['films','swap_jobs','storyboards','image_jobs','topaz_jobs','film_budgets'];
const SCOPED=[...SCOPED_0004,'folders','folder_items','library_items'];
// 0009: one mark per company and environment (no id, so not in the per-row tests); scoped and RLS-checked like client work.
const MARKS=['library_backfills'];
// 0010 (the brand kit) and 0011 (who can see a piece of work, public view links): company records, scoped and RLS-checked like client work.
MARKS.push('brand_kits','brand_logos','work_access','share_links');
// 0012 (the editor's version history and soft lock): company records, scoped and RLS-checked like client work.
MARKS.push('design_versions','design_presence');
// 0013 (the company's own font files): members read, only owners write; scoped and RLS-checked like client work.
MARKS.push('brand_fonts');
const RECORDED=['credit_holds','staff_access_log'];
// The environment these tests run as: no VERCEL_ENV, not production.
const ENV='development';
// S3: the credits and support-access tables (their own tests below).
const CREDIT_TABLES=['credit_accounts','credit_holds','support_grants','alert_recipients'];
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
 for(const table of SCOPED_0004)await admin.unsafe(...ROW[table]('legacy-1',ORG_A));
 await admin.unsafe(`insert into studio.credit_holds(id,org_id,actor,tool,action,provider,billing,credits,created_at,updated_at,expires_at) values('legacy-hold','${ORG_A}','x','t','a','p','credits',1,1,1,1)`);
 await admin.unsafe(ROW.staff_access_log('legacy-1',ORG_A)[0],ROW.staff_access_log('legacy-1',ORG_A)[1]);
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),MIGRATIONS.slice(3));
 for(const table of [...SCOPED_0004,...RECORDED]){
  const rows=await admin.unsafe(`select environment from studio.${table}`);
  assert.ok(rows.length>0,table+' has its existing row');
  assert.deepEqual([...new Set(rows.map(r=>r.environment))],['production'],table+': existing rows are Production\'s');
  await admin.unsafe(`delete from studio.${table}`);
 }
 assert.deepEqual(await migrate(appUrl,{log:x=>log.push(x)}),[]);
 const [m1,m2,m3,...later]=MIGRATIONS;
 assert.deepEqual(log,[...[m1,m2,m3].map(m=>'Applied: '+m),...[m1,m2,m3].map(m=>'Already applied: '+m),...later.map(m=>'Applied: '+m),...MIGRATIONS.map(m=>'Already applied: '+m)]);
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
 assert.deepEqual(tables.map(t=>t.relname).sort(),['__studio_migrations','car_settings',...TABLES,...MARKS,...CREDIT_TABLES].sort());
 const envColumns=(await admin`select table_name from information_schema.columns where table_schema='studio' and column_name='environment' and is_nullable='NO'`).map(r=>r.table_name).sort();
 assert.deepEqual(envColumns,[...SCOPED,...MARKS,...RECORDED].sort(),'client work and the shared records carry their environment');
 // Every policy of each scoped table: its condition, or its check for an insert policy (which has no condition).
 for(const t of [...SCOPED,...MARKS]){
  const policies=await admin`select p.polname, coalesce(pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) as q from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relname=${t} order by p.polname`;
  assert.ok(policies.length>0,t+' has a policy');
  for(const {polname,q} of policies)assert.match(q,/environment = \( SELECT studio\.request_env\(\)/,t+' policy '+polname+' filters by environment');
 }
 for(const t of tables){assert.equal(t.relrowsecurity,true,t.relname+' RLS');assert.equal(t.owner,'studio_app');if(!['__studio_migrations','car_settings'].includes(t.relname))assert.equal(t.org_id,true,t.relname+' org_id')}
 const forced=await admin`select c.relname, c.relforcerowsecurity as forced, (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' and c.relname<>'__studio_migrations'`;
 for(const t of forced){assert.equal(t.forced,true,t.relname+' forced RLS');assert.equal(t.policies,['support_grants','alert_recipients'].includes(t.relname)?4:t.relname==='share_links'?4:t.relname==='library_items'?2:t.relname==='brand_fonts'?3:1,t.relname+' policies')}
 const [role]=await admin`select rolsuper,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname='studio_app'`;
 assert.deepEqual({...role},{rolsuper:false,rolbypassrls:false,rolinherit:false,rolcanlogin:true});
 for(const api of ['anon','authenticated'])for(const table of [...TABLES,...MARKS,...CREDIT_TABLES])
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
 folders:(id,org)=>[`insert into studio.folders(id,org_id,name,created_by,created_at,updated_at) values($1,$2,'Folder',$3,1,1)`,[id,org,'orgs/'+org+'/users/x/']],
 folder_items:(id,org)=>[`insert into studio.folder_items(org_id,item_kind,item_id,folder_id,updated_at) values($2,'visual',$1,'f',1)`,[id,org]],
 library_items:(id,org)=>[`insert into studio.library_items(org_id,kind,id,owner,title,tool,status,created_at,updated_at) values($2,'visual',$1,$3,'Demo SUV','Key visual','ready',1,1)`,[id,org,'orgs/'+org+'/users/x/']],
};
const KEY={film_budgets:'payer',folder_items:'item_id'};
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
  // Brands (Phase 3 polish): each company's brands with a name, read-only.
  await admin.unsafe(`insert into accounts.organisation_brands(org_id,brand_id) values ('${ORG_A}','pgbrand') on conflict do nothing; insert into accounts.cars(brand_id,model_id,brand_name,model_name,configurator_url,live) values ('pgbrand','one','PG Brand','PG Brand One','/pgbrand/one/',true) on conflict do nothing`);
  const brands=await app`select brand_id,brand_name from accounts.studio_brands where org_id=${ORG_A}::uuid and brand_id='pgbrand'`;
  assert.deepEqual(brands.map(b=>[b.brand_id,b.brand_name]),[['pgbrand','PG Brand']]);
  await assert.rejects(()=>app`delete from accounts.studio_brands`,/permission denied|cannot delete/);
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

test('one statement each, every value a parameter: the meter (balance, holds, packs) and the person (staff role, memberships)',{skip},async()=>{
 await setup();const org=await companyWith(30);const sql=connect(appUrl),db=new StudioDatabase(sql).forUser(USER_C);
 const {METER_SQL}=await import('../lib/credits/store.ts');
 const {postgresDirectory}=await import('../lib/accounts/directory.ts');
 try{
  // The combined meter runs as written (no fallback) and agrees with the balance.
  const row=await db.prepare(METER_SQL).bind(org,org,Date.now(),org,new Date(Date.now()-31*86_400_000).toISOString()).first();
  assert.equal(JSON.parse(row.b).monthly,30);assert.equal(Number(row.held),0);assert.equal(Number(row.packs),0);
  const meter=await new CreditStore(db).meter(org);assert.equal(meter.periodFrom,JSON.parse(row.b).period_from.slice(0,10));
  // The person read gives exactly what the two separate reads give.
  const dir=postgresDirectory(db);
  for(const who of [USER_C,STAFF])assert.deepEqual(await dir.person(who),{staffRole:await dir.staffRole(who),memberships:await dir.memberships(who)});
 }finally{await sql.end({timeout:5})}
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

// Delete and restore (lib/trash.ts, 0005): the same statements, as the Studio's
// role, under row level security and the environment rule.
test('trash: a member deletes and restores their company’s work; another company or environment cannot',{skip},async()=>{
 await setup();
 for(const t of ['films','swap_jobs','storyboards']){await admin.unsafe(`delete from studio.${t}`);await insertIn('production',ROW[t]('trash-1',ORG_A))}
 const sql=connect(appUrl);
 const prod=new StudioDatabase(sql,null,'production'),prev=new StudioDatabase(sql,null,'preview');
 try{
  for(const t of ['films','swap_jobs','storyboards']){
   const a=prod.forUser(USER_A),now=Date.now();
   const trash=db=>db.prepare(`UPDATE ${t} SET deleted_at=? WHERE id=? AND org_id=? AND deleted_at IS NULL AND lock_until<?`).bind(now,'trash-1',ORG_A,now+1).run();
   assert.equal((await trash(prev.forUser(USER_A))).meta.changes,0,t+': Preview cannot delete Production’s row');
   assert.equal((await trash(prod.forUser(USER_B))).meta.changes,0,t+': another company cannot delete it');
   assert.equal((await trash(a)).meta.changes,1,t+': its company deletes it');
   assert.equal((await trash(a)).meta.changes,0,t+': once');
   const list=async deleted=>(await a.prepare(`SELECT id FROM ${t} WHERE org_id=? AND deleted_at IS ${deleted?'NOT ':''}NULL`).bind(ORG_A).all()).results.map(r=>r.id);
   assert.deepEqual(await list(false),[],t+': left the list');
   assert.deepEqual(await list(true),['trash-1'],t+': in Deleted');
   assert.equal(typeof (await a.prepare(`SELECT deleted_at FROM ${t} WHERE id=?`).bind('trash-1').first('deleted_at')),'number',t+': deleted_at reads back as a number');
   assert.equal((await a.prepare(`UPDATE ${t} SET deleted_at=NULL WHERE id=? AND org_id=?`).bind('trash-1',ORG_A).run()).meta.changes,1,t+': restored');
   assert.deepEqual(await list(false),['trash-1'],t+': back in the list');
  }
 }finally{await sql.end({timeout:5})}
});

// Folders (0006) as lib/folders.ts writes them: a member's company only, its
// environment only, one folder per piece of work, and a deleted folder keeps
// its memberships for Undo.
test('folders: a member files work in their company’s folders; another company or environment sees nothing',{skip},async()=>{
 await setup();
 for(const t of ['folders','folder_items'])await admin.unsafe(`delete from studio.${t}`);
 const sql=connect(appUrl);
 const prod=new StudioDatabase(sql,null,'production'),prev=new StudioDatabase(sql,null,'preview');
 try{
  const a=prod.forUser(USER_A),owner=ownerOf(ORG_A,USER_A);
  assert.equal((await a.prepare('INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('folder-a1',ORG_A,null,'Launch',owner,1,1).run()).meta.changes,1);
  await assert.rejects(()=>a.prepare('INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('folder-b1',ORG_B,null,'Not mine',owner,1,1).run(),/row-level security/,'not into another company');
  const file=(db,item,folder)=>db.prepare('INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,?,?,?,?)').bind(ORG_A,'visual',item,folder,1).run();
  assert.equal((await file(a,'visual-1','folder-a1')).meta.changes,1);
  await assert.rejects(()=>file(a,'visual-1','folder-a1'),/duplicate key/,'one folder per piece of work');
  const seen=async db=>(await db.prepare('SELECT f.name AS name,i.item_id AS item FROM folders f JOIN folder_items i ON i.folder_id=f.id WHERE f.org_id=? AND f.deleted_at IS NULL').bind(ORG_A).all()).results;
  assert.deepEqual((await seen(a)).map(r=>r.item),['visual-1']);
  assert.deepEqual(await seen(prod.forUser(USER_B)),[],'another company sees none of it');
  assert.deepEqual(await seen(prev.forUser(USER_A)),[],'Preview sees none of Production’s folders');
  assert.equal((await prev.forUser(USER_A).prepare('UPDATE folders SET name=? WHERE id=?').bind('Taken','folder-a1').run()).meta.changes,0,'nor renames them');
  // Delete keeps the memberships, so Undo puts the work back.
  assert.equal((await a.prepare('UPDATE folders SET deleted_at=? WHERE org_id=? AND deleted_at IS NULL AND (id=? OR parent_id=?)').bind(5,ORG_A,'folder-a1','folder-a1').run()).meta.changes,1);
  assert.deepEqual(await seen(a),[]);
  assert.equal((await a.prepare('UPDATE folders SET deleted_at=NULL WHERE org_id=? AND deleted_at=? AND (id=? OR parent_id=?)').bind(ORG_A,5,'folder-a1','folder-a1').run()).meta.changes,1);
  assert.deepEqual((await seen(a)).map(r=>r.item),['visual-1']);
  await assert.rejects(()=>a.prepare("INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,'thing',?,?,1)").bind(ORG_A,'x-1','folder-a1').run(),/folder_items_kind_ck/,'only the four kinds of work');
 }finally{await sql.end({timeout:5})}
});

// The library index (0007) as lib/library-index.ts writes it: the same upsert
// for the same row, a company's own rows only, its environment only.
test('library index: one row per piece of work, upserted; another company or environment sees nothing',{skip},async()=>{
 await setup();
 await admin.unsafe('delete from studio.library_items');
 const sql=connect(appUrl);
 const prod=new StudioDatabase(sql,null,'production'),prev=new StudioDatabase(sql,null,'preview');
 const UPSERT=`INSERT INTO library_items(org_id,kind,id,owner,title,tool,car,status,thumb_key,asset_id,width,height,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(environment,kind,id) DO UPDATE SET title=excluded.title,status=excluded.status,thumb_key=COALESCE(excluded.thumb_key,library_items.thumb_key),updated_at=excluded.updated_at`;
 try{
  const a=prod.forUser(USER_A),owner=ownerOf(ORG_A,USER_A);
  await a.prepare(UPSERT).bind(ORG_A,'visual','lib-1',owner,'First','Key visual','Demo SUV','working','thumbs/lib-1.webp','lib-1',null,null,1,1,null).run();
  await a.prepare(UPSERT).bind(ORG_A,'visual','lib-1',owner,'Second','Key visual','Demo SUV','ready',null,'lib-1',null,null,1,2,null).run();
  const row=await a.prepare('SELECT title,status,thumb_key,created_at FROM library_items WHERE id=?').bind('lib-1').first();
  assert.deepEqual({...row},{title:'Second',status:'ready',thumb_key:'thumbs/lib-1.webp',created_at:1},'updated in place; the thumbnail kept');
  await assert.rejects(()=>a.prepare(UPSERT).bind(ORG_B,'visual','lib-b',owner,'Not mine','Key visual',null,'ready',null,null,null,null,1,1,null).run(),/row-level security/,'not into another company');
  await assert.rejects(()=>a.prepare(UPSERT).bind(ORG_A,'thing','lib-2',owner,'X','Key visual',null,'ready',null,null,null,null,1,1,null).run(),/library_items_kind_ck/,'only the four kinds of work');
  const page=db=>db.prepare("SELECT id FROM library_items li WHERE li.org_id=? AND li.deleted_at IS NULL AND LOWER(li.title) LIKE ? ESCAPE '\\' ORDER BY li.created_at DESC, li.id DESC LIMIT ? OFFSET ?").bind(ORG_A,'%sec%',40,0).all();
  assert.deepEqual((await page(a)).results.map(r=>r.id),['lib-1'],'the library query runs as written');
  assert.deepEqual((await page(prod.forUser(USER_B))).results,[],'another company sees none of it');
  assert.deepEqual((await page(prev.forUser(USER_A))).results,[],'Preview sees none of Production’s index');
 }finally{await sql.end({timeout:5})}
});

// ── Design finish pass: team changes (setup SQL section 7) and credit-email recipients (0008) ──
// The functions as the Studio calls them, as studio_app with the signed-in
// person's id: only an active owner of that client company changes its team,
// one active owner always stays, the plan's seats hold, every change is logged.
test('team functions: owners only, one owner stays, seats, logged; studio_app reaches nothing else',{skip},async()=>{
 await setup();
 const org=`0000d${String(Date.now()).slice(-3)}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12,'0')}`;
 await admin.unsafe(`insert into accounts.organisations(id,name,kind) values ('${org}','Team Co','client');
  insert into accounts.members(org_id,user_id,role,status) values ('${org}','${USER_C}','owner','active'),('${org}','${USER_D}','creator','active');`);
 const app=postgres(appUrl,{max:1,prepare:false,ssl:ssl(appUrl),onnotice:()=>{}});
 const invite=(actor,email,role='creator',o=org)=>app`select accounts.studio_team_invite(${o}::uuid, ${actor}::uuid, ${email}, ${role}) as r`.then(r=>r[0].r);
 const setRole=(actor,user,role,o=org)=>app`select accounts.studio_team_set_role(${o}::uuid, ${actor}::uuid, ${user}::uuid, ${role}) as r`.then(r=>r[0].r);
 const remove=(actor,user,o=org)=>app`select accounts.studio_team_remove(${o}::uuid, ${actor}::uuid, ${user}::uuid) as r`.then(r=>r[0].r);
 const member=async user=>(await admin`select role,status from accounts.members where org_id=${org}::uuid and user_id=${user}::uuid`)[0];
 try{
  // Not an owner: a creator, staff, an owner of another company. Nothing changes.
  await assert.rejects(()=>invite(USER_D,'a@example.test'),e=>e.code==='42501','a creator cannot invite');
  await assert.rejects(()=>invite(STAFF,'a@example.test'),e=>e.code==='42501','staff cannot invite');
  await assert.rejects(()=>invite(USER_B,'a@example.test'),e=>e.code==='42501','another company’s owner cannot invite');
  await assert.rejects(()=>setRole(USER_D,USER_C,'viewer'),e=>e.code==='42501');
  await assert.rejects(()=>remove(USER_D,USER_C),e=>e.code==='42501');
  await assert.rejects(()=>invite(USER_C,'a@example.test','creator',ORG_B),e=>e.code==='42501','USER_C owns Team Co, not B');
  await assert.rejects(()=>invite(STAFF,'a@example.test','creator',ORG_N),e=>e.code==='22023','Nmesis’s own workspace is the admin’s');
  await assert.rejects(()=>invite(USER_C,'not an email'),e=>e.code==='22023');
  await assert.rejects(()=>invite(USER_C,'a@example.test','admin'),e=>e.code==='22023');
  // No sign-in yet: nothing written; the Studio sends Supabase's invitation and asks again.
  assert.deepEqual(await invite(USER_C,'Nobody.Yet@example.test'),{result:'no_account'});
  // An existing sign-in joins as invited; a second time says so.
  const added=await invite(USER_C,'A@Example.test','viewer');assert.equal(added.result,'invited');assert.equal(added.user_id,USER_A);
  assert.deepEqual({...await member(USER_A)},{role:'viewer',status:'invited'});
  // Who invited them and when are recorded on the member row; joined_at waits for their first sign-in.
  const [row]=await admin`select invited_by::text as by, invited_at is not null as at, joined_at from accounts.members where org_id=${org}::uuid and user_id=${USER_A}::uuid`;
  assert.deepEqual({...row},{by:USER_C,at:true,joined_at:null});
  assert.equal((await invite(USER_C,'a@example.test')).result,'already_member');
  // Roles: changed, unchanged; the only active owner stays an owner.
  assert.equal((await setRole(USER_C,USER_D,'viewer')).result,'changed');assert.equal((await member(USER_D)).role,'viewer');
  assert.equal((await setRole(USER_C,USER_D,'viewer')).result,'unchanged');
  assert.equal((await setRole(USER_C,USER_C,'creator')).result,'last_owner');assert.equal((await member(USER_C)).role,'owner');
  assert.equal((await setRole(USER_C,USER_B,'viewer')).result,'not_member','a person of another company');
  assert.equal(await member(USER_B),undefined);
  // Seats: the plan's studio.seats (here an override) counts invited and active people.
  await admin.unsafe(`insert into accounts.overrides(org_id,feature_key,value) values ('${org}','studio.seats','3'::jsonb) on conflict (org_id,feature_key) do update set value=excluded.value`);
  assert.equal((await invite(USER_C,'b@example.test')).result,'no_seats');
  assert.equal((await invite(USER_C,'nobody.yet@example.test')).result,'no_seats','no free seat: no invitation email either');
  // Remove: status 'removed'; again: not a member; never the last owner.
  assert.equal((await remove(USER_C,USER_D)).result,'removed');assert.equal((await member(USER_D)).status,'removed');
  assert.equal((await remove(USER_C,USER_D)).result,'not_member');
  assert.equal((await remove(USER_C,USER_C)).result,'last_owner');
  // A removed person can be invited back (a seat is free again).
  assert.equal((await invite(USER_C,'d@example.test','creator')).result,'invited');assert.deepEqual({...await member(USER_D)},{role:'creator',status:'invited'});
  // Every change, newest first, with who made it.
  const log=await app`select action,email,role_before,role_after,actor_email from accounts.studio_team_changes where org_id=${org}::uuid order by at desc,id desc`;
  assert.deepEqual(log.map(l=>[l.action,l.email,l.role_before,l.role_after]),[['invite','d@example.test',null,'creator'],['remove','d@example.test','viewer',null],['role','d@example.test','creator','viewer'],['invite','a@example.test',null,'viewer']]);
  assert.ok(log.every(l=>l.actor_email==='c@example.test'));
  // studio_app reads the log only through the view, and cannot write it or the members.
  await assert.rejects(()=>app`select * from accounts.studio_team_log`,/permission denied/);
  await assert.rejects(()=>app`insert into accounts.studio_team_log(org_id,actor,action,user_id) values (${org}::uuid,${USER_C}::uuid,'invite',${USER_C}::uuid)`,/permission denied/);
  await assert.rejects(()=>app`select accounts.studio_team_check(${org}::uuid, ${USER_C}::uuid)`,/permission denied/);
  await assert.rejects(()=>app`update accounts.members set role='owner' where user_id=${USER_D}::uuid`,/permission denied/);
  for(const api of ['anon','authenticated'])await assert.rejects(()=>admin.begin(async tx=>{await tx.unsafe('set local role '+api);await tx.unsafe(`select accounts.studio_team_invite('${org}','${USER_C}','x@example.test','creator')`)}),/permission denied/);
 }finally{await app.end({timeout:5})}
});

test('credit-email recipients (0008): owners choose; creators and staff cannot; members read; other companies see nothing',{skip},async()=>{
 await setup();
 await admin.unsafe('delete from studio.alert_recipients');
 const sql=connect(appUrl),base=new StudioDatabase(sql);
 const owner=base.forUser(USER_C),creator=base.forUser(USER_D),staff=base.forUser(STAFF),other=base.forUser(USER_A);
 const choose=(db,user)=>db.prepare('INSERT INTO alert_recipients(org_id,user_id,chosen_by,chosen_at) VALUES(?,?,?,CAST(? AS BIGINT))').bind(ORG_C,user,USER_C,Date.now()).run();
 try{
  await assert.rejects(()=>choose(creator,USER_D),/row-level security/,'a creator cannot choose');
  await assert.rejects(()=>choose(staff,USER_D),/row-level security/,'staff cannot choose');
  await assert.rejects(()=>choose(other,USER_D),/row-level security/,'another company cannot choose');
  assert.equal((await choose(owner,USER_D)).meta.changes,1,'the owner chooses');
  assert.equal((await creator.prepare('SELECT user_id FROM alert_recipients WHERE org_id=?').bind(ORG_C).all()).results.length,1,'members read it');
  assert.equal((await staff.prepare('SELECT user_id FROM alert_recipients').all()).results.length,1,'staff read it');
  assert.equal((await other.prepare('SELECT user_id FROM alert_recipients').all()).results.length,0,'another company sees nothing');
  assert.equal((await creator.prepare('DELETE FROM alert_recipients WHERE org_id=?').bind(ORG_C).run()).meta.changes,0,'a creator cannot remove it');
  const {saveRecipients,chosenRecipients}=await import('../lib/credits/recipients.ts');
  await saveRecipients(owner,ORG_C,USER_C,[USER_C,USER_D]);
  assert.deepEqual((await chosenRecipients(creator,ORG_C)).sort(),[USER_C,USER_D].sort(),'the owner’s choice, replaced in one go');
 }finally{await sql.end({timeout:5})}
});

test('public links (0011): the page reads only a live link’s neutral copy; the sweep sees dead links’ copies only, of every company, and clears each once',{skip},async()=>{
 await setup();
 const hash=c=>c.repeat(64),key=c=>'public/'+c.repeat(32),now=Date.now(),DAY=86_400_000;
 const link=(id,org,h,k,{revoked=null,expires=now+DAY}={})=>insertIn(ENV,['insert into studio.share_links(id,org_id,item_kind,item_id,token_hash,expires_at,revoked_at,created_by,created_at,public_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,org,'visual','pl-visual-'+id,h,expires,revoked,'orgs/'+org+'/users/'+USER_A+'/',now,k]]);
 const item=(id,org)=>insertIn(ENV,['insert into studio.library_items(org_id,kind,id,owner,title,tool,car,status,thumb_key,asset_id,width,height,created_at,updated_at,deleted_at) values($1,$2,$3,$4,$5,$6,null,$7,null,$8,null,null,1,1,null)',[org,'visual','pl-visual-'+id,'orgs/'+org+'/users/'+USER_A+'/','Demo SUV','Key visual','ready','pl-asset-'+id]]);
 await admin.unsafe('delete from studio.share_links');
 for(const [id,org] of [['live',ORG_A],['off',ORG_A],['old',ORG_B],['other',ORG_B]])await item(id,org);
 await link('live',ORG_A,hash('1'),key('1'));
 await link('off',ORG_A,hash('2'),key('2'),{revoked:now-1});
 await link('old',ORG_B,hash('3'),key('3'),{expires:now-1});
 await link('other',ORG_B,hash('4'),key('4'));
 // A copy's key names nothing: anything else is refused by the table itself.
 await assert.rejects(()=>link('bad',ORG_A,hash('5'),'orgs/'+ORG_A+'/users/'+USER_A+'/images/x'),/share_links_public_key_ck/);
 const sql=connect(appUrl),db=new StudioDatabase(sql);
 try{
  // No signed-in person and no sweep: row level security shows nothing.
  assert.equal((await sql`select count(*)::int as n from studio.share_links`)[0].n,0);
  // The page: a live link answers its title and neutral key; a dead one, nothing.
  const [live]=await sql`select * from studio.public_share(${hash('1')}, ${ENV})`;
  assert.deepEqual({title:live.title,public_key:live.public_key},{title:'Demo SUV',public_key:key('1')});
  assert.ok(!('owner' in live)&&!('asset_id' in live),'no storage path of a person or company comes back');
  for(const h of ['2','3'])assert.equal((await sql`select * from studio.public_share(${hash(h)}, ${ENV})`).length,0);
  // The sweep (through the Studio's own adapter, as lib/shares.ts calls it): dead links of both companies, oldest first; never a live one.
  const {PUBLIC_COPIES_DUE_SQL,PUBLIC_COPIES_CLEARED_SQL}=await import('../lib/shares.ts');
  const due=(await db.prepare(PUBLIC_COPIES_DUE_SQL).bind(ENV,10).all()).results;
  assert.deepEqual(due.map(r=>r.public_key).sort(),[key('2'),key('3')]);
  assert.equal((await db.prepare(PUBLIC_COPIES_DUE_SQL).bind('production',10).all()).results.length,0,'another environment’s links are not this one’s');
  // Clearing takes a list of ids (an array parameter) and marks only dead links, once.
  assert.equal(Number((await db.prepare(PUBLIC_COPIES_CLEARED_SQL).bind(ENV,['live','off','old']).first()).n),2,'the live link is never marked');
  assert.equal(Number((await db.prepare(PUBLIC_COPIES_CLEARED_SQL).bind(ENV,['off','old']).first()).n),0,'nothing twice');
  assert.equal((await db.prepare(PUBLIC_COPIES_DUE_SQL).bind(ENV,10).all()).results.length,0);
  // The settings the functions use are put back: the next statement sees nothing again.
  assert.equal((await sql`select count(*)::int as n from studio.share_links`)[0].n,0);
  // Even the sweep's own switch, set by hand, opens dead links only: never a live one.
  const seen=await sql.begin(async tx=>{await tx`select set_config('studio.public_sweep','on',true), set_config('studio.env',${ENV},true)`;return tx`select id from studio.share_links order by id`});
  assert.deepEqual(seen.map(r=>r.id),['off','old']);
  // A member of company A sees A's links only (the routes' own view).
  const member=await new StudioDatabase(sql).forUser(USER_A).prepare('SELECT id FROM share_links ORDER BY id').all();
  assert.deepEqual(member.results.map(r=>r.id),['live','off']);
 }finally{await sql.end({timeout:5})}
});

// The company's own font files (0013): everyone in the company reads them; only
// its owners add or remove one, and nothing ever deletes a row (the licence
// record stays). Another company, or the other environment, sees nothing.
test('brand fonts (0013): members read; only owners add or remove; creators, staff and other companies cannot; rows are never deleted',{skip},async()=>{
 await setup();
 await admin.unsafe('delete from studio.brand_fonts');
 const sql=connect(appUrl),base=new StudioDatabase(sql);
 const owner=base.forUser(USER_C),creator=base.forUser(USER_D),staff=base.forUser(STAFF),other=base.forUser(USER_A),nobody=base;
 const previewOwner=new StudioDatabase(sql,null,'preview').forUser(USER_C);
 const now=Date.now(),LICENCE='I confirm my company holds a licence that allows this font to be used in our designs and exports.';
 const font=(id,o={})=>{
  const f={org:ORG_C,family:'Demo Sans',style:'Regular',weight:400,italic:0,variable:0,axes:'[]',min:null,max:null,format:'otf',size:2048,sha:'a'.repeat(64),fsType:0,embedding:'installable',status:'ready',reason:null,...o};
  const dir=o.dir??`orgs/${f.org}/brand/fonts/${id}/`;
  return [id,f.org,f.family,f.style,f.weight,f.italic,f.variable,f.axes,f.min,f.max,f.format,f.size,f.sha,dir+'original.'+f.format,f.status==='ready'?dir+'font.woff2':null,f.status==='ready'?dir+'preview.woff2':null,USER_C,now,'2026-11-22',LICENCE,f.fsType,f.embedding,f.status,f.reason,USER_C,now];
 };
 const add=(db,values)=>db.prepare(`INSERT INTO brand_fonts(id,org_id,family,style,weight,italic,variable,axes,weight_min,weight_max,format,size,sha256,original_key,woff2_key,preview_key,licence_by,licence_at,licence_version,licence_text,fs_type,embedding,status,reason,created_by,created_at)
  VALUES(?,?,?,?,CAST(? AS INTEGER),CAST(? AS INTEGER),CAST(? AS INTEGER),?,CAST(? AS INTEGER),CAST(? AS INTEGER),?,CAST(? AS BIGINT),?,?,?,?,?,CAST(? AS BIGINT),?,?,CAST(? AS INTEGER),?,?,?,?,CAST(? AS BIGINT))`).bind(...values).run();
 const ids=async db=>(await db.prepare('SELECT id FROM brand_fonts ORDER BY id').all()).results.map(r=>r.id);
 try{
  // Only an owner of the company adds a font.
  await assert.rejects(()=>add(creator,font('f-creator')),/row-level security/,'a creator cannot upload');
  await assert.rejects(()=>add(staff,font('f-staff')),/row-level security/,'staff cannot upload into a client company');
  await assert.rejects(()=>add(other,font('f-other')),/row-level security/,'an owner of another company cannot upload into this one');
  await assert.rejects(()=>add(nobody,font('f-nobody')),/row-level security|null value in column "environment"/,'no signed-in person writes nothing');
  assert.equal((await add(owner,font('f-regular'))).meta.changes,1,'the owner uploads');
  assert.equal((await add(owner,font('f-bold',{style:'Bold',weight:700,sha:'b'.repeat(64)}))).meta.changes,1);
  assert.equal((await add(owner,font('f-italic',{style:'Italic',italic:1,sha:'c'.repeat(64)}))).meta.changes,1);
  assert.equal((await add(owner,font('f-refused',{status:'refused',embedding:'restricted',fsType:2,reason:'This font’s licence doesn’t allow it to be embedded.',sha:'d'.repeat(64)}))).meta.changes,1,'a refused font is recorded with its reason');
  // The licence confirmation is stored as given: who, when, the version and the words.
  const [rec]=await admin`select licence_by, licence_at, licence_version, licence_text, environment from studio.brand_fonts where id='f-regular'`;
  assert.deepEqual({...rec},{licence_by:USER_C,licence_at:now,licence_version:'2026-11-22',licence_text:LICENCE,environment:ENV});
  // The company's members read every font; staff read (support opens read-only); nobody else does.
  const all=['f-bold','f-italic','f-refused','f-regular'];
  assert.deepEqual(await ids(owner),all);
  assert.deepEqual(await ids(creator),all,'a creator reads the company’s fonts');
  assert.deepEqual(await ids(staff),all,'staff read them');
  assert.deepEqual(await ids(other),[],'another company sees nothing');
  assert.deepEqual(await ids(nobody),[],'no signed-in person sees nothing');
  assert.deepEqual(await ids(previewOwner),[],'the other environment sees nothing');
  // Only an owner changes one; naming it directly does nothing for anyone else.
  const remove=(db,id)=>db.prepare('UPDATE brand_fonts SET deleted_at=CAST(? AS BIGINT),deleted_by=? WHERE id=? AND deleted_at IS NULL').bind(now+1,USER_C,id).run();
  for(const [db,who] of [[creator,'a creator'],[staff,'staff'],[other,'another company'],[previewOwner,'the other environment']])
   assert.equal((await remove(db,'f-bold')).meta.changes,0,who+' cannot remove a font');
  await assert.rejects(()=>owner.prepare('UPDATE brand_fonts SET org_id=? WHERE id=?').bind(ORG_A,'f-bold').run(),/row-level security/,'a font cannot move to another company');
  // No one deletes a row, the owner included: removing is soft.
  for(const db of [owner,staff])assert.equal((await db.prepare('DELETE FROM brand_fonts WHERE id=?').bind('f-bold').run()).meta.changes,0,'rows are never deleted');
  assert.equal((await remove(owner,'f-bold')).meta.changes,1,'the owner removes it (soft)');
  const [gone]=await admin`select deleted_at, deleted_by, licence_text from studio.brand_fonts where id='f-bold'`;
  assert.deepEqual({...gone},{deleted_at:now+1,deleted_by:USER_C,licence_text:LICENCE},'the row and its licence record stay');
  // What the server checks, held by the table as well.
  const e64='e'.repeat(64);
  await assert.rejects(()=>add(owner,font('f-outside',{dir:`orgs/${ORG_A}/brand/fonts/f-outside/`,sha:e64})),/brand_fonts_keys_ck/,'a key outside the company’s font folder');
  await assert.rejects(()=>add(owner,font('f-users',{dir:`orgs/${ORG_C}/users/${USER_C}/`,sha:e64})),/brand_fonts_keys_ck/,'a key in a person’s folder');
  await assert.rejects(()=>add(owner,font('f-restricted',{embedding:'restricted',fsType:2,sha:e64})),/brand_fonts_status_ck/,'a restricted font is never ready');
  await assert.rejects(()=>add(owner,font('f-noreason',{status:'refused',sha:e64})),/brand_fonts_status_ck/,'a refusal says why');
  await assert.rejects(()=>add(owner,font('f-big',{size:10*1024*1024+1,sha:e64})),/brand_fonts_file_ck/,'over 10 MB');
  await assert.rejects(()=>add(owner,font('f-format',{format:'svg',sha:e64})),/brand_fonts_file_ck/,'a format that is not a font');
  await assert.rejects(()=>add(owner,font('f-range',{variable:1,min:700,max:300,sha:e64})),/brand_fonts_shape_ck/,'a weight range upside down');
  await assert.rejects(()=>add(owner,font('f-fixed-range',{variable:0,min:100,max:900,sha:e64})),/brand_fonts_shape_ck/,'a range on a font that is not variable');
  assert.equal((await add(owner,font('f-variable',{variable:1,axes:'[{"tag":"wght","min":100,"default":400,"max":900}]',min:100,max:900,sha:e64}))).meta.changes,1,'a variable font with its weight range');
  // The same file twice is one font, until it is removed.
  await assert.rejects(()=>add(owner,font('f-again')),/brand_fonts_env_org_file/,'the same file again');
  assert.equal((await add(owner,font('f-bold-again',{style:'Bold',weight:700,sha:'b'.repeat(64)}))).meta.changes,1,'a removed font’s file can come back');
 }finally{await sql.end({timeout:5})}
});
