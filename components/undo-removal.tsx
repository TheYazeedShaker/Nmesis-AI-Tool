'use client';
import {useToast,TOAST_MS} from '@/components/ds/toast';
// Removing a saved provider key, with Undo (Phase 2b). Nothing is sent at once:
// the toast offers Undo, and the key is removed when the toast closes without
// it (time out, Dismiss), or, at the latest, when the page is left (pagehide,
// keepalive), so Undo never has to put a secret back. Close the key's dialog
// first: a modal dialog leaves the toast outside its reach.
const pending=new Set<()=>void>();
let listening=false;
function flushOnLeave(){
 if(listening||typeof window==='undefined')return;listening=true;
 window.addEventListener('pagehide',()=>{for(const flush of [...pending])flush()});
}
export function useUndoableRemoval(){
 const {toast}=useToast();
 return function remove({message,url,removed,kept}:{message:string;url:string;/** After the server removed it. */removed:()=>void|Promise<void>;kept?:()=>void}){
  flushOnLeave();
  let settled=false;
  const commit=(keepalive=false)=>{
   if(settled)return;settled=true;pending.delete(flush);window.clearTimeout(latest);
   void fetch(url,{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},keepalive,signal:keepalive?undefined:AbortSignal.timeout(30_000)})
    .then(async r=>{if(r.ok){await removed();return}const d=await r.json().catch(()=>({}));toast({message:(d as {error?:string}).error||'The key could not be removed. Try again.',kind:'bad'})})
    .catch(()=>toast({message:'The connection was interrupted, so the key may still be saved. Try again.',kind:'bad'}));
  };
  const flush=()=>commit(true);
  // If the toast is held open (pointer or focus on it) the key waits; never longer than this.
  const latest=window.setTimeout(()=>commit(),TOAST_MS*10);
  pending.add(flush);
  toast({message,kind:'info',action:{label:'Undo',run:()=>{if(settled)return;settled=true;pending.delete(flush);window.clearTimeout(latest);kept?.();toast({message:'Kept. Nothing was removed.',kind:'ok'})}},onExpire:()=>commit()});
 };
}
