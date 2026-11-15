import {database,type FilmContext} from './film-server';
import {StudioError,validId} from './studio-server';
import {requireDeleteRight} from './org-library';
import {trashReady} from './trash-ready';
// Delete and restore for films, swaps and stories (migration 0005). A deleted
// row keeps its media, billing and the work that used it; deleted_at only takes
// it out of the lists, so Undo and the Deleted view can bring it back. Anyone in
// the company sees the company's work; only its creator or a company owner may
// delete or restore it (the library's rule, lib/org-library.ts).
import type {TrashKind} from './trash-words';
export type {TrashKind};
export const TRASH_KINDS:TrashKind[]=['films','swaps','storyboards'];
const TABLE:Record<TrashKind,string>={films:'films',swaps:'swap_jobs',storyboards:'storyboards'};
const NAME:Record<TrashKind,string>={films:'Film',swaps:'Swap',storyboards:'Story'};
const WORD:Record<TrashKind,string>={films:'film',swaps:'swap',storyboards:'story'};
// A job the provider may still be working on (and may still charge for).
const ACTIVE=new Set(['submitting','queued','in_progress','unknown']);
// The list filter: what a list shows, and what the Deleted view shows.
// Before migration 0005 every row is listed and Deleted is empty.
export const listed=(deleted:boolean,ready=true)=>!ready?(deleted?' AND 1=0':''):deleted?' AND deleted_at IS NOT NULL':' AND deleted_at IS NULL';
const NOT_YET='Deleting isn’t available yet. Try again later.';
type Row={owner:string;lock_until:number;deleted_at:number|null;status?:string};
async function find(ctx:FilmContext,kind:TrashKind,id:string){
 if(!await trashReady(database(ctx)))throw new StudioError(NOT_YET,503);
 if(!validId(id))throw new StudioError(`${NAME[kind]} not found.`,404);
 const row=await database(ctx).prepare(`SELECT * FROM ${TABLE[kind]} WHERE id=? AND org_id=?`).bind(id,ctx.org).first<Row>();
 if(!row)throw new StudioError(`${NAME[kind]} not found.`,404);
 requireDeleteRight(ctx,row.owner);
 return row;
}
export async function trashItem(ctx:FilmContext,kind:TrashKind,id:string,now=Date.now()){
 const row=await find(ctx,kind,id);
 if(row.deleted_at)return {deleted:true,id};
 if(row.lock_until>now||(row.status&&ACTIVE.has(row.status)))throw new StudioError(`Wait for this ${WORD[kind]} to finish before deleting it.`,409);
 // Unchanged lock and not yet deleted (compare-and-swap): a render that starts
 // at the same moment wins, and this asks again.
 const r=await database(ctx).prepare(`UPDATE ${TABLE[kind]} SET deleted_at=? WHERE id=? AND org_id=? AND deleted_at IS NULL AND lock_until<?`).bind(now,id,ctx.org,now+1).run();
 if(!r.meta.changes)throw new StudioError(`This ${WORD[kind]} is being updated. Wait a moment, then try again.`,409);
 return {deleted:true,id};
}
export async function restoreItem(ctx:FilmContext,kind:TrashKind,id:string){
 const row=await find(ctx,kind,id);
 if(!row.deleted_at)return {restored:true,id};
 await database(ctx).prepare(`UPDATE ${TABLE[kind]} SET deleted_at=NULL WHERE id=? AND org_id=?`).bind(id,ctx.org).run();
 return {restored:true,id};
}
