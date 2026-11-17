import {creditMeter,readPriceBook,DEFAULT_PRICE_BOOK,type CreditMeter,type PriceBook} from './pricing';
import type {StudioDatabase} from '../portable/database';
// The company's credits in the database. Holds live in studio.credit_holds; the
// balance and the ledger belong to the admin (`accounts`), reached only through
// studio.credits_total / studio.credits_balance / studio.record_usage (migration
// 0003) and the read-only accounts.studio_* views (setup SQL section 6).
// The statements stay within what Postgres and SQLite both accept, so the fast
// tests run these same statements (tests/support/credits-ledger.mjs).
export type Billing='credits'|'own key'|'internal';
export type JobTable='films'|'swap_jobs'|'image_jobs'|'topaz_jobs';
const JOB_TABLES:JobTable[]=['films','swap_jobs','image_jobs','topaz_jobs'];
export type HoldInput={id:string;org:string;actor:string;tool:string;action:string;provider:string;billing:Billing;credits:number;costMicros:number;ref?:string|null;expiresAt:number;
 // A provider job reserved in the same transaction: quoted → submitting, pointing at the hold.
 job?:{table:JobTable;id:string;owner:string;lockUntil?:number}};
// Every reservation and settlement takes the company's row lock first (an upsert
// locks the row whether or not it existed); the statements after it in the same
// transaction then see every hold and ledger row committed before it.
export const LOCK_CREDITS_SQL='INSERT INTO credit_accounts(org_id,updated_at) VALUES(?,CAST(? AS BIGINT)) ON CONFLICT(org_id) DO UPDATE SET updated_at=excluded.updated_at';
const HOLD_COLUMNS="INSERT INTO credit_holds(id,org_id,actor,tool,action,provider,billing,credits,cost_micros,status,ref,created_at,updated_at,expires_at) SELECT ?,?,?,?,?,?,?,CAST(? AS BIGINT),CAST(? AS BIGINT),'held',?,CAST(? AS BIGINT),CAST(? AS BIGINT),CAST(? AS BIGINT)";
// The one statement that decides: it inserts the hold only when the company's
// credits available now (allowance left + unexpired packs) minus every live hold
// still cover it. Metered ('credits') only; own keys and Nmesis's workspace are not limited.
export const RESERVE_CREDITS_SQL=HOLD_COLUMNS+" WHERE credits_total(CAST(? AS TEXT)) - COALESCE((SELECT SUM(h.credits) FROM credit_holds h WHERE h.org_id=? AND h.status='held' AND h.expires_at>CAST(? AS BIGINT)),0) >= CAST(? AS BIGINT)";
export const RECORD_ONLY_SQL=HOLD_COLUMNS+' WHERE 1=1';
const jobQuoted=(table:JobTable)=>` AND EXISTS(SELECT 1 FROM ${table} j WHERE j.id=? AND j.owner=? AND j.status='quoted')`;
const startJob=(table:JobTable,lock:boolean)=>`UPDATE ${table} SET status='submitting',hold_id=?,updated_at=CAST(? AS BIGINT)${lock?',lock_until=CAST(? AS BIGINT)':''} WHERE id=? AND owner=? AND status='quoted' AND EXISTS(SELECT 1 FROM credit_holds h WHERE h.id=? AND h.status='held')`;
export const SETTLE_SQL='SELECT record_usage(CAST(? AS TEXT),CAST(? AS TEXT),CAST(? AS TEXT),CAST(? AS NUMERIC),CAST(? AS TEXT),CAST(? AS NUMERIC),CAST(? AS TEXT),CAST(? AS TEXT)) AS charged';
export const SETTLED_SQL="UPDATE credit_holds SET status='settled',charged=CAST(? AS BIGINT),updated_at=CAST(? AS BIGINT) WHERE id=? AND org_id=? AND status<>'settled'";
export const RELEASE_SQL="UPDATE credit_holds SET status='released',updated_at=CAST(? AS BIGINT) WHERE id=? AND org_id=? AND status='held'";
export type Balance={periodFrom:string|null;periodTo:string|null;monthly:number;used:number;monthlyLeft:number;packs:number;total:number};
export function readBalance(raw:unknown):Balance{
 let d:Record<string,unknown>={};
 try{const v=typeof raw==='string'?JSON.parse(raw):raw;if(v&&typeof v==='object'&&!Array.isArray(v))d=v as Record<string,unknown>}catch{/* unreadable: an empty balance */}
 const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?Math.max(0,x):0};
 const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):null;
 return {periodFrom:date(d.period_from),periodTo:date(d.period_to),monthly:n(d.monthly),used:n(d.used),monthlyLeft:n(d.monthly_left),packs:n(d.packs),total:n(d.total)};
}
export type UsageRow={id:string;ref:string;at:string;actor:string;tool:string;action:string;credits:number;ownKey:boolean;fromPack:boolean};
export type PackRow={id:string;credits:number;left:number;boughtOn:string|null;expiresOn:string|null};
const iso=(v:unknown)=>{const t=v instanceof Date?v.getTime():Date.parse(String(v));return Number.isFinite(t)?new Date(t).toISOString():''};
const day=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):typeof v==='string'?v.slice(0,10):null;
let bookCache:{at:number;value:Promise<PriceBook>}|null=null;
export const clearPriceBookCache=()=>{bookCache=null};
// The meter (see CreditStore.meter): balance, live holds and packs in one statement.
export const METER_BALANCE_SQL="SELECT credits_balance(CAST(? AS TEXT)) AS b, CAST(COALESCE((SELECT SUM(h.credits) FROM credit_holds h WHERE h.org_id=? AND h.status='held' AND h.billing='credits' AND h.expires_at>CAST(? AS BIGINT)),0) AS BIGINT) AS held";
export const METER_SQL=`WITH bal AS (SELECT credits_balance(CAST(? AS TEXT)) AS b),
 pf AS (SELECT b, CASE WHEN left(b,1)='{' THEN CAST(b AS jsonb)->>'period_from' END AS from_day FROM bal),
 period AS (SELECT b, CASE WHEN from_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN CAST(CAST(left(from_day,10) AS date) AS timestamp) AT TIME ZONE 'UTC' END AS since FROM pf)
SELECT period.b,
 CAST(COALESCE((SELECT SUM(h.credits) FROM credit_holds h WHERE h.org_id=? AND h.status='held' AND h.billing='credits' AND h.expires_at>CAST(? AS BIGINT)),0) AS BIGINT) AS held,
 (SELECT COALESCE(-SUM(u.credits),0) FROM accounts.studio_usage u WHERE u.org_id=CAST(? AS uuid) AND u.pack_id IS NOT NULL AND u.at>=COALESCE(period.since,CAST(? AS timestamptz))) AS packs
FROM period`;
export class CreditStore{
 private db:StudioDatabase;
 constructor(db:StudioDatabase){this.db=db}
 // Reserve a hold. False when the balance does not cover it (or the job is no
 // longer quoted): nothing was written.
 async reserve(h:HoldInput,now=Date.now()):Promise<boolean>{
  const db=this.db,base=[h.id,h.org,h.actor,h.tool,h.action.slice(0,80),h.provider,h.billing,h.credits,h.costMicros,h.ref??null,now,now,h.expiresAt];
  const metered=h.billing==='credits';
  let text=metered?RESERVE_CREDITS_SQL:RECORD_ONLY_SQL;const args:unknown[]=metered?[...base,h.org,h.org,now,h.credits]:[...base];
  if(h.job){if(!JOB_TABLES.includes(h.job.table))throw new Error('Unknown job table.');text+=jobQuoted(h.job.table);args.push(h.job.id,h.job.owner)}
  const statements=[db.prepare(LOCK_CREDITS_SQL).bind(h.org,now),db.prepare(text).bind(...args)];
  if(h.job){const lock=h.job.lockUntil!==undefined;statements.push(db.prepare(startJob(h.job.table,lock)).bind(h.id,now,...(lock?[h.job.lockUntil]:[]),h.job.id,h.job.owner,h.id))}
  const results=await db.batch(statements);
  return results.slice(1).every(r=>r.meta.changes===1);
 }
 // Settle a hold into the ledger (accounts.record_usage) and mark it settled, in
 // one transaction. Returns the credits charged. Idempotent per hold.
 async settle(s:{holdId:string;org:string;actor:string;tool:string;credits:number;provider:string;costUsd:number|null;action:string},now=Date.now()):Promise<number>{
  const db=this.db;
  const [,charged]=await db.batch([db.prepare(LOCK_CREDITS_SQL).bind(s.org,now),db.prepare(SETTLE_SQL).bind(s.org,s.actor,s.tool,s.credits,s.provider,s.costUsd,s.holdId,JSON.stringify({action:s.action.slice(0,80)})),db.prepare(SETTLED_SQL).bind(s.credits,now,s.holdId,s.org)]);
  const value=Number((charged.results[0] as {charged?:unknown}|undefined)?.charged);
  return Number.isFinite(value)?value:s.credits;
 }
 async release(holdId:string,org:string,now=Date.now()){await this.db.prepare(RELEASE_SQL).bind(now,holdId,org).run()}
 async hold(holdId:string){return this.db.prepare('SELECT id,org_id,status,credits,charged,billing FROM credit_holds WHERE id=?').bind(holdId).first<{id:string;org_id:string;status:string;credits:number;charged:number|null;billing:Billing}>()}
 async balance(org:string):Promise<Balance>{return readBalance(await this.db.prepare('SELECT credits_balance(CAST(? AS TEXT)) AS b').bind(org).first('b'))}
 async held(org:string,now=Date.now()):Promise<number>{return Number(await this.db.prepare("SELECT CAST(COALESCE(SUM(credits),0) AS BIGINT) AS n FROM credit_holds WHERE org_id=? AND status='held' AND billing='credits' AND expires_at>CAST(? AS BIGINT)").bind(org,now).first('n'))||0}
 // Credits spent this period: the allowance used (the admin's own count) plus
 // whatever came out of packs since the period started.
 async meter(org:string,now=Date.now()):Promise<CreditMeter>{
  // One statement, every value a parameter: the balance, the live holds and what
  // packs paid since the period started (whose start the balance gives), so a
  // settlement between reads can never make the meter (or a refusal) show
  // credits that are not there, and the meter costs one statement.
  const since=new Date(now-31*86_400_000).toISOString();
  let row:{b:unknown;held:unknown;packs:unknown}|null;
  try{row=await this.db.prepare(METER_SQL).bind(org,org,now,org,since).first<{b:unknown;held:unknown;packs:unknown}>()}
  catch(e){
   // The packs' view is missing (setup SQL not re-run): the balance and holds alone, as before.
   console.warn('credits: the combined meter failed; reading the balance alone',e instanceof Error?e.name:'UnknownError');
   const r=await this.db.prepare(METER_BALANCE_SQL).bind(org,org,now).first<{b:unknown;held:unknown}>();
   row=r?{...r,packs:0}:null;
  }
  const b=readBalance(row?.b),held=Number(row?.held)||0,fromPacks=Number(row?.packs)||0;
  return creditMeter({spent:b.used+Math.max(0,fromPacks),total:b.total,held,periodFrom:b.periodFrom,periodTo:b.periodTo});
 }
 // The price book (credit_basis, studio_cost.*), cached 60 s per instance. If the
 // view is not installed yet, the Studio's own table and 0.04 apply (logged).
 priceBook():Promise<PriceBook>{
  if(bookCache&&Date.now()-bookCache.at<60_000)return bookCache.value;
  const value=this.db.prepare('SELECT key,value FROM accounts.studio_price_book').all<{key:unknown;value:unknown}>().then(r=>readPriceBook(r.results)).catch(e=>{console.error('Credit price book unavailable; using the Studio defaults',e instanceof Error?e.name:'UnknownError');return DEFAULT_PRICE_BOOK});
  bookCache={at:Date.now(),value};return value;
 }
 async recent(org:string,limit=50):Promise<UsageRow[]>{
  const rows=await this.db.prepare('SELECT id,at,actor,feature_key,action,credits,own_key,pack_id,ref FROM accounts.studio_usage WHERE org_id=? ORDER BY at DESC,id DESC LIMIT '+Math.max(1,Math.min(200,Math.floor(limit)))).bind(org).all<Record<string,unknown>>();
  return rows.results.map(usageRow);
 }
 async since(org:string,fromIso:string):Promise<UsageRow[]>{
  const rows=await this.db.prepare('SELECT id,at,actor,feature_key,action,credits,own_key,pack_id,ref FROM accounts.studio_usage WHERE org_id=? AND at>=? ORDER BY at DESC,id DESC LIMIT 5000').bind(org,fromIso).all<Record<string,unknown>>();
  return rows.results.map(usageRow);
 }
 async packs(org:string):Promise<PackRow[]>{
  const rows=await this.db.prepare('SELECT id,credits,left_credits,bought_on,expires_on FROM accounts.studio_credit_packs WHERE org_id=? ORDER BY expires_on DESC,id DESC LIMIT 50').bind(org).all<Record<string,unknown>>();
  return rows.results.map(r=>({id:String(r.id),credits:Number(r.credits)||0,left:Number(r.left_credits)||0,boughtOn:day(r.bought_on),expiresOn:day(r.expires_on)}));
 }
 async people(org:string):Promise<{userId:string;role:string;email:string}[]>{
  const rows=await this.db.prepare('SELECT user_id,role,email FROM accounts.studio_people WHERE org_id=? ORDER BY email').bind(org).all<Record<string,unknown>>();
  return rows.results.map(r=>({userId:String(r.user_id),role:String(r.role),email:String(r.email||'')}));
 }
 async ownerEmails(org:string){return (await this.people(org)).filter(p=>p.role==='owner'&&/^[^\s@]+@[^\s@]+$/.test(p.email)).map(p=>p.email)}
 // Records that this period's warning at `level` is being sent; false when it
 // already was (each warning goes out once per company per period).
 async markAlert(org:string,period:string,level:80|100,now=Date.now()):Promise<boolean>{
  const db=this.db;
  const [,r]=await db.batch([db.prepare(LOCK_CREDITS_SQL).bind(org,now),db.prepare('UPDATE credit_accounts SET alert_period=?,alert_level=? WHERE org_id=? AND (alert_period IS NULL OR alert_period<>? OR alert_level<?)').bind(period,level,org,period,level)]);
  return r.meta.changes===1;
 }
}
function usageRow(r:Record<string,unknown>):UsageRow{
 const own=r.own_key===true||r.own_key===1||r.own_key==='t';
 return {id:String(r.id),ref:String(r.ref||r.id),at:iso(r.at),actor:String(r.actor||''),tool:String(r.feature_key||''),action:String(r.action||''),credits:Math.max(0,-(Number(r.credits)||0)),ownKey:own,fromPack:r.pack_id!==null&&r.pack_id!==undefined};
}
const stores=new WeakMap<object,CreditStore>();
export function creditStore(db:StudioDatabase):CreditStore{let s=stores.get(db);if(!s){s=new CreditStore(db);stores.set(db,s)}return s}
