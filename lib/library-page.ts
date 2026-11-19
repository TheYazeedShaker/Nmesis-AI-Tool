import {database,type FilmContext} from './film-server';
import {tidyCarText} from './car-names';
import {bucket,StudioError,validId} from './studio-server';
import {foldersReady} from './trash-ready';
import {indexReady,hidesPrivate,NOT_HIDDEN} from './library-index';
import {backfilled} from './library-backfill';
import {companyLibrary,type LibraryItem} from './library';
import type {WorkRef} from './work-ref';
// The library a page at a time (Phase 3 group 2), from the database alone: the
// index (0007) with the folders (0006). No storage read: each thumbnail is a
// short-lived signed link to the small WebP made when the work was saved (or,
// for work without one yet, /api/assets/<id>?thumb=1, which makes it once).
// Full pictures are opened only by the viewer (/api/assets/<id>). Before 0007
// runs, the same answer is made from the group 1 feed.

export const PAGE=40,MAX_PAGE=100;
export type Place='all'|'unsorted'|'deleted'|string;
export type PageQuery={place:Place;tool:string|null;car:string|null;who:'you'|'others'|null;q:string|null;sort:'new'|'old'|'name';offset:number;limit:number};
export type PageItem={kind:'visual'|'film'|'swap'|'story';id:string;title:string;tool:string;car:string|null;status:'ready'|'working'|'failed';mine:boolean;at:number;deleted:boolean;
 folderId:string|null;href:string;thumb:string|null;full:string|null;width?:number|null;height?:number|null};
export type PageFolder={id:string;name:string;parentId:string|null;count:number;covers:string[];mine:boolean};
export type LibraryPage={items:PageItem[];total:number;next:number|null;counts:{all:number;unsorted:number;deleted:number};folders:PageFolder[];cars:string[];foldersReady:boolean;indexed:boolean};
const TOOLS=['Key visual','Line-up','Film','Car swap','Story'];

export function readQuery(url:URL):PageQuery{
 const p=url.searchParams,text=(k:string,max:number)=>{const v=p.get(k)?.trim();return v?v.slice(0,max):null};
 const place=text('in',80)||'all';
 if(!['all','unsorted','deleted'].includes(place)&&!validId(place))throw new StudioError('That folder isn’t here.',404);
 const tool=text('tool',40);if(tool&&!TOOLS.includes(tool))throw new StudioError('Choose a tool from the list.');
 const who=p.get('who');const sort=p.get('sort');
 const offset=Math.max(0,Math.min(100_000,Number.parseInt(p.get('offset')||'0',10)||0));
 const limit=Math.max(1,Math.min(MAX_PAGE,Number.parseInt(p.get('limit')||String(PAGE),10)||PAGE));
 return {place,tool,car:text('car',120),who:who==='you'||who==='others'?who:null,q:text('q',100),sort:sort==='old'||sort==='name'?sort:'new',offset,limit};
}

const like=(q:string)=>'%'+q.toLowerCase().replace(/[\\%_]/g,m=>'\\'+m)+'%';
const hrefFor=(kind:PageItem['kind'],id:string,tool:string)=>kind==='film'?`/films?id=${id}`:kind==='swap'?`/swap?id=${id}`:kind==='story'?`/storyboard?id=${id}`:tool==='Line-up'?`/lineup?visual=${id}`:`/library?open=visual:${id}`;
type Row={kind:PageItem['kind'];id:string;owner:string;title:string;tool:string;car:string|null;status:PageItem['status'];thumb_key:string|null;asset_id:string|null;width:number|null;height:number|null;created_at:number;deleted_at:number|null;folder_id?:string|null};

/** brandCars: a company with several brands sees only the chosen brand's work (its cars' names) and work with no car.
 *  carChoices: the company's cars (the chosen brand's), named as people say them; the car filter lists them all,
 *  with work or without, and any other car that has work here. */
