import type {StudioBucket} from './portable/storage';
import type {StudioDatabase} from './portable/database';
// The library's index (migration 0007): one row per piece of work, kept in
// step by the server wherever work is saved, changed, deleted or restored, so
// the library lists, filters and pages from the database alone. Each row knows
// its small thumbnail (made once, when the work is saved) and its full picture
// (opened only in the viewer). Indexing never fails the action that saved the
// work: a problem is logged and scripts/backfill-library.mjs mends it.

export type IndexKind='visual'|'film'|'swap'|'story';
export type IndexTool='Key visual'|'Line-up'|'Film'|'Car swap'|'Story';
export type IndexStatus='ready'|'working'|'failed';
export type IndexEntry={kind:IndexKind;id:string;owner:string;title:string;tool:IndexTool;car:string|null;status:IndexStatus;
 /** The full picture (an asset id under some member's images/). */assetId:string|null;width?:number|null;height?:number|null;createdAt:number;
 /** undefined: keep what the row says; null: not deleted; a time: deleted then. */deletedAt?:number|null};
type Db=Pick<StudioDatabase,'prepare'>|{prepare(sql:string):{bind(...v:unknown[]):{first<T=unknown>():Promise<T|null>;run():Promise<{meta:{changes:number}}>;all<T=unknown>():Promise<{results:T[]}>}}};
export type IndexCtx={DB?:Db;BUCKET?:StudioBucket;org:string};

const WORKING=new Set(['pending','queued','in_progress','submitting','unknown','archiving','draft','quoted','processing']);
const FAILED=new Set(['failed','canceled','cancelled','nsfw','interrupted']);
export const plainStatus=(s:string|undefined|null):IndexStatus=>!s||s==='ready'||s==='completed'||s==='done'?'ready':FAILED.has(s)?'failed':WORKING.has(s)?'working':'ready';
export const THUMB_WIDTH=480;
export const thumbKey=(owner:string,assetId:string)=>owner+'thumbs/'+assetId+'.webp';

// Whether 0007 has run (the same pattern as 0005 and 0006): before it, the
// library uses the group 1 feed and nothing is indexed.
let known:{at:number;ready:boolean}|undefined;
export async function indexReady(db:Db,now=Date.now()){
 if(known&&(known.ready||now-known.at<60_000))return known.ready;
 let ready=true;
 try{await db.prepare('SELECT id FROM library_items WHERE 1=0').bind().first()}
 catch(e){if(!/library_items/i.test(e instanceof Error?e.message:String(e)))throw e;ready=false;console.info('The library index waits for migration 0007.')}
 known={at:now,ready};return ready;
}

