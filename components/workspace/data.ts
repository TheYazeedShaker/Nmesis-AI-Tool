'use client';
import * as React from 'react';
import {useToast} from '@/components/ds/toast';
import type {LibraryPage,PageFolder,PageItem} from '@/lib/library-page';
import type {FolderOut} from '@/lib/folders';
import type {Folder,WorkItem} from './items';
import {EMPTY_QUERY,type Counts,type LibraryQuery,type Place} from './library';

// The rebuilt screens' data (Phase 3 group 2): /api/library a page at a time
// (about 40), from the database alone, and what can be done to it. Each change
// shows at once and is sent to the server; a refusal reloads and says why.

const DAY=86_400_000;
export function when(at:number,now=Date.now()){
 const d=new Date(at),today=new Date(now);today.setHours(0,0,0,0);
 if(at>=today.getTime())return 'Today';
 if(at>=today.getTime()-DAY)return 'Yesterday';
 return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',...(d.getFullYear()!==today.getFullYear()?{year:'numeric'}:{})});
}
const KIND={visual:'image',film:'film',swap:'swap',story:'storyboard'} as const;
export function toWork(i:PageItem):WorkItem{
 const status=i.status==='working'?{kind:'info' as const,label:'In progress'}:i.status==='failed'?{kind:'bad' as const,label:'Didn’t finish'}:i.tool!=='Key visual'?{kind:'quiet' as const,label:i.tool}:undefined;
 return {id:`${i.kind}:${i.id}`,name:i.title,sub:when(i.at),src:i.thumb||undefined,full:i.full||undefined,kind:KIND[i.kind],status,width:i.width??undefined,height:i.height??undefined,
  tool:i.tool as WorkItem['tool'],car:i.car||undefined,person:i.mine?'You':'A teammate',at:new Date(i.at).toISOString(),folderId:i.folderId,href:i.href,deleted:i.deleted};
}
const toFolder=(f:PageFolder):Folder=>({id:f.id,name:f.name,parentId:f.parentId,count:f.count,covers:f.covers});
const split=(workId:string)=>{const at=workId.indexOf(':');return {kind:workId.slice(0,at) as PageItem['kind'],id:workId.slice(at+1)}};
const PATH={film:'films',swap:'swaps',story:'storyboards'} as const;
async function send(url:string,method:string,body?:unknown){
 const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?(method==='GET'?undefined:'{}'):JSON.stringify(body),signal:AbortSignal.timeout(60_000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error((d as {error?:string}).error||'That didn’t work. Try again.');
 return d;
}
const words=(n:number)=>n===1?'1 item':`${n.toLocaleString('en-US')} items`;
const url=(q:LibraryQuery,offset:number,limit:number)=>{const p=new URLSearchParams({in:q.place,offset:String(offset),limit:String(limit),sort:q.sort});if(q.tool)p.set('tool',q.tool);if(q.car)p.set('car',q.car);if(q.who)p.set('who',q.who);if(q.q)p.set('q',q.q);return '/api/library?'+p};

export function useLibraryPage(place:Place,{limit=40}:{limit?:number}={}){
 const toast=useToast();
 const [query,setQuery]=React.useState<LibraryQuery>({...EMPTY_QUERY,place});
 const [items,setItems]=React.useState<WorkItem[]>([]),[total,setTotal]=React.useState(0),[next,setNext]=React.useState<number|null>(null);
 const [meta,setMeta]=React.useState<{counts:Counts;folders:Folder[];cars:string[];foldersReady:boolean}|null>(null);
 const [loading,setLoading]=React.useState(true),[problem,setProblem]=React.useState('');
 // The place follows the address (a folder clicked, Back, Forward): a new place asks the server again, without a reload.
 const [placeAsked,setPlaceAsked]=React.useState(place);
 if(placeAsked!==place){setPlaceAsked(place);setLoading(true);setQuery(q=>({...q,place}))}
 const asked=React.useRef(0);
 // Applies an answer (only the latest one asked for).
 const apply=React.useCallback((ticket:number,offset:number,page:LibraryPage)=>{
  if(ticket!==asked.current)return;
  const got=page.items.map(toWork);
  setItems(v=>offset===0?got:[...v,...got.filter(g=>!v.some(x=>x.id===g.id))]);
  setTotal(page.total);setNext(page.next);setMeta({counts:page.counts,folders:page.folders.map(toFolder),cars:page.cars,foldersReady:page.foldersReady});setProblem('');setLoading(false);
 },[]);
 const refuse=React.useCallback((ticket:number,e:unknown)=>{if(ticket!==asked.current)return;setProblem(e instanceof Error?e.message:'The library could not be loaded.');setLoading(false)},[]);
 const load=React.useCallback((q:LibraryQuery,offset:number)=>{const ticket=++asked.current;return send(url(q,offset,limit),'GET').then(page=>apply(ticket,offset,page as LibraryPage),e=>refuse(ticket,e))},[limit,apply,refuse]);
 React.useEffect(()=>{const ticket=++asked.current;send(url(query,0,limit),'GET').then(page=>apply(ticket,0,page as LibraryPage),e=>refuse(ticket,e))},[query,limit,apply,refuse]);
 // Loading is set where the asking starts (an event), not in the effect.
 const onQuery=React.useCallback((p:Partial<LibraryQuery>)=>{setLoading(true);setQuery(q=>({...q,...p}))},[]);
 const onMore=React.useCallback(()=>{if(next!==null&&!loading){setLoading(true);void load(query,next)}},[next,loading,load,query]);
 const reload=React.useCallback(()=>{setLoading(true);return load(query,0)},[load,query]);
 const patch=(ids:string[],change:Partial<WorkItem>)=>setItems(v=>v.map(i=>ids.includes(i.id)?{...i,...change}:i));
 const drop=(ids:string[])=>{setItems(v=>v.filter(i=>!ids.includes(i.id)));setTotal(t=>Math.max(0,t-ids.length))};
 const fail=(e:unknown)=>{toast.toast({message:e instanceof Error?e.message:'That didn’t work. Try again.',kind:'bad'});void reload()};
 async function setDeleted(ids:string[],deleted:boolean){
  for(const w of ids){const {kind,id}=split(w);
   if(kind==='visual')await send(`/api/visuals/${id}`,deleted?'DELETE':'POST');
   else await send(deleted?`/api/${PATH[kind]}/${id}`:`/api/${PATH[kind]}/${id}/restore`,deleted?'DELETE':'POST');}
 }
 const inThisPlace=(folderId:string|null)=>query.place==='all'||(query.place==='unsorted'?!folderId:query.place===folderId);
 const actions={
  onMove:(ids:string[],folderId:string|null)=>{
   const before=new Map(items.filter(i=>ids.includes(i.id)).map(i=>[i.id,i.folderId??null]));
   if(inThisPlace(folderId))patch(ids,{folderId});else drop(ids);
   void send('/api/folders/move','POST',{items:ids.map(split),folderId}).then(()=>{
    const name=folderId?meta?.folders.find(f=>f.id===folderId)?.name:'Not in a folder';
    toast.undo(`Moved ${words(ids.length)} to ${name}.`,()=>{
     const groups=new Map<string|null,string[]>();for(const [id,f] of before)groups.set(f,[...(groups.get(f)||[]),id]);
     void Promise.all([...groups].map(([f,list])=>send('/api/folders/move','POST',{items:list.map(split),folderId:f}))).then(reload,fail);
    });
    void reload();
   },fail);
  },
  onDelete:(ids:string[])=>{
   drop(ids);
   void setDeleted(ids,true).then(()=>{toast.undo(`${words(ids.length)} moved to Deleted.`,()=>{void setDeleted(ids,false).then(reload,fail)});void reload()},fail);
  },
  onRestore:(ids:string[])=>{drop(ids);void setDeleted(ids,false).then(()=>{toast.toast({message:`${words(ids.length)} restored.`,kind:'ok'});void reload()},fail)},
  onDownload:(item:WorkItem)=>{if(!item.full)return;const a=document.createElement('a');a.href=item.full+'?download=1';a.download='';a.click()},
 };
 const folderActions={
  onCreate:(name:string,parentId:string|null)=>{void send('/api/folders','POST',{name,parentId}).then(d=>{const f=(d as {folder:FolderOut}).folder;toast.toast({message:`Folder “${f.name}” created.`,kind:'ok'});void reload()},fail)},
  onRename:(id:string,name:string)=>{setMeta(m=>m&&{...m,folders:m.folders.map(f=>f.id===id?{...f,name}:f)});void send(`/api/folders/${id}`,'PATCH',{name}).catch(fail)},
  onDelete:(id:string)=>{
   setMeta(m=>m&&{...m,folders:m.folders.filter(f=>f.id!==id&&f.parentId!==id)});
   void send(`/api/folders/${id}`,'DELETE').then(d=>{toast.undo('Folder deleted. Its work is still in the library.',()=>{void send(`/api/folders/${id}`,'POST',{at:(d as {at:number}).at}).then(reload,fail)});void reload()},fail);
  },
 };
 return {query,onQuery,items,total,hasMore:next!==null,onMore,loading,problem,reload,
  counts:meta?.counts||{all:0,unsorted:0,deleted:0},folders:meta?.folders||[],cars:meta?.cars||[],foldersReady:meta?.foldersReady!==false,ready:meta!==null,actions,folderActions};
}
