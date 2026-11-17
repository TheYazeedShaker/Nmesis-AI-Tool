import {database,type FilmContext} from './film-server';
import {StudioError,validId} from './studio-server';
import {requireDeleteRight,locate} from './org-library';
import {foldersReady} from './trash-ready';
// Projects and folders (migration 0006). A folder is the company's: anyone in
// it sees it; owners and creators create, rename and move work into folders
// (viewers are refused by the route table); only its creator or a company
// owner deletes it. One level of sub-folders. A piece of work sits in at most
// one folder. Deleting a folder sets deleted_at on it and its sub-folders and
// keeps the memberships, so Undo puts everything back; the library treats work
// in a deleted folder as "Not in a folder".
export type ItemKind='visual'|'film'|'swap'|'story';
export const ITEM_KINDS:ItemKind[]=['visual','film','swap','story'];
export type FolderOut={id:string;name:string;parentId:string|null;createdAt:number;mine:boolean};
type Row={id:string;org_id:string;parent_id:string|null;name:string;created_by:string;created_at:number;updated_at:number;deleted_at:number|null};
const NOT_YET='Folders aren’t available yet. Try again later.';
export const MAX_FOLDERS=500,MAX_MOVE=200,NAME_MAX=80;
const db=(ctx:FilmContext)=>database(ctx);
async function ready(ctx:FilmContext){if(!await foldersReady(db(ctx)))throw new StudioError(NOT_YET,503)}
export function cleanName(v:unknown){
 const name=typeof v==='string'?v.replace(/\s+/g,' ').trim():'';
 if(!name)throw new StudioError('Give the folder a name.');
 if(name.length>NAME_MAX)throw new StudioError(`A folder name is at most ${NAME_MAX} characters.`);
 return name;
}
async function folderRow(ctx:FilmContext,id:unknown){
 if(!validId(id))throw new StudioError('Folder not found.',404);
 const row=await db(ctx).prepare('SELECT * FROM folders WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(id,ctx.org).first<Row>();
 if(!row)throw new StudioError('Folder not found.',404);
 return row;
}
// The company's folders and where each piece of work is. Before 0006: none.
export async function folderMap(ctx:FilmContext):Promise<{ready:boolean;folders:FolderOut[];placed:Map<string,string>}>{
 if(!await foldersReady(db(ctx)))return {ready:false,folders:[],placed:new Map()};
 const rows=(await db(ctx).prepare('SELECT * FROM folders WHERE org_id=? AND deleted_at IS NULL ORDER BY name').bind(ctx.org).all<Row>()).results;
 const live=new Set(rows.map(r=>r.id));
 const items=(await db(ctx).prepare('SELECT item_kind,item_id,folder_id FROM folder_items WHERE org_id=?').bind(ctx.org).all<{item_kind:string;item_id:string;folder_id:string}>()).results;
 const placed=new Map<string,string>();
 for(const i of items)if(live.has(i.folder_id))placed.set(`${i.item_kind}:${i.item_id}`,i.folder_id);
 // A sub-folder whose parent is gone is shown at the top level.
 return {ready:true,placed,folders:rows.map(r=>({id:r.id,name:r.name,parentId:r.parent_id&&live.has(r.parent_id)?r.parent_id:null,createdAt:Number(r.created_at),mine:r.created_by===ctx.prefix}))};
}
export async function createFolder(ctx:FilmContext,input:{name?:unknown;parentId?:unknown},now=Date.now()){
 await ready(ctx);
 const name=cleanName(input.name);
 let parentId:string|null=null;
 if(input.parentId!==undefined&&input.parentId!==null){const parent=await folderRow(ctx,input.parentId);if(parent.parent_id)throw new StudioError('A folder can hold folders one level deep.');parentId=parent.id}
 const count=await db(ctx).prepare('SELECT COUNT(*) AS n FROM folders WHERE org_id=? AND deleted_at IS NULL').bind(ctx.org).first<{n:number}>();
 if(Number(count?.n)>=MAX_FOLDERS)throw new StudioError(`Your company has ${MAX_FOLDERS} folders, the most it can have. Delete one first.`,409);
 const id=crypto.randomUUID();
 await db(ctx).prepare('INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,ctx.org,parentId,name,ctx.prefix,now,now).run();
 return {folder:{id,name,parentId,createdAt:now,mine:true} satisfies FolderOut};
}
export async function renameFolder(ctx:FilmContext,id:string,input:{name?:unknown},now=Date.now()){
 await ready(ctx);
 const row=await folderRow(ctx,id),name=cleanName(input.name);
 await db(ctx).prepare('UPDATE folders SET name=?,updated_at=? WHERE id=? AND org_id=?').bind(name,now,row.id,ctx.org).run();
 return {folder:{id:row.id,name,parentId:row.parent_id,createdAt:Number(row.created_at),mine:row.created_by===ctx.prefix} satisfies FolderOut};
}
export async function deleteFolder(ctx:FilmContext,id:string,now=Date.now()){
 await ready(ctx);
 const row=await folderRow(ctx,id);requireDeleteRight(ctx,row.created_by);
 await db(ctx).prepare('UPDATE folders SET deleted_at=? WHERE org_id=? AND deleted_at IS NULL AND (id=? OR parent_id=?)').bind(now,ctx.org,row.id,row.id).run();
 return {deleted:true,id:row.id,at:now};
}
// Undo: the folder and the sub-folders deleted with it (same moment) come back.
export async function restoreFolder(ctx:FilmContext,id:string,at:unknown){
 await ready(ctx);
 if(!validId(id))throw new StudioError('Folder not found.',404);
 const row=await db(ctx).prepare('SELECT * FROM folders WHERE id=? AND org_id=? AND deleted_at IS NOT NULL').bind(id,ctx.org).first<Row>();
 if(!row)throw new StudioError('Folder not found.',404);
 requireDeleteRight(ctx,row.created_by);
 const when=typeof at==='number'?at:Number(row.deleted_at);
 await db(ctx).prepare('UPDATE folders SET deleted_at=NULL WHERE org_id=? AND deleted_at=? AND (id=? OR parent_id=?)').bind(ctx.org,when,row.id,row.id).run();
 return {restored:true,id:row.id};
}
// Is this the company's work? Image jobs and the other tables carry org_id;
// a saved visual record lives under a member's prefix in storage.
async function belongs(ctx:FilmContext,kind:ItemKind,id:string){
 const table=kind==='film'?'films':kind==='swap'?'swap_jobs':kind==='story'?'storyboards':'image_jobs';
 const row=await db(ctx).prepare(`SELECT id FROM ${table} WHERE id=? AND org_id=?`).bind(id,ctx.org).first();
 if(row)return true;
 return kind==='visual'&&!!await locate(ctx,'visuals/'+id+'.json');
}
export async function moveItems(ctx:FilmContext,input:{items?:unknown;folderId?:unknown},now=Date.now()){
 await ready(ctx);
 const list=Array.isArray(input.items)?input.items:[];
 if(!list.length)throw new StudioError('Choose what to move.');
 if(list.length>MAX_MOVE)throw new StudioError(`Move at most ${MAX_MOVE} at a time.`);
 const items=list.map(x=>{const k=(x as {kind?:unknown})?.kind,i=(x as {id?:unknown})?.id;if(!ITEM_KINDS.includes(k as ItemKind)||!validId(i))throw new StudioError('Something in the selection can’t be moved.');return {kind:k as ItemKind,id:i as string}});
 const folder=input.folderId===null?null:await folderRow(ctx,input.folderId);
 for(const i of items)if(!await belongs(ctx,i.kind,i.id))throw new StudioError('Something in the selection is no longer in your library. Refresh and try again.',404);
 const d=db(ctx);
 for(const i of items){
  await d.prepare('DELETE FROM folder_items WHERE org_id=? AND item_kind=? AND item_id=?').bind(ctx.org,i.kind,i.id).run();
  if(folder)await d.prepare('INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,?,?,?,?)').bind(ctx.org,i.kind,i.id,folder.id,now).run();
 }
 return {moved:items.length,folderId:folder?.id??null};
}
