import {fromFilm,fromStory,fromSwap,indexQuietly,indexReady,removeFromIndex,type IndexCtx} from './library-index';
// Brings one film, swap or story's library row up to date from its own table
// (after it is created or changed). Never throws: indexing never fails the
// action that changed the work.
type Kind='film'|'swap'|'story';
const TABLE:Record<Kind,string>={film:'films',swap:'swap_jobs',story:'storyboards'};
export async function syncWork(ctx:IndexCtx,kind:Kind,id:string){
 const db=ctx.DB;if(!db)return;
 try{
  if(!await indexReady(db))return;
  const row=await db.prepare(`SELECT * FROM ${TABLE[kind]} WHERE id=? AND org_id=?`).bind(id,ctx.org).first<Record<string,unknown>>();
  if(!row)return removeFromIndex(ctx,kind,id);
  const r=row as never;
  await indexQuietly(ctx,kind==='film'?fromFilm(r):kind==='swap'?fromSwap(r):fromStory(r));
 }catch(err){console.warn('Library: index not updated',JSON.stringify({kind,id,reason:err instanceof Error?err.message.slice(0,160):'unknown'}))}
}
