'use client';
import * as React from 'react';
import Link from 'next/link';
import {ArchiveRestore,Download,Folder as FolderIcon,FolderInput,FolderPlus,Grid2x2,Inbox,LayoutList,Lock,Plus,Search,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {SkeletonTile,State} from '@/components/ds/feedback';
import {Field,Input,Select} from '@/components/ds/field';
import {PageHeader} from '@/components/ds/layout';
import {BulkBar,MediaGrid,MediaTile,Viewer} from '@/components/ds/media';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {emptyWords} from '@/lib/library-words';
import type {Folder,WorkItem} from './items';

// The one shared library (Phase 3, the approved wireframe): everything the
// company has made, with its folders on the left (a list on phones), search,
// filters, grid or list, select several, Move to…, delete with Undo, and
// Deleted with Restore. Group 2: it shows a page at a time (about 40) and asks
// for the next as you scroll; search, filters and sorting are the server's.

export type Place='all'|'unsorted'|'deleted'|string;
export type Sort='new'|'old'|'name';
export type LibraryQuery={place:Place;tool:string;car:string;who:''|'you'|'others';q:string;sort:Sort};
export const EMPTY_QUERY:Omit<LibraryQuery,'place'>={tool:'',car:'',who:'',q:'',sort:'new'};
export type Counts={all:number;unsorted:number;deleted:number};
export type LibraryActions={
 onMove:(ids:string[],folderId:string|null)=>void;
 onDelete:(ids:string[])=>void;
 onRestore:(ids:string[])=>void;
 onDownload?:(item:WorkItem)=>void;
};
const TOOLS=['Key visual','Line-up','Film','Car swap','Story'] as const;

export function FolderNav({folders,place,counts,hrefFor,label='Folders'}:{folders:Folder[];place:Place;counts:Counts;hrefFor:(p:Place)=>string;label?:string}){
 const top=folders.filter(f=>!f.parentId);
 const row=(p:Place,icon:React.ReactNode,name:string,count:number,sub?:boolean)=><Link key={p} className={'ds-folder'+(sub?' sub':'')} href={hrefFor(p)} aria-current={place===p?'page':undefined}>{icon}<span className="ds-truncate" title={name}>{name}</span><span className="ds-folder-count">{count.toLocaleString('en-US')}</span></Link>;
 return <nav className="ds-folders" aria-label={label}>
  {row('all',<Grid2x2 aria-hidden="true"/>,'Everything',counts.all)}
  {top.map(f=><React.Fragment key={f.id}>{row(f.id,<FolderIcon aria-hidden="true"/>,f.name,f.count)}{folders.filter(s=>s.parentId===f.id).map(s=>row(s.id,<FolderIcon aria-hidden="true"/>,s.name,s.count,true))}</React.Fragment>)}
  {row('unsorted',<Inbox aria-hidden="true"/>,'Not in a folder',counts.unsorted)}
  {row('deleted',<Trash2 aria-hidden="true"/>,'Deleted',counts.deleted)}
 </nav>;
}

export function MoveDialog({open,folders,count,onClose,onMove}:{open:boolean;folders:Folder[];count:number;onClose:()=>void;onMove:(folderId:string|null)=>void}){
 return <Dialog open={open} onClose={onClose} title={count===1?'Move to a folder':`Move ${count} items to a folder`}>
  <ul className="workspace-list workspace-move-list" aria-label="Folders">
   {folders.map(f=><li key={f.id}><button type="button" className="ds-menu-item" onClick={()=>onMove(f.id)}><FolderIcon aria-hidden="true"/><span className="ds-truncate" title={f.name}>{f.parentId?`${folders.find(p=>p.id===f.parentId)?.name} / `:''}{f.name}</span></button></li>)}
   <li><button type="button" className="ds-menu-item" onClick={()=>onMove(null)}><Inbox aria-hidden="true"/>Not in a folder</button></li>
  </ul>
 </Dialog>;
}

// Create: the tools (each to its own page; one not on the plan shows its plan
// chip and does nothing) and New folder (off until folders are switched on by
// migration 0006). Viewers and read-only views get no Create at all.
export type CreateTool={key:string;label:string;href:string;icon:React.ReactNode;/** The plan chip ("On Growth") when the plan lacks the tool. */locked?:string};
export type CreateOptions={tools:CreateTool[];/** Makes a folder (at the top, or in the folder shown). */onNewFolder?:(name:string)=>void;/** The folder a new one goes into, for the dialog's title. */folderIn?:string};
export const FOLDERS_OFF='Folders turn on after the next update';

export function CreateMenu({tools,foldersReady,onNewFolder}:{tools:CreateTool[];foldersReady:boolean;onNewFolder?:()=>void}){
 return <Menu label="Create" text="Create" kind="primary" trigger={<Plus aria-hidden="true"/>} listClassName="create">
  {tools.map(t=><MenuItem key={t.key} icon={t.icon} disabled={!!t.locked} aside={t.locked&&<span className="ds-badge"><Lock aria-hidden="true"/>{t.locked}</span>} onSelect={()=>location.assign(t.href)}>{t.label}</MenuItem>)}
  {onNewFolder&&<><MenuSeparator/><MenuItem icon={<FolderPlus/>} disabled={!foldersReady} detail={foldersReady?undefined:FOLDERS_OFF} onSelect={onNewFolder}>New folder</MenuItem></>}
 </Menu>;
}

function NewFolderDialog({open,folderIn,onClose,onSave}:{open:boolean;folderIn?:string;onClose:()=>void;onSave:(name:string)=>void}){
 const [name,setName]=React.useState('');
 const clean=name.trim();
 return <Dialog open={open} onClose={onClose} title={folderIn?`New folder in ${folderIn}`:'New folder'} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" disabled={!clean} onClick={()=>onSave(clean)}>Create folder</Button></>}>
  <form onSubmit={e=>{e.preventDefault();if(clean)onSave(clean)}}><Field label="Name" count={{value:name.length,max:80}}><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} autoComplete="off"/></Field></form>
 </Dialog>;
}

