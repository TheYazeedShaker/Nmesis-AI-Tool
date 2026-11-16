'use client';
import * as React from 'react';
import {useToast} from '@/components/ds/toast';
import type {Library,LibraryItem} from '@/lib/library';
import type {FolderOut} from '@/lib/folders';
import type {Folder,WorkItem} from './items';

// The rebuilt screens' data: one /api/library answer (every kind of work and
// the company's folders), and what can be done to it. Each change shows at
// once and is sent to the server; a refusal puts it back and says why.

const DAY=86_400_000;
export function when(at:number,now=Date.now()){
 const d=new Date(at),today=new Date(now);today.setHours(0,0,0,0);
 if(at>=today.getTime())return 'Today';
 if(at>=today.getTime()-DAY)return 'Yesterday';
 return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',...(d.getFullYear()!==today.getFullYear()?{year:'numeric'}:{})});
}
const KIND={visual:'image',film:'film',swap:'swap',story:'storyboard'} as const;
export function toWork(i:LibraryItem):WorkItem{
 const status=i.status==='working'?{kind:'info' as const,label:'In progress'}:i.status==='failed'?{kind:'bad' as const,label:'Didn’t finish'}:i.tool!=='Key visual'?{kind:'quiet' as const,label:i.tool}:undefined;
 return {id:`${i.kind}:${i.id}`,name:i.title,sub:when(i.at),src:i.thumb||undefined,kind:KIND[i.kind],status,width:i.width,height:i.height,
  tool:i.tool,car:i.car||undefined,person:i.mine?'You':'A teammate',at:new Date(i.at).toISOString(),folderId:i.folderId,href:i.href,deleted:i.deleted};
}
export function toFolders(folders:FolderOut[],items:WorkItem[]):Folder[]{
 return folders.map(f=>{
  const mine=items.filter(i=>!i.deleted&&(i.folderId===f.id||folders.find(s=>s.id===i.folderId)?.parentId===f.id));
  return {id:f.id,name:f.name,parentId:f.parentId,count:mine.length,covers:mine.filter(i=>i.src).slice(0,3).map(i=>i.src!)};
 });
}
const split=(workId:string)=>{const at=workId.indexOf(':');return {kind:workId.slice(0,at) as LibraryItem['kind'],id:workId.slice(at+1)}};
const PATH={film:'films',swap:'swaps',story:'storyboards'} as const;
async function send(url:string,method:string,body?:unknown){
 const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?(method==='GET'?undefined:'{}'):JSON.stringify(body),signal:AbortSignal.timeout(60_000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error((d as {error?:string}).error||'That didn’t work. Try again.');
 return d;
}
const words=(n:number)=>n===1?'1 item':`${n.toLocaleString('en-US')} items`;

export function useLibrary(){
 const toast=useToast();
 const [lib,setLib]=React.useState<Library|null>(null),[problem,setProblem]=React.useState('');
 const load=React.useCallback(async()=>{try{setLib(await send('/api/library','GET') as Library);setProblem('')}catch(e){setProblem(e instanceof Error?e.message:'The library could not be loaded.')}},[]);
 React.useEffect(()=>{void load()},[load]);
 const items=React.useMemo(()=>(lib?.items||[]).map(toWork),[lib]);
 const folders=React.useMemo(()=>toFolders(lib?.folders||[],items),[lib,items]);
 const patch=(ids:string[],change:Partial<LibraryItem>)=>setLib(l=>l&&{...l,items:l.items.map(i=>ids.includes(`${i.kind}:${i.id}`)?{...i,...change}:i)});
 const fail=(e:unknown)=>{toast.toast({message:e instanceof Error?e.message:'That didn’t work. Try again.',kind:'bad'});void load()};
 async function setDeleted(ids:string[],deleted:boolean){
  for(const w of ids){const {kind,id}=split(w);
   if(kind==='visual')await send(`/api/visuals/${id}`,deleted?'DELETE':'POST');
   else await send(deleted?`/api/${PATH[kind]}/${id}`:`/api/${PATH[kind]}/${id}/restore`,deleted?'DELETE':'POST');}
 }
 const actions={
  onMove:(ids:string[],folderId:string|null)=>{
   const before=new Map(items.filter(i=>ids.includes(i.id)).map(i=>[i.id,i.folderId??null]));
   patch(ids,{folderId});
   void send('/api/folders/move','POST',{items:ids.map(split),folderId}).then(()=>{
    const name=folderId?lib?.folders.find(f=>f.id===folderId)?.name:'Not in a folder';
    toast.undo(`Moved ${words(ids.length)} to ${name}.`,()=>{
     const groups=new Map<string|null,string[]>();for(const [id,f] of before)groups.set(f,[...(groups.get(f)||[]),id]);
     for(const [f,list] of groups){patch(list,{folderId:f});void send('/api/folders/move','POST',{items:list.map(split),folderId:f}).catch(fail)}
    });
   },fail);
  },
  onDelete:(ids:string[])=>{
   patch(ids,{deleted:true});
   void setDeleted(ids,true).then(()=>toast.undo(`${words(ids.length)} moved to Deleted.`,()=>{patch(ids,{deleted:false});void setDeleted(ids,false).catch(fail)}),fail);
  },
  onRestore:(ids:string[])=>{patch(ids,{deleted:false});void setDeleted(ids,false).then(()=>toast.toast({message:`${words(ids.length)} restored.`,kind:'ok'}),fail)},
  onDownload:(item:WorkItem)=>{if(!item.src)return;const a=document.createElement('a');a.href=item.src+'?download=1';a.download='';a.click()},
 };
 const folderActions={
  onCreate:(name:string,parentId:string|null)=>{void send('/api/folders','POST',{name,parentId}).then(d=>{const f=(d as {folder:FolderOut}).folder;setLib(l=>l&&{...l,folders:[...l.folders,f]});toast.toast({message:`Folder “${f.name}” created.`,kind:'ok'})},fail)},
  onRename:(id:string,name:string)=>{setLib(l=>l&&{...l,folders:l.folders.map(f=>f.id===id?{...f,name}:f)});void send(`/api/folders/${id}`,'PATCH',{name}).catch(fail)},
  onDelete:(id:string)=>{
   const was=lib?.folders||[];setLib(l=>l&&{...l,folders:l.folders.filter(f=>f.id!==id&&f.parentId!==id)});
   void send(`/api/folders/${id}`,'DELETE').then(d=>toast.undo('Folder deleted. Its work is still in the library.',()=>{setLib(l=>l&&{...l,folders:was});void send(`/api/folders/${id}`,'POST',{at:(d as {at:number}).at}).catch(fail)}),fail);
  },
 };
 return {lib,items,folders,problem,reload:load,actions,folderActions,foldersReady:lib?.foldersReady!==false};
}
