import {bucket,imageKey,validId,StudioError} from './studio-server';
import {database,type FilmContext} from './film-server';
import {publicImage,type ImageRow} from './image-server';
import {imageDimensions} from './image-dimensions';
import type {Visual} from './studio';
type Context=FilmContext;
export async function allVisualObjects(store:R2Bucket,prefix:string){
  const objects:R2Object[]=[];let cursor:string|undefined;
  do{const page=await store.list({prefix:prefix+'visuals/',limit:1000,...cursor?{cursor}:{}});objects.push(...page.objects);cursor=page.truncated?page.cursor:undefined}while(cursor);
  return objects;
}
async function eachBatch<T,R>(items:T[],fn:(item:T)=>Promise<R>){const results:R[]=[];for(let i=0;i<items.length;i+=12)results.push(...await Promise.all(items.slice(i,i+12).map(fn)));return results}
export async function deletedVisualIds(ctx:Context){
 const ids=new Set<string>();let cursor:string|undefined;const prefix=ctx.prefix+'deleted-visuals/';
 do{const page=await bucket(ctx.BUCKET).list({prefix,limit:1000,...cursor?{cursor}:{}});for(const item of page.objects)ids.add(item.key.slice(prefix.length).replace(/\.json$/,''));cursor=page.truncated?page.cursor:undefined}while(cursor);return ids;
}
export async function deleteVisual(ctx:Context,id:string){
 if(!validId(id))throw new StudioError('Image not found.',404);
 const store=bucket(ctx.BUCKET),record=await store.get(ctx.prefix+'visuals/'+id+'.json');
 const row=await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(id,ctx.prefix).first<ImageRow>();
 if(!record&&!row)throw new StudioError('Image not found.',404);
 if(row&&(['queued','in_progress','archiving','unknown','submitting'].includes(row.status)||row.lock_until>Date.now()))throw new StudioError('Wait for this generation to finish before deleting it.',409);
 if(record){const visual=await record.json<Visual>();if(visual.status==='pending')throw new StudioError('Wait for this generation to finish before deleting it.',409)}
 // A library tombstone preserves source assets, dependent edits and billing rows.
 await store.put(ctx.prefix+'deleted-visuals/'+id+'.json',JSON.stringify({id,deletedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
 return {deleted:true,id};
}
export async function restoreVisual(ctx:Context,id:string){
 if(!validId(id))throw new StudioError('Image not found.',404);const store=bucket(ctx.BUCKET),key=ctx.prefix+'deleted-visuals/'+id+'.json';
 if(!await store.head(key))throw new StudioError('Deleted image not found.',404);await store.delete(key);return {restored:true,id};
}
export async function visualLibrary(ctx:Context,deleted=false){
  const store=bucket(ctx.BUCKET);const objects=await allVisualObjects(store,ctx.prefix);const warnings:string[]=[];
  const deletedIds=await deletedVisualIds(ctx);
  const saved=await eachBatch(objects,async item=>{try{const record=await store.get(item.key);return record?await record.json<Visual>():null}catch{warnings.push('A saved record could not be read.');return null}});
  const jobs=await database(ctx).prepare("SELECT * FROM image_jobs WHERE owner=? AND status<>'archived' ORDER BY created_at DESC").bind(ctx.prefix).all<ImageRow>();
  const visuals=await eachBatch([...saved.filter((v):v is Visual=>!!v),...jobs.results.map(publicImage)].filter(v=>deletedIds.has(v.id)===deleted),async visual=>{
    if(visual.status!=='ready'&&visual.provider==='higgsfield')return visual;
    const exists=await store.head(imageKey(ctx.prefix,visual.id));
    if(exists){if(visual.status!=='ready'){const image=await store.get(imageKey(ctx.prefix,visual.id));let dimensions={};try{dimensions=imageDimensions(new Uint8Array(await image!.arrayBuffer()))}catch{}return{...visual,...dimensions,status:'ready' as const,error:undefined}}return visual}
    if(visual.status==='ready')return{...visual,status:visual.provider==='higgsfield'?'pending' as const:'failed' as const,jobStatus:visual.provider==='higgsfield'?'archiving':visual.jobStatus,error:visual.provider==='higgsfield'?'Restoring the completed image from Higgsfield…':'The saved image file is missing. Its record is preserved; this is not an empty draft.'};
    return visual;
  });
  return {visuals:visuals.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),warning:warnings.length?'Some image records could not be read. Refresh to try again.':undefined};
}
export async function cleanEmptyVisuals(ctx:Context){
  const store=bucket(ctx.BUCKET),db=database(ctx);let removed=0;
  const rows=await db.prepare("SELECT * FROM image_jobs WHERE owner=? AND status IN ('draft','quoted','failed','nsfw','canceled') AND lock_until<?").bind(ctx.prefix,Date.now()).all<ImageRow>();
  for(const row of rows.results){
    if(await store.head(imageKey(ctx.prefix,row.id)))continue;
    // Retain the row, reservation and request receipt. Archived jobs still count
    // toward the daily budget; uncertain/active submissions are never archived.
    const result=await db.prepare("UPDATE image_jobs SET data=jsonb_set(data::jsonb,'{archivedStatus}',to_jsonb(status))::text,status='archived',updated_at=? WHERE id=? AND owner=? AND status=? AND lock_until<?").bind(Date.now(),row.id,ctx.prefix,row.status,Date.now()).run();removed+=result.meta.changes;
  }
  const objects=await allVisualObjects(store,ctx.prefix);
  for(const item of objects){const record=await store.get(item.key);if(!record)continue;let visual:Visual;try{visual=await record.json<Visual>()}catch{continue}
    const stale=visual.status==='pending'&&Date.parse(visual.createdAt)<Date.now()-30*60_000;
    if(visual.status!=='failed'&&!stale)continue;if(await store.head(imageKey(ctx.prefix,visual.id)))continue;
    await store.put(ctx.prefix+'archived-visuals/'+visual.id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
    await store.delete(item.key);removed++;
  }
  return {removed};
}
