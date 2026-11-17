'use client';
import * as React from 'react';
import Link from 'next/link';
import {ChevronRight,Folder as FolderIcon,FolderPlus,MoreHorizontal,Pencil,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {State} from '@/components/ds/feedback';
import {Field,Input} from '@/components/ds/field';
import {PageHeader} from '@/components/ds/layout';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {LibraryScreen,type LibraryActions,type Place} from './library';
import type {Folder,WorkItem} from './items';

// Projects and folders (Phase 3 group 1, the approved wireframe). Folders are
// the company's, one level of sub-folders deep; owners and creators change
// them, viewers look. A folder opens as the library, scoped to it.

export type FolderActions={
 onCreate:(name:string,parentId:string|null)=>void;
 onRename:(id:string,name:string)=>void;
 onDelete:(id:string)=>void;
};

function NameDialog({open,title,verb,initial,onClose,onSave}:{open:boolean;title:string;verb:string;initial?:string;onClose:()=>void;onSave:(name:string)=>void}){
 const [name,setName]=React.useState(initial||'');
 const clean=name.trim();
 return <Dialog open={open} onClose={onClose} title={title} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" disabled={!clean} onClick={()=>onSave(clean)}>{verb}</Button></>}>
  <form onSubmit={e=>{e.preventDefault();if(clean)onSave(clean)}}><Field label="Name" count={{value:name.length,max:80}}><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} autoComplete="off"/></Field></form>
 </Dialog>;
}

function FolderCard({folder,subs,canEdit,onRename,onDelete}:{folder:Folder;subs:number;canEdit:boolean;onRename:()=>void;onDelete:()=>void}){
 return <div className="workspace-folder" role="listitem">
  <Link className="workspace-folder-link" href={`/projects/${folder.id}`}>
   <span className="workspace-folder-covers" aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    {folder.covers.length?folder.covers.slice(0,3).map((c,i)=><img key={i} src={c} alt=""/>):<FolderIcon/>}
   </span>
   <span className="workspace-folder-meta"><span className="ds-tile-name ds-truncate" title={folder.name}>{folder.name}</span>
    <span className="ds-tile-sub">{folder.count.toLocaleString('en-US')} {folder.count===1?'item':'items'}{subs?` · ${subs} ${subs===1?'folder':'folders'}`:''}</span></span>
  </Link>
  {canEdit&&<div className="workspace-folder-menu"><Menu label={`More for ${folder.name}`} trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
   <MenuItem icon={<Pencil/>} onSelect={onRename}>Rename</MenuItem><MenuSeparator/>
   <MenuItem icon={<Trash2/>} danger onSelect={onDelete}>Delete folder</MenuItem>
  </Menu></div>}
 </div>;
}

// The page's header, the same whether the folders are loading, not switched on
// yet, or listed.
export function ProjectsHeader({action}:{action?:React.ReactNode}){
 return <PageHeader title="Projects" lede="Folders for your company’s work, shared with everybody in it. Owners and creators can change them." actions={action}/>;
}

// Folders not switched on yet (before migration 0006): the page keeps its
// header and says where the work is.
export function ProjectsUnavailable(){
 return <>
  <ProjectsHeader/>
  <State kind="empty" title="Folders are on their way" icon={<FolderIcon/>} actions={<Link className="ds-btn" href="/library">Open the library</Link>}>Folders aren’t available yet. Your work is all in the library.</State>
 </>;
}

export function ProjectsScreen({folders,canEdit,actions}:{folders:Folder[];canEdit:boolean;actions:FolderActions}){
 const [creating,setCreating]=React.useState(false),[renaming,setRenaming]=React.useState<Folder|null>(null);
 const top=folders.filter(f=>!f.parentId);
 return <>
  <ProjectsHeader action={canEdit&&<Button kind="primary" icon={<FolderPlus aria-hidden="true"/>} onClick={()=>setCreating(true)}>New folder</Button>}/>
  {top.length
   ?<div className="workspace-folders" role="list" aria-label="Folders">{top.map(f=><FolderCard key={f.id} folder={f} subs={folders.filter(s=>s.parentId===f.id).length} canEdit={canEdit} onRename={()=>setRenaming(f)} onDelete={()=>actions.onDelete(f.id)}/>)}</div>
   :<State kind="empty" title="No folders yet" actions={canEdit&&<Button kind="primary" icon={<FolderPlus aria-hidden="true"/>} onClick={()=>setCreating(true)}>New folder</Button>}>A folder keeps a campaign’s visuals, films and stories together.</State>}
  <NameDialog key={creating?'new-open':'new'} open={creating} title="New folder" verb="Create folder" onClose={()=>setCreating(false)} onSave={n=>{actions.onCreate(n,null);setCreating(false)}}/>
  <NameDialog key={renaming?.id||'rename'} open={!!renaming} title="Rename folder" verb="Rename" initial={renaming?.name} onClose={()=>setRenaming(null)} onSave={n=>{if(renaming)actions.onRename(renaming.id,n);setRenaming(null)}}/>
 </>;
}

// One folder's path and sub-folders, above the library scoped to it.
export function FolderHeader({folder,folders,canEdit,folderActions}:{folder:Folder;folders:Folder[];canEdit:boolean;folderActions:FolderActions}){
 const parent=folders.find(f=>f.id===folder.parentId),subs=folders.filter(f=>f.parentId===folder.id);
 const [creating,setCreating]=React.useState(false);
 return <>
  <nav className="workspace-crumbs" aria-label="Where you are"><ol>
   <li><Link className="ds-link" href="/projects">Projects</Link></li>
   {parent&&<li><ChevronRight aria-hidden="true"/><Link className="ds-link" href={`/projects/${parent.id}`}>{parent.name}</Link></li>}
   <li aria-current="page"><ChevronRight aria-hidden="true"/><span className="ds-truncate" title={folder.name}>{folder.name}</span></li>
  </ol></nav>
  {(subs.length>0||(canEdit&&!folder.parentId))&&<div className="workspace-subfolders">
   {subs.map(s=><Link key={s.id} className="ds-chip" href={`/projects/${s.id}`}><FolderIcon aria-hidden="true"/>{s.name}<span className="ds-folder-count">{s.count}</span></Link>)}
   {canEdit&&!folder.parentId&&<Button size="sm" kind="quiet" icon={<FolderPlus aria-hidden="true"/>} onClick={()=>setCreating(true)}>New sub-folder</Button>}
  </div>}
  <NameDialog key={creating?'sub-open':'sub'} open={creating} title={`New folder in ${folder.name}`} verb="Create folder" onClose={()=>setCreating(false)} onSave={n=>{folderActions.onCreate(n,folder.id);setCreating(false)}}/>
 </>;
}
export const folderHref=(p:Place)=>p==='all'?'/library':p==='unsorted'||p==='deleted'?`/library?in=${p}`:`/projects/${p}`;

// One folder over a list held in the page (the design-system previews).
export function FolderScreen({folder,folders,items,canEdit,folderActions,libraryActions,foldersReady=true}:{folder:Folder;folders:Folder[];items:WorkItem[];canEdit:boolean;folderActions:FolderActions;libraryActions:LibraryActions;foldersReady?:boolean}){
 return <div className="workspace-folder-page">
  <LibraryScreen items={items} folders={folders} place={folder.id} hrefFor={folderHref} actions={libraryActions} above={<FolderHeader folder={folder} folders={folders} canEdit={canEdit} folderActions={folderActions}/>} readOnly={!canEdit} foldersReady={foldersReady}/>
 </div>;
}
