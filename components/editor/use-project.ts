'use client';
import * as React from 'react';
import {useToast} from '@/components/ds/toast';
import {studioFetch} from '@/lib/studio-fetch';
import type {ItemKind} from '@/lib/folders';
import type {ProjectFolder} from './parts';

// Save to project, the same in all five tools: the company's folders (they come
// with one row of the library feed, from the database alone) and a move of one
// piece of work into a folder or out of every folder (/api/folders/move, which
// checks the work belongs to the signed-in company).

type Feed={folders?:{id:string;name:string;parentId:string|null}[];foldersReady?:boolean};

async function send(url:string,init?:RequestInit){
 const r=await studioFetch(url,{...init,signal:AbortSignal.timeout(30_000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error((d as {error?:string}).error||'That didn’t work. Try again.');
 return d;
}

export function useProject(){
 const toast=useToast();
 const [folders,setFolders]=React.useState<ProjectFolder[]>([]);
 const [ready,setReady]=React.useState(false);
 /** Where each piece of work was saved in this visit, by "kind:id". */
 const [placed,setPlaced]=React.useState<Record<string,string|null>>({});
 React.useEffect(()=>{
  let live=true;
  send('/api/library?in=all&limit=1').then(d=>{
   if(!live)return;
   const feed=d as Feed;
   setFolders((feed.folders||[]).map(f=>({id:f.id,name:f.name,parentId:f.parentId})));
   setReady(feed.foldersReady!==false);
  },()=>{if(live)setReady(false)});
  return ()=>{live=false};
 },[]);
 const save=React.useCallback(async(kind:ItemKind,id:string,folderId:string|null)=>{
  try{
   await send('/api/folders/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{kind,id}],folderId})});
   setPlaced(p=>({...p,[`${kind}:${id}`]:folderId}));
   const name=folderId?folders.find(f=>f.id===folderId)?.name:null;
   toast.toast({message:name?`Saved to ${name}.`:'Taken out of its folder.',kind:'ok'});
  }catch(e){toast.toast({message:e instanceof Error?e.message:'That didn’t work. Try again.',kind:'bad'})}
 },[folders,toast]);
 const folderOf=React.useCallback((kind:ItemKind,id:string)=>placed[`${kind}:${id}`]??null,[placed]);
 return {folders,ready,save,folderOf};
}
