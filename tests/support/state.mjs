// Shared, mutable state for the route-level access tests (tests/accounts-access.test.mjs).
// The stand-in modules below read it; the test file sets it before each call.
import {DatabaseSync} from 'node:sqlite';
import {studioSchemaSql} from '../sqlite-schema.mjs';
export const state={user:null,chosenOrg:null,directory:null,db:null};
// The D1-style surface of lib/portable/database.ts over an in-memory SQLite database
// built from the migrations. forUser() returns the same database: row level security
// is Postgres-only (supabase/migrations/0002), so these tests check the server's own
// filters, which is the first lock.
export function sqliteDatabase(){
 const db=new DatabaseSync(':memory:');db.exec(studioSchemaSql());
 const statement=(text,args=[])=>({
  bind:(...values)=>statement(text,values.map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v)),
  first:async column=>{const row=db.prepare(text).get(...args);return row?(column?row[column]:{...row}):null},
  all:async()=>({success:true,results:db.prepare(text).all(...args).map(r=>({...r})),meta:{changes:0,last_row_id:0}}),
  run:async()=>{const r=db.prepare(text).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:0}}},
  runIn:async()=>{const r=db.prepare(text).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:0}}},
 });
 const api={raw:db,prepare:text=>statement(text),forUser:()=>api,batch:async list=>{db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.runIn());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 return api;
}
// A directory (the accounts master list) held in memory.
export function memoryDirectory({orgs,members,staff={},entitlements={},cars={},allCars=[]}){
 const accepted=[];
 return {
  accepted,
  memberships:async userId=>members.filter(m=>m.userId===userId).map(m=>({orgId:m.orgId,orgName:orgs.find(o=>o.id===m.orgId)?.name||'?',orgKind:orgs.find(o=>o.id===m.orgId)?.kind||'client',role:m.role,status:m.status})),
  staffRole:async userId=>staff[userId]||null,
  organisation:async id=>orgs.find(o=>o.id===id)||null,
  organisations:async()=>orgs.map(o=>({...o})),
  entitlements:async id=>entitlements[id]??null,
  cars:async id=>id?cars[id]||[]:allCars,
  acceptInvitations:async userId=>{let n=0;for(const m of members)if(m.userId===userId&&m.status==='invited'){m.status='active';n++}accepted.push(userId);return n},
 };
}
