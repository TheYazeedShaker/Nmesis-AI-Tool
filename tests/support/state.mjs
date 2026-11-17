// Shared, mutable state for the route-level access tests (tests/accounts-access.test.mjs).
// The stand-in modules below read it; the test file sets it before each call.
import {DatabaseSync} from 'node:sqlite';
import {studioSchemaSql} from '../sqlite-schema.mjs';
import {installLedger} from './credits-ledger.mjs';
export const state={user:null,chosenOrg:null,directory:null,db:null};
// The D1-style surface of lib/portable/database.ts over an in-memory SQLite database
// built from the migrations. forUser() returns the same database: row level security
// is Postgres-only (supabase/migrations/0002), so these tests check the server's own
// filters, which is the first lock.
// The admin's credits ledger is stood in for by tests/support/credits-ledger.mjs
// (api.ledger), on a fake clock the test may move (api.ledger.clock.now).
export function sqliteDatabase({clock}={}){
 const db=new DatabaseSync(':memory:');db.exec(studioSchemaSql());const ledger=installLedger(db,{clock});
 const statement=(text,args=[])=>({
  bind:(...values)=>statement(text,values.map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v)),
  first:async column=>{const row=db.prepare(text).get(...args);return row?(column?row[column]:{...row}):null},
  all:async()=>({success:true,results:db.prepare(text).all(...args).map(r=>({...r})),meta:{changes:0,last_row_id:0}}),
  run:async()=>{const r=db.prepare(text).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:0}}},
  runIn:async()=>{const r=db.prepare(text).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:0}}},
 });
 // One connection: transactions run one after another, as the company lock makes
 // them do on Postgres (tests/postgres.test.mjs proves that part concurrently).
 let queue=Promise.resolve();
 const run=async list=>{db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.runIn());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}};
 const api={raw:db,ledger,prepare:text=>statement(text),forUser:()=>api,batch:list=>{const next=queue.then(()=>run(list));queue=next.catch(()=>{});return next}};
 return api;
}
// A directory (the accounts master list) held in memory. `grants`: the clients that
// grant Nmesis support access (org id → until, epoch ms), as studio.support_grants;
// tests change it in place.
export function memoryDirectory({orgs,members,staff={},entitlements={},cars={},allCars=[],grants={},brands={}}){
 const accepted=[];
 return {
  accepted,grants,
  supportGrants:async userId=>staff[userId]?new Map(Object.entries(grants).filter(([,until])=>until>Date.now())):new Map(),
  memberships:async userId=>members.filter(m=>m.userId===userId).map(m=>({orgId:m.orgId,orgName:orgs.find(o=>o.id===m.orgId)?.name||'?',orgKind:orgs.find(o=>o.id===m.orgId)?.kind||'client',role:m.role,status:m.status})),
  staffRole:async userId=>staff[userId]||null,
  organisation:async id=>orgs.find(o=>o.id===id)||null,
  organisations:async()=>orgs.map(o=>({...o})),
  entitlements:async id=>entitlements[id]??null,
  cars:async id=>id?cars[id]||[]:allCars,
  brands:async()=>new Map(Object.entries(brands)),
  acceptInvitations:async userId=>{let n=0;for(const m of members)if(m.userId===userId&&m.status==='invited'){m.status='active';n++}accepted.push(userId);return n},
 };
}
