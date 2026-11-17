import type {StudioBucket} from './portable/storage';
import {fromFilm,fromStory,fromSwap,fromVisual,indexItem,indexReady,plainStatus,type IndexCtx,type IndexEntry} from './library-index';
// The library index fills itself (migration 0009): the first time a company's
// library is opened after 0007, the work it saved before 0007 is indexed, with
// thumbnails, once, in the background (after the response). Until that has
// finished, the library shows the older feed, so nothing seems missing.
// Safe to run again: every row is an upsert and a thumbnail that exists is kept.
// A run that runs out of time gives its claim back and the next open goes on.

type Ctx=IndexCtx&{BUCKET?:StudioBucket};
const CLAIM_STALE_MS=15*60_000;
export const BACKFILL_BUDGET_MS=45_000;
const done=new Set<string>();

async function ready(ctx:Ctx){
 const db=ctx.DB;if(!db||!ctx.BUCKET||!await indexReady(db))return null;
 try{await db.prepare('SELECT org_id FROM library_backfills WHERE 1=0').bind().first()}
 catch(e){if(/library_backfills/i.test(e instanceof Error?e.message:String(e))){console.info('The library backfill waits for migration 0009.');return null}throw e}
 return db;
}

/** Whether this company's library index has been filled (true before 0009: nothing to wait for). */
export async function backfilled(ctx:Ctx){
 if(done.has(ctx.org))return true;
 const db=await ready(ctx);if(!db)return true;
 const row=await db.prepare('SELECT done_at FROM library_backfills WHERE org_id=?').bind(ctx.org).first<{done_at:number|null}>();
 if(row?.done_at){done.add(ctx.org);return true}
 return false;
}

/** Fills the index for ctx.org once. Never throws: a problem is logged and the next open tries again. */
export async function backfillOnce(ctx:Ctx,now=Date.now()){
 if(done.has(ctx.org))return;
 const started=Date.now(),counts={jobs:0,records:0,films:0,swaps:0,stories:0,problems:0};
 try{
  const db=await ready(ctx),store=ctx.BUCKET;if(!db||!store)return;
  const claim=await db.prepare(`INSERT INTO library_backfills(org_id,started_at) VALUES(?,?)
   ON CONFLICT(environment,org_id) DO UPDATE SET started_at=excluded.started_at
   WHERE library_backfills.done_at IS NULL AND library_backfills.started_at<? RETURNING org_id`).bind(ctx.org,now,now-CLAIM_STALE_MS).first<{org_id:string}>();
  if(!claim)return;// done, or another request is on it
  const late=()=>Date.now()-started>BACKFILL_BUDGET_MS;
  const put=async(e:IndexEntry)=>{try{await indexItem(ctx,e)}catch(err){counts.problems++;console.warn('Library backfill: not indexed',JSON.stringify({kind:e.kind,id:e.id,reason:err instanceof Error?err.message.slice(0,120):'unknown'}))}};
  async function* keys(prefix:string){let cursor:string|undefined;do{const page=await store!.list({prefix,limit:1000,...(cursor?{cursor}:{})});for(const o of page.objects)yield o.key;cursor=page.truncated?page.cursor:undefined}while(cursor)}
  // 1. Image jobs; a saved record of the same visual, below, wins.
  for(const row of (await db.prepare("SELECT * FROM image_jobs WHERE org_id=? AND status<>'archived'").bind(ctx.org).all<{owner:string;status:string;data:string;created_at:number}>()).results){
   if(late())break;
   let v:{id?:string}&Record<string,unknown>|undefined;try{v=JSON.parse(row.data)?.visual}catch{counts.problems++;continue}
   if(!v?.id)continue;counts.jobs++;
   await put({...fromVisual(row.owner,{...v,id:v.id,status:row.status==='ready'?'ready':plainStatus(row.status)==='failed'?'failed':'pending',jobStatus:row.status}),createdAt:Number(row.created_at)||Date.now()});
  }
  // 2. Saved records in storage, with their deleted marks.
  const prefix=`orgs/${ctx.org}/`,deleted=new Set<string>(),records:{owner:string;key:string}[]=[];
  if(!late())for await(const key of keys(prefix)){
   const d=/^(orgs\/[^/]+\/users\/[^/]+\/)deleted-visuals\/([^/]+)\.json$/.exec(key);if(d){deleted.add(d[2]);continue}
   const m=/^(orgs\/[^/]+\/users\/[^/]+\/)visuals\/([^/]+)\.json$/.exec(key);if(m)records.push({owner:m[1],key});
  }
  for(const r of records){
   if(late())break;
   let visual:{id?:string}&Record<string,unknown>|undefined;try{visual=await (await store.get(r.key))?.json() as typeof visual}catch{counts.problems++;continue}
   if(!visual?.id)continue;counts.records++;
   await put({...fromVisual(r.owner,{...visual,id:visual.id}),deletedAt:deleted.has(visual.id)?now:null});
  }
  // 3. Films, swaps and stories.
  for(const [table,from,n] of [['films',fromFilm,'films'],['swap_jobs',fromSwap,'swaps'],['storyboards',fromStory,'stories']] as const){
   if(late())break;
   for(const row of (await db.prepare(`SELECT * FROM ${table} WHERE org_id=?`).bind(ctx.org).all<Parameters<typeof from>[0]>()).results){if(late())break;counts[n]++;await put(from(row as never))}
  }
  if(late()){
   await db.prepare('UPDATE library_backfills SET started_at=0 WHERE org_id=? AND done_at IS NULL').bind(ctx.org).run();
   console.info('Library backfill: paused, goes on at the next open',JSON.stringify({org:ctx.org,...counts}));return;
  }
  await db.prepare('UPDATE library_backfills SET done_at=? WHERE org_id=?').bind(Date.now(),ctx.org).run();
  done.add(ctx.org);
  console.info('Library backfill: done',JSON.stringify({org:ctx.org,ms:Date.now()-started,...counts}));
 }catch(err){console.warn('Library backfill: failed, tries again at the next open',JSON.stringify({org:ctx.org,reason:err instanceof Error?err.message.slice(0,160):'unknown',...counts}))}
}