/** The small WebP of a picture, made once: one read of the picture, one write. */
export async function makeThumb(store:StudioBucket,owner:string,assetId:string):Promise<string|null>{
 const key=thumbKey(owner,assetId);
 if(await store.head(key))return key;
 const source=await store.get(owner+'images/'+assetId);
 if(!source)return null;
 const sharp=(await import('sharp')).default;
 const out=await sharp(new Uint8Array(await source.arrayBuffer()),{failOn:'none'}).rotate().resize({width:THUMB_WIDTH,height:THUMB_WIDTH,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer();
 await store.put(key,out,{httpMetadata:{contentType:'image/webp'}});
 return key;
}

const UPSERT=(keepDeleted:boolean)=>`INSERT INTO library_items(org_id,kind,id,owner,title,tool,car,status,thumb_key,asset_id,width,height,created_at,updated_at,deleted_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(environment,kind,id) DO UPDATE SET owner=excluded.owner,title=excluded.title,tool=excluded.tool,car=excluded.car,status=excluded.status,
 thumb_key=COALESCE(excluded.thumb_key,library_items.thumb_key),asset_id=excluded.asset_id,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at${keepDeleted?'':',deleted_at=excluded.deleted_at'}`;

/** Writes (or updates) one row, and makes the thumbnail when the work is ready and has none. */
export async function indexItem(ctx:IndexCtx,e:IndexEntry,now=Date.now(),{thumbOwner}:{thumbOwner?:string}={}){
 const db=ctx.DB;if(!db||!await indexReady(db))return false;
 let thumb:string|null=null;
 if(e.assetId&&e.status==='ready'&&ctx.BUCKET){try{thumb=await makeThumb(ctx.BUCKET,thumbOwner||e.owner,e.assetId)}catch(err){console.warn('Library: no thumbnail',JSON.stringify({kind:e.kind,id:e.id,reason:err instanceof Error?err.message.slice(0,120):'unknown'}))}}
 await db.prepare(UPSERT(e.deletedAt===undefined)).bind(ctx.org,e.kind,e.id,e.owner,e.title.slice(0,200),e.tool,e.car?e.car.slice(0,120):null,e.status,thumb,e.assetId,e.width??null,e.height??null,e.createdAt,now,e.deletedAt??null).run();
 return true;
}
/** As indexItem, never throwing: for the paths that save work. */
export async function indexQuietly(ctx:IndexCtx,e:IndexEntry|null,opts?:{thumbOwner?:string}){
 if(!e)return;
 try{await indexItem(ctx,e,Date.now(),opts)}catch(err){console.warn('Library: index not updated',JSON.stringify({kind:e.kind,id:e.id,reason:err instanceof Error?err.message.slice(0,160):'unknown'}))}
}
export async function markDeleted(ctx:IndexCtx,kind:IndexKind,id:string,deletedAt:number|null){
 const db=ctx.DB;if(!db||!await indexReady(db))return;
 try{await db.prepare('UPDATE library_items SET deleted_at=?,updated_at=? WHERE org_id=? AND kind=? AND id=?').bind(deletedAt,Date.now(),ctx.org,kind,id).run()}
 catch(err){console.warn('Library: deleted mark not written',JSON.stringify({kind,id,reason:err instanceof Error?err.message.slice(0,160):'unknown'}))}
}
export async function removeFromIndex(ctx:IndexCtx,kind:IndexKind,id:string){
 const db=ctx.DB;if(!db||!await indexReady(db))return;
 try{await db.prepare('DELETE FROM library_items WHERE org_id=? AND kind=? AND id=?').bind(ctx.org,kind,id).run()}
 catch(err){console.warn('Library: not removed from the index',JSON.stringify({kind,id,reason:err instanceof Error?err.message.slice(0,160):'unknown'}))}
}

// ── From each kind of work to its row ─────────────────────────────────────
type VisualLike={id:string;title?:string;status?:string;jobStatus?:string;vehicle?:string;createdAt?:string;lineup?:unknown;width?:number;height?:number};
export const fromVisual=(owner:string,v:VisualLike):IndexEntry=>({kind:'visual',id:v.id,owner,title:v.title||'Key visual',tool:v.lineup?'Line-up':'Key visual',car:v.vehicle||null,
 status:v.status==='ready'?'ready':v.status==='failed'?'failed':plainStatus(v.jobStatus||v.status),assetId:v.id,width:v.width??null,height:v.height??null,createdAt:Date.parse(v.createdAt||'')||Date.now()});
type JobRow={owner:string;created_at:number|string;deleted_at?:number|null};
const parse=(data:unknown)=>{try{return typeof data==='string'?JSON.parse(data):data||{}}catch{return {}}};
export const fromFilm=(row:JobRow&{id:string;status:string;data:unknown}):IndexEntry=>{const d=parse(row.data) as {title?:string;vehicle?:string;sourceId?:string};
 return {kind:'film',id:row.id,owner:row.owner,title:d.title||'Film',tool:'Film',car:d.vehicle||null,status:plainStatus(row.status),assetId:d.sourceId||null,createdAt:Number(row.created_at)||Date.now(),deletedAt:row.deleted_at??null}};
export const fromSwap=(row:JobRow&{id:string;status:string;data:unknown}):IndexEntry=>{const d=parse(row.data) as {title?:string;vehicle?:string;imageIds?:string[]};
 return {kind:'swap',id:row.id,owner:row.owner,title:d.title||'Car swap',tool:'Car swap',car:d.vehicle||null,status:plainStatus(row.status),assetId:d.imageIds?.[0]||null,createdAt:Number(row.created_at)||Date.now(),deletedAt:row.deleted_at??null}};
export const fromStory=(row:JobRow&{id:string;data:unknown;updated_at?:number|string}):IndexEntry=>{const d=parse(row.data) as {title?:string;vehicle?:string;shots?:{imageId?:string}[];views?:{id?:string}[]};
 return {kind:'story',id:row.id,owner:row.owner,title:d.title||'Story',tool:'Story',car:d.vehicle||null,status:'ready',assetId:d.shots?.find(s=>s.imageId)?.imageId||d.views?.[0]?.id||null,createdAt:Number(row.created_at)||Date.now(),deletedAt:row.deleted_at??null}};
