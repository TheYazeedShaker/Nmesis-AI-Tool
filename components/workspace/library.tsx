'use client';
import * as React from 'react';
import Link from 'next/link';
import {ArchiveRestore,Download,Folder as FolderIcon,FolderInput,Grid2x2,Inbox,LayoutList,Plus,Search,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {State} from '@/components/ds/feedback';
import {Select} from '@/components/ds/field';
import {PageHeader} from '@/components/ds/layout';
import {BulkBar,MediaGrid,MediaTile,Viewer} from '@/components/ds/media';
import type {Folder,WorkItem} from './items';

// The one shared library (Phase 3 group 1, the approved wireframe): everything
// the company has made, with its folders on the left (a list on phones),
// search, filters, grid or list, select several, Move to…, delete with Undo,
// and Deleted with Restore. Presentational: the page owns the data.

export type Place='all'|'unsorted'|'deleted'|string;
export type LibraryActions={
 onMove:(ids:string[],folderId:string|null)=>void;
 onDelete:(ids:string[])=>void;
 onRestore:(ids:string[])=>void;
 onDownload?:(item:WorkItem)=>void;
};
type Sort='new'|'old'|'name';
const TOOLS=['Key visual','Line-up','Film','Car swap','Story'] as const;
const unique=(xs:(string|undefined)[])=>[...new Set(xs.filter(Boolean) as string[])].sort();

export function FolderNav({folders,place,counts,hrefFor,label='Folders'}:{folders:Folder[];place:Place;counts:{all:number;unsorted:number;deleted:number};hrefFor:(p:Place)=>string;label?:string}){
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

export function LibraryScreen({items,folders,place,hrefFor,actions,createHref='/',above,readOnly,openId,foldersReady=true}:{items:WorkItem[];folders:Folder[];place:Place;hrefFor:(p:Place)=>string;actions:LibraryActions;createHref?:string;/** A folder's path and sub-folders, above its title. */above?:React.ReactNode;/** Viewers and staff viewing a client: look, open, download. */readOnly?:boolean;/** Open this item in the viewer (?open=). */openId?:string|null;/** Before migration 0006 there are no folders to move to. */foldersReady?:boolean}){
 const [query,setQuery]=React.useState(''),[sort,setSort]=React.useState<Sort>('new'),[view,setView]=React.useState<'grid'|'list'>('grid');
 const [tool,setTool]=React.useState(''),[car,setCar]=React.useState(''),[person,setPerson]=React.useState('');
 const [chosen,setChosen]=React.useState<Set<string>>(new Set()),[openItem,setOpenItem]=React.useState<string|null>(openId||null),[moving,setMoving]=React.useState<string[]|null>(null);
 // Work whose folder was deleted is "Not in a folder".
 const known=new Set(folders.map(f=>f.id)),inFolder=(i:WorkItem)=>!!i.folderId&&known.has(i.folderId);
 const canMove=!readOnly&&foldersReady&&folders.length>0;
 const live=items.filter(i=>!i.deleted),counts={all:live.length,unsorted:live.filter(i=>!inFolder(i)).length,deleted:items.length-live.length};
 const inPlace=place==='deleted'?items.filter(i=>i.deleted):place==='all'?live:place==='unsorted'?live.filter(i=>!inFolder(i)):live.filter(i=>i.folderId===place||folders.find(f=>f.id===i.folderId)?.parentId===place);
 const q=query.trim().toLowerCase();
 const shown=inPlace.filter(i=>(!q||[i.name,i.car,i.person].some(v=>v?.toLowerCase().includes(q)))&&(!tool||i.tool===tool)&&(!car||i.car===car)&&(!person||i.person===person))
  .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='old'?a.at.localeCompare(b.at):b.at.localeCompare(a.at));
 const filtered=!!(q||tool||car||person);
 const toggle=(id:string,on:boolean)=>setChosen(s=>{const n=new Set(s);if(on)n.add(id);else n.delete(id);return n});
 const clear=()=>{setQuery('');setTool('');setCar('');setPerson('')};
 const ids=[...chosen],deletedView=place==='deleted';
 const open=openItem?shown.findIndex(m=>m.id===openItem):-1;
 const openTile=(m:WorkItem)=>{if(m.kind==='image'||!m.href||deletedView)setOpenItem(m.id);else location.assign(m.href)};
 const title=deletedView?'Deleted':place==='all'?'Library':place==='unsorted'?'Not in a folder':folders.find(f=>f.id===place)?.name||'Library';
 return <div className="ds-library">
  <FolderNav folders={folders} place={place} counts={counts} hrefFor={hrefFor}/>
  <div className="workspace-library-main">
   {above}
   <PageHeader title={title} lede={deletedView?'Deleted work keeps everything it had. Restore brings it back where it was.':place==='all'?'Everything your company has made, in one place.':`${inPlace.length.toLocaleString('en-US')} items`}
    actions={!deletedView&&!readOnly&&<Link className="ds-btn primary" href={createHref}><Plus aria-hidden="true"/>Create</Link>}/>
   <div className="workspace-place-phone"><label className="ds-label" htmlFor="library-place">Folder</label>
    <Select id="library-place" value={place} onChange={e=>{location.href=hrefFor(e.target.value)}}>
     <option value="all">Everything ({counts.all})</option>
     {folders.map(f=><option key={f.id} value={f.id}>{f.parentId?'— ':''}{f.name} ({f.count})</option>)}
     <option value="unsorted">Not in a folder ({counts.unsorted})</option><option value="deleted">Deleted ({counts.deleted})</option>
    </Select></div>
   <div className="ds-toolbar">
    <label className="ds-search"><Search aria-hidden="true"/><span className="ds-sr-only">Search the library</span><input className="ds-input" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name, car or person"/></label>
    <Select aria-label="Sort" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></Select>
    <div className="ds-segmented" role="group" aria-label="View">
     <button type="button" aria-pressed={view==='grid'} aria-label="Grid" onClick={()=>setView('grid')}><Grid2x2 aria-hidden="true"/></button>
     <button type="button" aria-pressed={view==='list'} aria-label="List" onClick={()=>setView('list')}><LayoutList aria-hidden="true"/></button>
    </div>
   </div>
   <div className="ds-filters workspace-filters" role="group" aria-label="Filters">
    <Select aria-label="Tool" value={tool} onChange={e=>setTool(e.target.value)}><option value="">Every tool</option>{TOOLS.map(t=><option key={t}>{t}</option>)}</Select>
    <Select aria-label="Car" value={car} onChange={e=>setCar(e.target.value)}><option value="">Every car</option>{unique(items.map(i=>i.car)).map(c=><option key={c}>{c}</option>)}</Select>
    <Select aria-label="Person" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Everybody</option>{unique(items.map(i=>i.person)).map(p=><option key={p}>{p}</option>)}</Select>
    {filtered&&<button type="button" className="ds-link" onClick={clear}>Clear filters</button>}
    <span className="ds-muted workspace-count" role="status">{shown.length.toLocaleString('en-US')} {shown.length===1?'item':'items'}</span>
   </div>
   {shown.length===0
    ?(filtered?<State kind="no-results" title="Nothing matches" actions={<Button onClick={clear}>Clear filters</Button>}>Try another word, or fewer filters.</State>
      :deletedView?<State kind="empty" title="Nothing deleted">What you delete waits here, with Restore.</State>
      :<State kind="empty" title="Nothing here yet" actions={<Link className="ds-btn primary" href={createHref}><Plus aria-hidden="true"/>Create</Link>}>Move work here from the library with Move to…</State>)
    :view==='grid'
     ?<MediaGrid label={title} selecting={chosen.size>0}>{shown.map((m,i)=><MediaTile key={m.id} item={m} selected={chosen.has(m.id)} onSelect={readOnly?undefined:on=>toggle(m.id,on)} onOpen={()=>openTile(m)}
        onMove={deletedView||!canMove?undefined:()=>setMoving([m.id])} onDownload={actions.onDownload&&m.src?()=>actions.onDownload!(m):undefined} onDelete={deletedView||readOnly?undefined:()=>actions.onDelete([m.id])}/>)}</MediaGrid>
     :<div className="ds-list" role="list" aria-label={title}>{shown.map((m,i)=><div key={m.id} className="ds-list-row" role="listitem" data-selected={chosen.has(m.id)||undefined}>
        {!readOnly&&<label className="ds-check"><input type="checkbox" checked={chosen.has(m.id)} onChange={e=>toggle(m.id,e.target.checked)} aria-label={`Select ${m.name}`}/></label>}
        <span className="ds-list-thumb" aria-hidden="true">
         {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
         {m.src&&<img src={m.src} alt=""/>}
        </span>
        <button type="button" className="ds-link ds-truncate" title={m.name} onClick={()=>openTile(m)}>{m.name}</button>
        <span className="ds-tile-sub">{m.tool}</span><span className="ds-tile-sub ds-list-hide-phone">{m.person}</span><span className="ds-tile-sub">{m.sub}</span>
       </div>)}</div>}
   <BulkBar count={chosen.size} onClear={()=>setChosen(new Set())}>
    {deletedView
     ?<Button size="sm" icon={<ArchiveRestore aria-hidden="true"/>} onClick={()=>{actions.onRestore(ids);setChosen(new Set())}}>Restore</Button>
     :<>{canMove&&<Button size="sm" icon={<FolderInput aria-hidden="true"/>} onClick={()=>setMoving(ids)}>Move to…</Button>}
       {actions.onDownload&&<Button size="sm" icon={<Download aria-hidden="true"/>} onClick={()=>shown.filter(m=>chosen.has(m.id)&&m.src).forEach(m=>actions.onDownload!(m))}>Download</Button>}
       <Button size="sm" icon={<Trash2 aria-hidden="true"/>} onClick={()=>{actions.onDelete(ids);setChosen(new Set())}}>Delete</Button></>}
   </BulkBar>
   <MoveDialog open={!!moving} folders={folders} count={moving?.length||0} onClose={()=>setMoving(null)} onMove={f=>{actions.onMove(moving||[],f);setMoving(null);setChosen(new Set())}}/>
   <Viewer items={shown} index={open>=0?open:null} onIndex={i=>setOpenItem(shown[i]?.id??null)} onClose={()=>setOpenItem(null)} onDownload={actions.onDownload?m=>actions.onDownload!(m as WorkItem):undefined}
    onMove={deletedView||!canMove?undefined:m=>setMoving([m.id])} onDelete={deletedView||readOnly?undefined:m=>{setOpenItem(null);actions.onDelete([m.id])}}/>
  </div>
 </div>;
}
