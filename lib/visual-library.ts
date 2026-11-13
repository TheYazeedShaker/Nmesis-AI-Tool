import {bucket,imageKey,validId,StudioError} from './studio-server';
import {database,type FilmContext} from './film-server';
import {publicImage,type ImageRow} from './image-server';
import {imageDimensions} from './image-dimensions';
import type {Visual} from './studio';
import {isUserPrefix,orgOf} from './portable/tenancy';
import {locate,memberPrefixes,requireDeleteRight} from './org-library';
import type {StudioBucket,StoredObject} from './portable/storage';
import {stalledGeneration,interruptedGenerationMessage} from './generation-status';
type Context=FilmContext;
export async function allVisualObjects(store:StudioBucket,prefix:string){
  const objects:StoredObject[]=[];let cursor:string|undefined;
  do{const page=await store.list({prefix:prefix+'visuals/',limit:1000,...cursor?{cursor}:{}});objects.push(...page.objects);cursor=page.truncated?page.cursor:undefined}while(cursor);
  return objects;
}
async function eachBatch<T,R>(items:T[],fn:(item:T)=>Promise<R>){const results:R[]=[];for(let i=0;i<items.length;i+=12)results.push(...await Promise.all(items.slice(i,i+12).map(fn)));return results}
async function deletedIn(store:StudioBucket,owner:string,into=new Set<string>()){
 let cursor:string|undefined;const prefix=owner+'deleted-visuals/';
 do{const page=await store.list({prefix,limit:1000,...cursor?{cursor}:{}});for(const item of page.objects)into.add(item.key.slice(prefix.length).replace(/.json$/,''));cursor=page.truncated?page.cursor:undefined}while(cursor);return into;
}
export async function deletedVisualIds(ctx:Context){return deletedIn(bucket(ctx.BUCKET),ctx.prefix)}
// The member prefix a visual of this company belongs to, from its job row or its record.
async function visualOwner(ctx:Context,id:string){
 const row=await database(ctx).prepare('SELECT owner FROM image_jobs WHERE id=? AND org_id=?').bind(id,ctx.org).first<{owner:string}>();
 if(row&&isUserPrefix(row.owner)&&orgOf(row.owner)===ctx.org)return row.owner;
 return locate(ctx,'visuals/'+id+'.json');
}
// Anyone in the company may see a visual; only its creator or a company owner may delete it.
export async function deleteVisual(ctx:Context,id:string){
 if(!validId(id))throw new StudioError('Image not found.',404);
 const owner=await visualOwner(ctx,id);if(!owner)throw new StudioError('Image not found.',404);
 requireDeleteRight(ctx,owner);
 const store=bucket(ctx.BUCKET),record=await store.get(owner+'visuals/'+id+'.json');
 const row=await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(id,owner).first<ImageRow>();
 if(!record&&!row)throw new StudioError('Image not found.',404);
 if(row&&(['queued','in_progress','archiving','unknown','submitting'].includes(row.status)||row.lock_until>Date.now()))throw new StudioError('Wait for this generation to finish before deleting it.',409);
 if(record){const visual=await record.json<Visual>();if(visual.status==='pending'&&!stalledGeneration(visual))throw new StudioError('Wait for this generation to finish before deleting it.',409)}
 // A library tombstone preserves source assets, dependent edits and billing rows.
 await store.put(owner+'deleted-visuals/'+id+'.json',JSON.stringify({id,deletedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
 return {deleted:true,id};
}
export async function restoreVisual(ctx:Context,id:string){
 if(!validId(id))throw new StudioError('Image not found.',404);
 const owner=await locate(ctx,'deleted-visuals/'+id+'.json');if(!owner)throw new StudioError('Deleted image not found.',404);
 requireDeleteRight(ctx,owner);await bucket(ctx.BUCKET).delete(owner+'deleted-visuals/'+id+'.json');return {restored:true,id};
}
export async function resolveVisual(ctx:Context,visual:Visual):Promise<Visual>{
 const store=bucket(ctx.BUCKET);
 if(visual.status!=='ready'&&visual.provider==='higgsfield')return visual;
 const exists=await store.head(imageKey(ctx.prefix,visual.id));
 if(exists){if(visual.status!=='ready'){const image=await store.get(imageKey(ctx.prefix,visual.id));let dimensions={};try{dimensions=imageDimensions(new Uint8Array(await image!.arrayBuffer()))}catch{console.warn('Saved image dimensions could not be recovered.')}return{...visual,...dimensions,status:'ready',error:undefined}}return visual}
 if(visual.status==='ready')return{...visual,status:visual.provider==='higgsfield'?'pending':'failed',jobStatus:visual.provider==='higgsfield'?'archiving':visual.jobStatus,error:visual.provider==='higgsfield'?'Restoring the completed image from Higgsfield…':'The saved image file is missing. Its record is preserved; this is not an empty draft.'};
 if(stalledGeneration(visual))return{...visual,status:'failed',jobStatus:'interrupted',error:interruptedGenerationMessage};
 return visual;
}
// The whole company's library: every member's saved visuals and image jobs.
export async function visualLibrary(ctx:Context,deleted=false){
  const store=bucket(ctx.BUCKET),warnings:string[]=[],deletedIds=new Set<string>(),items:{owner:string;visual:Visual}[]=[];
  for(const owner of await memberPrefixes(ctx)){
   await deletedIn(store,owner,deletedIds);
   const saved=await eachBatch(await allVisualObjects(store,owner),async item=>{try{const record=await store.get(item.key);return record?await record.json<Visual>():null}catch{warnings.push('A saved record could not be read.');return null}});
   for(const visual of saved)if(visual)items.push({owner,visual});
  }
  const jobs=await database(ctx).prepare("SELECT * FROM image_jobs WHERE org_id=? AND status<>'archived' ORDER BY created_at DESC").bind(ctx.org).all<ImageRow>();
  for(const row of jobs.results)if(isUserPrefix(row.owner)&&orgOf(row.owner)===ctx.org)items.push({owner:row.owner,visual:publicImage(row)});
  const visuals=await eachBatch(items.filter(x=>deletedIds.has(x.visual.id)===deleted),x=>resolveVisual({...ctx,prefix:x.owner},x.visual));
  return {visuals:visuals.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),warning:warnings.length?'Some image records could not be read. Refresh to try again.':undefined};
}
export async function cleanEmptyVisuals(ctx:Context){
  const store=bucket(ctx.BUCKET),db=database(ctx);let removed=0;
  const rows=await db.prepare("SELECT * FROM image_jobs WHERE org_id=? AND owner=? AND status IN ('draft','quoted','failed','nsfw','canceled') AND lock_until<?").bind(orgOf(ctx.prefix),ctx.prefix,Date.now()).all<ImageRow>();
  for(const row of rows.results){
    if(await store.head(imageKey(ctx.prefix,row.id)))continue;
    // Retain the row, reservation and request receipt. Archived jobs still count
    // toward the daily budget; uncertain/active submissions are never archived.
    let archived:string;try{archived=JSON.stringify({...JSON.parse(row.data),archivedStatus:row.status})}catch{continue}
    // Unchanged data and status (compare-and-swap) keep this as atomic as the former json_set.
    const result=await db.prepare("UPDATE image_jobs SET data=?,status='archived',updated_at=? WHERE id=? AND owner=? AND status=? AND lock_until<? AND data=?").bind(archived,Date.now(),row.id,ctx.prefix,row.status,Date.now(),row.data).run();removed+=result.meta.changes;
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
