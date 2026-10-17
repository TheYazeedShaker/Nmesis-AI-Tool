// Runs against a real Postgres server (CI service container, or a local one):
//   DATABASE_URL=postgres://... npm run test:pg
// Proves what PGlite (single connection) cannot: behaviour under concurrent writers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {StudioDatabase,createPostgresClient,postgresExecutor} from '../../lib/portable/database.ts';
import {RESERVE_FILM_SQL,RESERVE_SWAP_SQL,RESERVE_IMAGE_SQL} from '../../lib/film-policy.ts';
const url=process.env.DATABASE_URL;
if(!url)throw new Error('Set DATABASE_URL to a disposable Postgres database.');
const migrate=()=>execFileSync(process.execPath,['scripts/migrate.mjs'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
// 20 connections: enough real parallelism that a missing lock overspends (verified by removing it).
const sql=createPostgresClient(url,20),db=new StudioDatabase(postgresExecutor(sql));
const run=(q,...a)=>db.prepare(q).bind(...a).run();
test.after(()=>sql.end({timeout:5}));

test('migrations apply once and are idempotent on re-run',()=>{
 migrate();const second=migrate();
 assert.doesNotMatch(second,/Applied:/);assert.match(second,/Already applied: 0000_baseline\.sql/);
});

test('client roles cannot read or write studio tables (when they exist)',async()=>{
 const roles=await sql`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`;
 for(const {rolname} of roles)for(const table of ['films','film_budgets','swap_jobs','storyboards','image_jobs','topaz_jobs','__studio_migrations']){
  const [p]=await sql`SELECT has_table_privilege(${rolname},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE') AS any`;
  assert.equal(p.any,false,`${rolname} has privileges on ${table}`);
 }
 const rls=await sql`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity`;
 assert.deepEqual(rls.map(r=>r.relname),[]);
});

test('concurrent reservations never exceed the shared daily budget',async()=>{for(let attempt=0;attempt<5;attempt++){
 const payer='payer-'+crypto.randomUUID(),day='2026-10-17',now=Date.now();
 await run('INSERT INTO film_budgets(payer,daily_limit) VALUES(?,?)',payer,100);
 const jobs=[];
 for(let i=0;i<24;i++){
  const table=['films','swap_jobs','image_jobs'][i%3],id=`${table}-${i}-${payer}`;
  await run(`INSERT INTO ${table}(id,owner,payer,status,data,estimate,created_at,updated_at) VALUES(?,?,?,'quoted','{}',60,?,?)`,id,'owner',payer,now,now);
  jobs.push(table==='image_jobs'?[RESERVE_IMAGE_SQL,[day,now,id,'owner',day,day,day]]:[table==='films'?RESERVE_FILM_SQL:RESERVE_SWAP_SQL,[day,now,now+1000,id,'owner',day,day,day]]);
 }
 for(let round=0;round<3;round++){
  const results=await Promise.all(jobs.map(([q,args])=>db.prepare(q).bind(...args).run()));
  const reserved=results.reduce((n,r)=>n+r.meta.changes,0);
  assert.equal(reserved,round===0?1:0,'exactly one 60-unit job fits a 100-unit budget');
 }
 const [{spent}]=await sql`SELECT (SELECT COALESCE(SUM(estimate),0) FROM films WHERE payer=${payer} AND reserved_day=${day})+(SELECT COALESCE(SUM(estimate),0) FROM swap_jobs WHERE payer=${payer} AND reserved_day=${day})+(SELECT COALESCE(SUM(estimate),0) FROM image_jobs WHERE payer=${payer} AND reserved_day=${day}) AS spent`;
 assert.equal(spent,60);
}});

test('only one active upscale per parent image, even under concurrent inserts',async()=>{
 const parent='parent-'+crypto.randomUUID(),now=Date.now();
 const insert=id=>run("INSERT INTO topaz_jobs(id,owner,parent_id,status,data,created_at,updated_at,lock_until) SELECT ?::text,?::text,?::text,'submitting','{}',?::bigint,?::bigint,?::bigint WHERE NOT EXISTS (SELECT 1 FROM topaz_jobs WHERE owner=? AND parent_id=? AND status IN ('submitting','unknown','queued','processing','archiving')) ON CONFLICT DO NOTHING",id,'owner',parent,now,now,now,'owner',parent);
 const results=await Promise.all(Array.from({length:10},(_,i)=>insert(`job-${i}-${parent}`)));
 assert.equal(results.reduce((n,r)=>n+r.meta.changes,0),1);
 await run("UPDATE topaz_jobs SET status='ready' WHERE parent_id=?",parent);
 assert.equal((await insert('next-'+parent)).meta.changes,1,'a finished job does not block the next one');
});