/** Asks for the next page when the end of the list comes near; a button does the same. */
function More({hasMore,loading,onMore,shown,total}:{hasMore:boolean;loading:boolean;onMore:()=>void;shown:number;total:number}){
 const ref=React.useRef<HTMLDivElement>(null),latest=React.useRef(onMore);
 React.useEffect(()=>{latest.current=onMore});
 React.useEffect(()=>{
  const el=ref.current;if(!el||!hasMore||typeof IntersectionObserver==='undefined')return;
  const watch=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting))latest.current()},{rootMargin:'800px 0px'});
  watch.observe(el);return()=>watch.disconnect();
 },[hasMore]);
 return <div ref={ref} className="workspace-more">
  {loading&&<div className="ds-grid" aria-busy="true" aria-label="Loading more">{Array.from({length:4},(_,i)=><SkeletonTile key={i}/>)}</div>}
  <p className="ds-muted" role="status">{`Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}{hasMore&&!loading&&<> · <button type="button" className="ds-link" onClick={onMore}>Load more</button></>}</p>
 </div>;
}

export function LibraryView({items,total,counts,folders,cars,query,onQuery,hasMore,loading,onMore,hrefFor,actions,createHref='/',create,above,readOnly,openId,foldersReady=true}:{
 items:WorkItem[];total:number;counts:Counts;folders:Folder[];cars:string[];query:LibraryQuery;onQuery:(q:Partial<LibraryQuery>)=>void;
 hasMore:boolean;loading:boolean;onMore:()=>void;hrefFor:(p:Place)=>string;actions:LibraryActions;/** Without create: a plain Create link to here. */createHref?:string;/** The Create menu. */create?:CreateOptions;
 /** A folder's path and sub-folders, above its title. */above?:React.ReactNode;/** Viewers and staff viewing a client: look, open, download. */readOnly?:boolean;/** Open this item in the viewer (?open=). */openId?:string|null;/** Before migration 0006 there are no folders to move to. */foldersReady?:boolean}){
 const [view,setView]=React.useState<'grid'|'list'>('grid'),[typed,setTyped]=React.useState(query.q);
 const [chosen,setChosen]=React.useState<Set<string>>(new Set()),[openItem,setOpenItem]=React.useState<string|null>(openId||null),[moving,setMoving]=React.useState<string[]|null>(null),[naming,setNaming]=React.useState(false);
 // Search asks the server a moment after typing stops.
 React.useEffect(()=>{if(typed===query.q)return;const t=setTimeout(()=>onQuery({q:typed}),300);return()=>clearTimeout(t)},[typed,query.q,onQuery]);
 const place=query.place,canMove=!readOnly&&foldersReady&&folders.length>0;
 const filtered=!!(query.q||query.tool||query.car||query.who);
 const toggle=(id:string,on:boolean)=>setChosen(s=>{const n=new Set(s);if(on)n.add(id);else n.delete(id);return n});
 const clear=()=>{setTyped('');onQuery({tool:'',car:'',who:'',q:''})};
 const ids=[...chosen],deletedView=place==='deleted';
 const open=openItem?items.findIndex(m=>m.id===openItem):-1;
 const openTile=(m:WorkItem)=>{if(m.kind==='image'||!m.href||deletedView)setOpenItem(m.id);else location.assign(m.href)};
 const folder=folders.find(f=>f.id===place);
 const title=deletedView?'Deleted':place==='all'?'Library':place==='unsorted'?'Not in a folder':folder?.name||'Library';
 const nothing=emptyWords(query,{folderName:folder?.name,readOnly,anything:counts.all>0});
 const createButton=create
  ?<CreateMenu tools={create.tools} foldersReady={foldersReady} onNewFolder={create.onNewFolder&&(()=>setNaming(true))}/>
  :<Link className="ds-btn primary" href={createHref}><Plus aria-hidden="true"/>Create</Link>;
 return <div className="ds-library">
  <FolderNav folders={folders} place={place} counts={counts} hrefFor={hrefFor}/>
  <div className="workspace-library-main">
   {above}
   <PageHeader title={title} lede={deletedView?'Deleted work keeps everything it had. Restore brings it back where it was.':place==='all'?'Everything your company has made, in one place.':`${(folder?.count??total).toLocaleString('en-US')} items`}
    actions={!deletedView&&!readOnly&&createButton}/>
   <div className="workspace-place-phone"><label className="ds-label" htmlFor="library-place">Folder</label>
    <Select id="library-place" value={place} onChange={e=>{location.href=hrefFor(e.target.value)}}>
     <option value="all">Everything ({counts.all})</option>
     {folders.map(f=><option key={f.id} value={f.id}>{f.parentId?'— ':''}{f.name} ({f.count})</option>)}
     <option value="unsorted">Not in a folder ({counts.unsorted})</option><option value="deleted">Deleted ({counts.deleted})</option>
    </Select></div>
   <div className="ds-toolbar">
    <label className="ds-search"><Search aria-hidden="true"/><span className="ds-sr-only">Search the library</span><input className="ds-input" type="search" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Search by name"/></label>
    <Select aria-label="Sort" value={query.sort} onChange={e=>onQuery({sort:e.target.value as Sort})}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></Select>
    <div className="ds-segmented" role="group" aria-label="View">
     <button type="button" aria-pressed={view==='grid'} aria-label="Grid" onClick={()=>setView('grid')}><Grid2x2 aria-hidden="true"/></button>
     <button type="button" aria-pressed={view==='list'} aria-label="List" onClick={()=>setView('list')}><LayoutList aria-hidden="true"/></button>
    </div>
   </div>
   <div className="ds-filters workspace-filters" role="group" aria-label="Filters">
    <Select aria-label="Tool" value={query.tool} onChange={e=>onQuery({tool:e.target.value})}><option value="">Every tool</option>{TOOLS.map(t=><option key={t}>{t}</option>)}</Select>
    <Select aria-label="Car" value={query.car} onChange={e=>onQuery({car:e.target.value})}><option value="">Every car</option>{cars.map(c=><option key={c}>{c}</option>)}</Select>
    <Select aria-label="Person" value={query.who} onChange={e=>onQuery({who:e.target.value as LibraryQuery['who']})}><option value="">Everybody</option><option value="you">You</option><option value="others">A teammate</option></Select>
    {filtered&&<button type="button" className="ds-link" onClick={clear}>Clear filters</button>}
    <span className="ds-muted workspace-count" role="status">{total.toLocaleString('en-US')} {total===1?'item':'items'}</span>
   </div>
   {items.length===0&&!loading
    ?<State kind={nothing.kind} title={nothing.title} actions={nothing.clear&&<Button onClick={clear}>{nothing.clear}</Button>}>{nothing.body}</State>
    :view==='grid'
     ?<MediaGrid label={title} selecting={chosen.size>0}>{items.map(m=><MediaTile key={m.id} item={m} selected={chosen.has(m.id)} onSelect={readOnly?undefined:on=>toggle(m.id,on)} onOpen={()=>openTile(m)}
        onMove={deletedView||!canMove?undefined:()=>setMoving([m.id])} onDownload={actions.onDownload&&m.full?()=>actions.onDownload!(m):undefined} onDelete={deletedView||readOnly?undefined:()=>actions.onDelete([m.id])}/>)}</MediaGrid>
     :<div className="ds-list" role="list" aria-label={title}>{items.map(m=><div key={m.id} className="ds-list-row" role="listitem" data-selected={chosen.has(m.id)||undefined}>
        {!readOnly&&<label className="ds-check"><input type="checkbox" checked={chosen.has(m.id)} onChange={e=>toggle(m.id,e.target.checked)} aria-label={`Select ${m.name}`}/></label>}
        <span className="ds-list-thumb" aria-hidden="true">
         {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
         {m.src&&<img src={m.src} alt="" loading="lazy" decoding="async"/>}
        </span>
        <button type="button" className="ds-link ds-truncate" title={m.name} onClick={()=>openTile(m)}>{m.name}</button>
        <span className="ds-tile-sub">{m.tool}</span><span className="ds-tile-sub ds-list-hide-phone">{m.person}</span><span className="ds-tile-sub">{m.sub}</span>
       </div>)}</div>}
   {(items.length>0||loading)&&<More hasMore={hasMore} loading={loading} onMore={onMore} shown={items.length} total={total}/>}
   <BulkBar count={chosen.size} onClear={()=>setChosen(new Set())}>
    {deletedView
     ?<Button size="sm" icon={<ArchiveRestore aria-hidden="true"/>} onClick={()=>{actions.onRestore(ids);setChosen(new Set())}}>Restore</Button>
     :<>{canMove&&<Button size="sm" icon={<FolderInput aria-hidden="true"/>} onClick={()=>setMoving(ids)}>Move to…</Button>}
       {actions.onDownload&&<Button size="sm" icon={<Download aria-hidden="true"/>} onClick={()=>items.filter(m=>chosen.has(m.id)&&m.full).forEach(m=>actions.onDownload!(m))}>Download</Button>}
       <Button size="sm" icon={<Trash2 aria-hidden="true"/>} onClick={()=>{actions.onDelete(ids);setChosen(new Set())}}>Delete</Button></>}
   </BulkBar>
   {create?.onNewFolder&&<NewFolderDialog key={naming?'open':'shut'} open={naming} folderIn={create.folderIn} onClose={()=>setNaming(false)} onSave={n=>{create.onNewFolder?.(n);setNaming(false)}}/>}
   <MoveDialog open={!!moving} folders={folders} count={moving?.length||0} onClose={()=>setMoving(null)} onMove={f=>{actions.onMove(moving||[],f);setMoving(null);setChosen(new Set())}}/>
   <Viewer items={items} index={open>=0?open:null} onIndex={i=>setOpenItem(items[i]?.id??null)} onClose={()=>setOpenItem(null)} onDownload={actions.onDownload?m=>actions.onDownload!(m as WorkItem):undefined}
    onMove={deletedView||!canMove?undefined:m=>setMoving([m.id])} onDelete={deletedView||readOnly?undefined:m=>{setOpenItem(null);actions.onDelete([m.id])}}/>
  </div>
 </div>;
}

// The same screen over a list held in the page (the design-system previews):
// the filtering the server does, done here.
export function LibraryScreen({items,folders,place,hrefFor,actions,createHref,create,cars,above,readOnly,openId,foldersReady}:{items:WorkItem[];folders:Folder[];place:Place;hrefFor:(p:Place)=>string;actions:LibraryActions;createHref?:string;create?:CreateOptions;/** The company's cars; with or without work. */cars?:string[];above?:React.ReactNode;readOnly?:boolean;openId?:string|null;foldersReady?:boolean}){
 const [q,setQ]=React.useState<LibraryQuery>({...EMPTY_QUERY,place});
 const [shownCount,setShownCount]=React.useState(40);
 const onQuery=React.useCallback((p:Partial<LibraryQuery>)=>{setQ(x=>({...x,...p}));setShownCount(40)},[]);
 const known=new Set(folders.map(f=>f.id)),filed=(i:WorkItem)=>i.folderId&&known.has(i.folderId)?i.folderId:null;
 const live=items.filter(i=>!i.deleted),counts={all:live.length,unsorted:live.filter(i=>!filed(i)).length,deleted:items.length-live.length};
 const inPlace=place==='deleted'?items.filter(i=>i.deleted):place==='all'?live:place==='unsorted'?live.filter(i=>!filed(i)):live.filter(i=>filed(i)===place||folders.find(f=>f.id===filed(i))?.parentId===place);
 const word=q.q.trim().toLowerCase();
 const all=inPlace.filter(i=>(!word||i.name.toLowerCase().includes(word))&&(!q.tool||i.tool===q.tool)&&(!q.car||i.car===q.car)&&(!q.who||(q.who==='you')===(i.person==='You')))
  .sort((a,b)=>q.sort==='name'?a.name.localeCompare(b.name):q.sort==='old'?a.at.localeCompare(b.at):b.at.localeCompare(a.at));
 return <LibraryView items={all.slice(0,shownCount)} total={all.length} counts={counts} folders={folders} cars={[...new Set([...(cars||[]),...items.map(i=>i.car).filter((c):c is string=>!!c)])].sort()} query={{...q,place}} onQuery={onQuery}
  hasMore={shownCount<all.length} loading={false} onMore={()=>setShownCount(n=>n+40)} hrefFor={hrefFor} actions={actions} createHref={createHref} create={create} above={above} readOnly={readOnly} openId={openId} foldersReady={foldersReady}/>;
}