export async function libraryPage(ctx:FilmContext,query:PageQuery,{brandCars,carChoices}:{brandCars?:string[]|null;carChoices?:string[]|null}={}):Promise<LibraryPage>{
 const db=database(ctx);
 // Before 0007, or until this company's work from before it is indexed (lib/library-backfill.ts), the older feed.
 if(!await indexReady(db)||!await backfilled({DB:db,BUCKET:ctx.BUCKET,org:ctx.org}))return fromFeed(ctx,query,brandCars||null,carChoices||null);
 const store=bucket(ctx.BUCKET),withFolders=await foldersReady(db);
 const folderRows=withFolders?(await db.prepare('SELECT id,name,parent_id,created_by FROM folders WHERE org_id=? AND deleted_at IS NULL ORDER BY name').bind(ctx.org).all<{id:string;name:string;parent_id:string|null;created_by:string}>()).results:[];
 const live=folderRows.map(f=>f.id),known=new Set(live);
 if(!['all','unsorted','deleted'].includes(query.place)&&!known.has(query.place))throw new StudioError('That folder isn’t here.',404);
 // Where each piece of work is filed: a live folder, or none.
 const marks=live.map(()=>'?').join(',');
 const filed=withFolders&&live.length?`(SELECT fi.folder_id FROM folder_items fi WHERE fi.org_id=li.org_id AND fi.item_kind=li.kind AND fi.item_id=li.id AND fi.folder_id IN (${marks}))`:'NULL';
 // Others' "Only me" work (0011) is left out of every list, count, folder cover and car below.
 const hide=await hidesPrivate(db,ctx),hidden=hide?' AND '+NOT_HIDDEN:'',hiddenArgs=hide?[ctx.prefix]:[];
 const where:string[]=['li.org_id=?'],args:unknown[]=[ctx.org];
 if(hide){where.push(NOT_HIDDEN);args.push(ctx.prefix)}
 where.push(query.place==='deleted'?'li.deleted_at IS NOT NULL':'li.deleted_at IS NULL');
 if(query.place==='unsorted'){if(filed!=='NULL'){where.push(`${filed} IS NULL`);args.push(...live)}}
 else if(!['all','deleted'].includes(query.place)){
  const scope=[query.place,...folderRows.filter(f=>f.parent_id===query.place).map(f=>f.id)];
  where.push(`EXISTS (SELECT 1 FROM folder_items fi WHERE fi.org_id=li.org_id AND fi.item_kind=li.kind AND fi.item_id=li.id AND fi.folder_id IN (${scope.map(()=>'?').join(',')}))`);args.push(...scope);
 }
 // Car names as stored (work saved before the naming rule may carry a doubled brand); filters and the list use the mended name.
 const stored=(await db.prepare(`SELECT DISTINCT li.car AS car FROM library_items li WHERE li.org_id=? AND li.car IS NOT NULL${hidden} ORDER BY li.car LIMIT 400`).bind(ctx.org,...hiddenArgs).all<{car:string}>()).results.map(c=>c.car);
 const named=(names:string[])=>{const want=new Set(names);return stored.filter(c=>want.has(tidyCarText(c)||c))};
 const inBrand=brandCars?named(brandCars.map(c=>tidyCarText(c)||c)):null;
 const brandWhere=inBrand?(inBrand.length?`(li.car IS NULL OR li.car IN (${inBrand.map(()=>'?').join(',')}))`:'li.car IS NULL'):null;
 if(brandWhere){where.push(brandWhere);args.push(...(inBrand as string[]))}
 if(query.tool){where.push('li.tool=?');args.push(query.tool)}
 if(query.car){const these=named([query.car]);if(these.length){where.push(`li.car IN (${these.map(()=>'?').join(',')})`);args.push(...these)}else{where.push('li.car=?');args.push(query.car)}}
 if(query.who){where.push(query.who==='you'?'li.owner=?':'li.owner<>?');args.push(ctx.prefix)}
 if(query.q){where.push("LOWER(li.title) LIKE ? ESCAPE '\\'");args.push(like(query.q))}
 const order=query.sort==='name'?'LOWER(li.title) ASC, li.id ASC':query.sort==='old'?'li.created_at ASC, li.id ASC':'li.created_at DESC, li.id DESC';
 const folderArgs=filed!=='NULL'?live:[];
 const [rows,total,counts,perFolder,covers]=await Promise.all([
  db.prepare(`SELECT li.*, ${filed} AS folder_id FROM library_items li WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...folderArgs,...args,query.limit,query.offset).all<Row>(),
  db.prepare(`SELECT COUNT(*) AS n FROM library_items li WHERE ${where.join(' AND ')}`).bind(...args).first<{n:number}>(),
  db.prepare(`SELECT SUM(CASE WHEN li.deleted_at IS NULL THEN 1 ELSE 0 END) AS live_n, SUM(CASE WHEN li.deleted_at IS NULL AND ${filed} IS NULL THEN 1 ELSE 0 END) AS unsorted_n, SUM(CASE WHEN li.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_n FROM library_items li WHERE li.org_id=?${brandWhere?' AND '+brandWhere:''}${hidden}`).bind(...folderArgs,ctx.org,...(brandWhere?inBrand as string[]:[]),...hiddenArgs).first<{live_n:number;unsorted_n:number;deleted_n:number}>(),
  live.length?db.prepare(`SELECT fi.folder_id AS folder_id, COUNT(*) AS n FROM folder_items fi JOIN library_items li ON li.org_id=fi.org_id AND li.kind=fi.item_kind AND li.id=fi.item_id WHERE fi.org_id=? AND li.deleted_at IS NULL AND fi.folder_id IN (${marks})${hidden} GROUP BY fi.folder_id`).bind(ctx.org,...live,...hiddenArgs).all<{folder_id:string;n:number}>():Promise.resolve({results:[]}),
  live.length?db.prepare(`SELECT fi.folder_id AS folder_id, li.thumb_key AS thumb_key FROM folder_items fi JOIN library_items li ON li.org_id=fi.org_id AND li.kind=fi.item_kind AND li.id=fi.item_id WHERE fi.org_id=? AND li.deleted_at IS NULL AND li.thumb_key IS NOT NULL AND fi.folder_id IN (${marks})${hidden} ORDER BY li.created_at DESC LIMIT 400`).bind(ctx.org,...live,...hiddenArgs).all<{folder_id:string;thumb_key:string}>():Promise.resolve({results:[]}),
 ]);
 const sign=(key:string)=>store.downloadUrl(key);
 const items=await Promise.all(rows.results.map(r=>pageItem(ctx,r,sign)));
 const count=new Map(perFolder.results.map(r=>[r.folder_id,Number(r.n)]));
 const coverKeys=new Map<string,string[]>();for(const c of covers.results){const list=coverKeys.get(c.folder_id)||[];if(list.length<3)list.push(c.thumb_key);coverKeys.set(c.folder_id,list)}
 // A folder counts its sub-folders' work too.
 const folders=await Promise.all(folderRows.map(async f=>{const subs=folderRows.filter(s=>s.parent_id===f.id).map(s=>s.id);
  const keys=[...(coverKeys.get(f.id)||[]),...subs.flatMap(s=>coverKeys.get(s)||[])].slice(0,3);
  return {id:f.id,name:f.name,parentId:f.parent_id&&known.has(f.parent_id)?f.parent_id:null,count:(count.get(f.id)||0)+subs.reduce((n,s)=>n+(count.get(s)||0),0),covers:await Promise.all(keys.map(sign)),mine:f.created_by===ctx.prefix} satisfies PageFolder}));
 const n=Number(total?.n)||0;
 return {items,total:n,next:query.offset+items.length<n?query.offset+items.length:null,
  counts:{all:Number(counts?.live_n)||0,unsorted:Number(counts?.unsorted_n)||0,deleted:Number(counts?.deleted_n)||0},
  folders,cars:carList(carChoices,(inBrand||stored).map(c=>tidyCarText(c)||c)),foldersReady:withFolders,indexed:true};
}

/** One row as the page shows it (thumbnails on short-lived signed links). */
async function pageItem(ctx:FilmContext,r:Row,sign:(key:string)=>Promise<string>|string):Promise<PageItem>{
 return {kind:r.kind,id:r.id,title:tidyCarText(r.title)||r.title,tool:r.tool,car:tidyCarText(r.car),status:r.status,mine:r.owner===ctx.prefix,at:Number(r.created_at),deleted:r.deleted_at!==null&&r.deleted_at!==undefined,
  folderId:r.folder_id??null,href:hrefFor(r.kind,r.id,r.tool),width:r.width,height:r.height,
  thumb:r.thumb_key?await sign(r.thumb_key):r.asset_id&&r.status==='ready'?`/api/assets/${r.asset_id}?thumb=1`:null,
  full:r.asset_id&&r.status==='ready'?`/api/assets/${r.asset_id}`:null};
}

/**
 * One piece of work by its kind and id (Projects opened on a link, ?open=, to
 * work older than the pages loaded so far), with the same rules as the list:
 * the company's own, not deleted, not another person's "Only me", in the
 * chosen brand. Null for anything else.
 */
export async function libraryItem(ctx:FilmContext,ref:WorkRef,{brandCars}:{brandCars?:string[]|null}={}):Promise<PageItem|null>{
 if(!validId(ref.id))return null;
 const db=database(ctx),inBrand=(car:string|null)=>!brandCars||!car||brandCars.map(c=>tidyCarText(c)||c).includes(car);
 if(!await indexReady(db)||!await backfilled({DB:db,BUCKET:ctx.BUCKET,org:ctx.org})){
  const all=await fromFeed(ctx,{place:'all',tool:null,car:null,who:null,q:null,sort:'new',offset:0,limit:100_000},brandCars||null,null);
  const found=all.items.find(i=>i.kind===ref.kind&&i.id===ref.id);
  return found&&inBrand(found.car)?found:null;
 }
 const hide=await hidesPrivate(db,ctx),withFolders=await foldersReady(db);
 const filed=withFolders?'(SELECT fi.folder_id FROM folder_items fi JOIN folders f ON f.id=fi.folder_id AND f.org_id=fi.org_id AND f.deleted_at IS NULL WHERE fi.org_id=li.org_id AND fi.item_kind=li.kind AND fi.item_id=li.id LIMIT 1)':'NULL';
 const row=await db.prepare(`SELECT li.*, ${filed} AS folder_id FROM library_items li WHERE li.org_id=? AND li.kind=? AND li.id=? AND li.deleted_at IS NULL${hide?' AND '+NOT_HIDDEN:''}`)
  .bind(ctx.org,ref.kind,ref.id,...(hide?[ctx.prefix]:[])).first<Row>();
 if(!row)return null;
 const item=await pageItem(ctx,row,key=>bucket(ctx.BUCKET).downloadUrl(key));
 return inBrand(item.car)?item:null;
}

/** The car filter's choices: the company's cars and the cars with work, each once, A–Z (at most 200). */
export function carList(choices:string[]|null|undefined,withWork:string[]){
 return [...new Set([...(choices||[]),...withWork].map(c=>(tidyCarText(c)||c).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'})).slice(0,200);
}

// Before 0007: the group 1 feed, filtered and paged here.
async function fromFeed(ctx:FilmContext,query:PageQuery,brandCars:string[]|null,carChoices:string[]|null):Promise<LibraryPage>{
 const all=await companyLibrary(ctx),brand=brandCars?new Set(brandCars.map(c=>tidyCarText(c)||c)):null;
 // Others' "Only me" work (0011) is left out here too.
 const db=database(ctx),hidden=await hidesPrivate(db,ctx)?new Set((await db.prepare("SELECT item_kind,item_id FROM work_access WHERE org_id=? AND access='private'").bind(ctx.org).all<{item_kind:string;item_id:string}>()).results.map(r=>`${r.item_kind}:${r.item_id}`)):null;
 const lib={...all,items:all.items.map(i=>({...i,title:tidyCarText(i.title)||i.title,car:tidyCarText(i.car)})).filter(i=>(!brand||!i.car||brand.has(i.car))&&(i.mine||!hidden?.has(`${i.kind}:${i.id}`)))},known=new Set(lib.folders.map(f=>f.id));
 const filed=(i:LibraryItem)=>i.folderId&&known.has(i.folderId)?i.folderId:null;
 const inFolder=(i:LibraryItem,f:string)=>{const at=filed(i);return !!at&&(at===f||lib.folders.find(x=>x.id===at)?.parentId===f)};
 const q=query.q?.toLowerCase();
 const shown=lib.items.filter(i=>(query.place==='deleted'?i.deleted:!i.deleted)&&(query.place==='unsorted'?!filed(i):['all','deleted'].includes(query.place)?true:inFolder(i,query.place))
  &&(!query.tool||i.tool===query.tool)&&(!query.car||i.car===query.car)&&(!query.who||(query.who==='you')===i.mine)&&(!q||i.title.toLowerCase().includes(q)))
  .sort((a,b)=>query.sort==='name'?a.title.localeCompare(b.title):query.sort==='old'?a.at-b.at:b.at-a.at);
 const page=shown.slice(query.offset,query.offset+query.limit);
 const live=lib.items.filter(i=>!i.deleted);
 return {items:page.map(i=>({kind:i.kind,id:i.id,title:i.title,tool:i.tool,car:i.car,status:i.status,mine:i.mine,at:i.at,deleted:i.deleted,folderId:filed(i),href:i.href,thumb:i.thumb?`${i.thumb}?thumb=1`:null,full:i.thumb,width:i.width,height:i.height})),
  total:shown.length,next:query.offset+page.length<shown.length?query.offset+page.length:null,
  counts:{all:live.length,unsorted:live.filter(i=>!filed(i)).length,deleted:lib.items.length-live.length},
  folders:lib.folders.map(f=>{const mine=live.filter(i=>inFolder(i,f.id));return {id:f.id,name:f.name,parentId:f.parentId,count:mine.length,covers:mine.filter(i=>i.thumb).slice(0,3).map(i=>`${i.thumb}?thumb=1`),mine:f.mine}}),
  cars:carList(carChoices,lib.items.map(i=>i.car).filter((c):c is string=>!!c)),foldersReady:lib.foldersReady,indexed:false};
}
