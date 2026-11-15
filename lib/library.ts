import {database,type FilmContext} from './film-server';
import {visualLibrary} from './visual-library';
import {publicFilm} from './films';
import {publicSwap} from './swaps';
import {trashReady} from './trash-ready';
import {folderMap,type FolderOut,type ItemKind} from './folders';
import type {Storyboard} from './storyboards';
// The one shared library (Phase 3 group 1): everything the company has made,
// whatever made it, with its folder and whether it is deleted. Only what the
// screens show: titles the company wrote, a thumbnail address, a plain status,
// the tool, the car, whether you made it. No provider, model, cost or error
// text (F-050), no other person's address.
export type LibraryTool='Key visual'|'Line-up'|'Film'|'Car swap'|'Story';
export type LibraryItem={kind:ItemKind;id:string;title:string;tool:LibraryTool;thumb:string|null;status:'ready'|'working'|'failed';
 car:string|null;mine:boolean;at:number;deleted:boolean;folderId:string|null;href:string;width?:number;height?:number};
export type Library={items:LibraryItem[];folders:FolderOut[];foldersReady:boolean;warning?:string};
const asset=(id:unknown)=>typeof id==='string'&&id?'/api/assets/'+id:null;
const working=new Set(['queued','in_progress','submitting','unknown','archiving','pending']);
const failed=new Set(['failed','canceled','cancelled','nsfw','interrupted']);
const state=(s:string|undefined):LibraryItem['status']=>s&&failed.has(s)?'failed':s&&working.has(s)?'working':'ready';
const LIMIT=200;
type Owned={owner:string;deleted_at?:number|null};

export async function companyLibrary(ctx:FilmContext):Promise<Library>{
 const db=database(ctx),trash=await trashReady(db);
 const del=trash?',deleted_at':'';
 const [visuals,map,films,swaps,boards]=await Promise.all([
  visualLibrary(ctx,'both'),
  folderMap(ctx),
  db.prepare(`SELECT * FROM films WHERE org_id=? ORDER BY created_at DESC LIMIT ${LIMIT}`).bind(ctx.org).all<Record<string,unknown>&Owned>(),
  db.prepare(`SELECT * FROM swap_jobs WHERE org_id=? ORDER BY created_at DESC LIMIT ${LIMIT}`).bind(ctx.org).all<Record<string,unknown>&Owned>(),
  db.prepare(`SELECT id,owner,data,updated_at${del} FROM storyboards WHERE org_id=? ORDER BY updated_at DESC LIMIT ${LIMIT}`).bind(ctx.org).all<{id:string;owner:string;data:string;updated_at:number;deleted_at?:number|null}>(),
 ]);
 const folderOf=(kind:ItemKind,id:string)=>map.placed.get(`${kind}:${id}`)??null;
 const items:LibraryItem[]=[];
 for(const v of visuals.visuals){
  const s=v.status==='ready'?'ready':v.status==='failed'?'failed':'working';
  items.push({kind:'visual',id:v.id,title:v.title||'Key visual',tool:v.lineup?'Line-up':'Key visual',thumb:s==='ready'?asset(v.id):null,status:s,car:v.vehicle||null,mine:!!v.mine,
   at:Date.parse(v.createdAt)||0,deleted:!!v.deleted,folderId:folderOf('visual',v.id),href:v.lineup?`/lineup?visual=${v.id}`:`/library?open=visual:${v.id}`,width:v.width,height:v.height});
 }
 for(const row of films.results){
  try{const f=publicFilm(row);items.push({kind:'film',id:f.id,title:f.data.title||'Film',tool:'Film',thumb:asset(f.data.sourceId),status:state(f.status),car:f.data.vehicle||null,mine:row.owner===ctx.prefix,
   at:Number(f.createdAt)||0,deleted:!!row.deleted_at,folderId:folderOf('film',f.id),href:`/films?id=${f.id}`})}
  catch{console.warn('Library: skipped an unreadable film',JSON.stringify({id:row.id}))}
 }
 for(const row of swaps.results){
  try{const s=publicSwap(row);items.push({kind:'swap',id:s.id,title:s.data.title||'Car swap',tool:'Car swap',thumb:asset(s.data.imageIds?.[0]),status:state(s.status),car:s.data.vehicle||null,mine:row.owner===ctx.prefix,
   at:Number(s.createdAt)||0,deleted:!!row.deleted_at,folderId:folderOf('swap',s.id),href:`/swap?id=${s.id}`})}
  catch{console.warn('Library: skipped an unreadable swap',JSON.stringify({id:row.id}))}
 }
 for(const row of boards.results){
  try{const b=JSON.parse(row.data) as Storyboard;const cover=b.shots?.find(s=>s.imageId)?.imageId||b.views?.[0]?.id;
   items.push({kind:'story',id:row.id,title:b.title||'Story',tool:'Story',thumb:asset(cover),status:'ready',car:b.vehicle||null,mine:row.owner===ctx.prefix,
    at:Number(row.updated_at)||0,deleted:!!row.deleted_at,folderId:folderOf('story',row.id),href:`/storyboard?id=${row.id}`})}
  catch{console.warn('Library: skipped an unreadable story',JSON.stringify({id:row.id}))}
 }
 return {items:items.sort((a,b)=>b.at-a.at),folders:map.folders,foldersReady:map.ready,warning:visuals.warning};
}
