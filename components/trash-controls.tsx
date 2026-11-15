'use client';
import {useState} from 'react';
import {ArchiveRestore,Trash2} from 'lucide-react';
import {Dialog} from '@/components/ds/dialog';
import {useToast} from '@/components/ds/toast';
import type {TrashKind} from '@/lib/trash-words';
import {TRASH_WORDS} from '@/lib/trash-words';

// Delete and restore for films, swaps and stories (Phase 2b). Deleting is done
// at once and offered back with Undo (it is reversible: the row keeps its
// media and billing, lib/trash.ts); everything deleted stays in Deleted, where
// Restore brings it back. Buttons, not hover: reachable by touch and keyboard.

type Item={id:string;title:string;busy?:boolean};
type Listed={id:string;title:string;at:number|string|undefined};
async function call(url:string,method:string){
 const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error((d as {error?:string}).error||'That did not work. Try again.');
 return d as Record<string,unknown>;
}
const listOf=(d:Record<string,unknown>):Listed[]=>((d.films||d.swaps||d.boards||[]) as {id:string;title?:string;data?:{title?:string};createdAt?:number;updatedAt?:number}[])
 .map(x=>({id:x.id,title:x.data?.title||x.title||'Untitled',at:x.createdAt??x.updatedAt}));

export function TrashControls({kind,item,onDeleted,onRestored}:{kind:TrashKind;/** The item open now; Delete acts on it. */item:Item|null;onDeleted:(id:string)=>void;onRestored:(id:string)=>void}){
 const words=TRASH_WORDS[kind],{undo,toast}=useToast();
 const [busy,setBusy]=useState(false),[open,setOpen]=useState(false),[deleted,setDeleted]=useState<Listed[]|null>(null),[problem,setProblem]=useState('');
 async function restore(id:string){
  await call(`/api/${words.path}/${id}/restore`,'POST');
  onRestored(id);setDeleted(v=>v?v.filter(x=>x.id!==id):v);
 }
 async function remove(){
  if(!item)return;setBusy(true);
  try{
   await call(`/api/${words.path}/${item.id}`,'DELETE');
   onDeleted(item.id);
   const {id,title}=item;
   undo(`“${title}” moved to Deleted.`,()=>{void restore(id).then(()=>toast({message:`“${title}” is back.`,kind:'ok'}),e=>toast({message:e instanceof Error?e.message:'It could not be restored.',kind:'bad'}))});
  }catch(e){toast({message:e instanceof Error?e.message:`The ${words.one} could not be deleted.`,kind:'bad'})}
  setBusy(false);
 }
 async function show(){
  setOpen(true);setProblem('');setDeleted(null);
  try{setDeleted(listOf(await call(`/api/${words.path}?deleted=1`,'GET')))}catch(e){setProblem(e instanceof Error?e.message:'Deleted items could not be loaded.');setDeleted([])}
 }
 return <div className="trash-controls" data-theme="dark">
  {item&&<button type="button" className="ds-btn sm" disabled={busy||item.busy} title={item.busy?`Wait for this ${words.one} to finish before deleting it.`:undefined} onClick={()=>void remove()}><Trash2 aria-hidden="true"/>{`Delete ${words.one}`}</button>}
  <button type="button" className="ds-btn sm quiet" aria-haspopup="dialog" onClick={()=>void show()}><ArchiveRestore aria-hidden="true"/>Deleted</button>
  <Dialog open={open} onClose={()=>setOpen(false)} title={`Deleted ${words.many}`} variant="drawer" className="trash-drawer">
   <p className="ds-muted">{`Deleted ${words.many} keep everything they had. Restore brings one back to your ${words.many}.`}</p>
   {problem&&<p role="alert" className="trash-problem">{problem}</p>}
   {deleted===null?<p className="ds-muted" role="status">Loading…</p>
    :deleted.length===0?<p className="ds-muted">{`No deleted ${words.many}.`}</p>
    :<ul className="trash-list" aria-label={`Deleted ${words.many}`}>{deleted.map(x=><li key={x.id} className="trash-row">
      <span className="trash-title ds-truncate" title={x.title}>{x.title}</span>
      {x.at!==undefined&&<span className="ds-muted trash-when">{new Date(x.at).toLocaleDateString()}</span>}
      <button type="button" className="ds-btn sm" onClick={()=>void restore(x.id).then(()=>toast({message:`“${x.title}” is back.`,kind:'ok'}),e=>setProblem(e instanceof Error?e.message:'It could not be restored.'))}>Restore<span className="ds-sr-only">{' '+x.title}</span></button>
     </li>)}</ul>}
  </Dialog>
 </div>;
}
