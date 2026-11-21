'use client';
import * as React from 'react';
import {Autosave,deviceKeep,SendError,type SaveStatus} from '@/lib/editor/autosave';
import {studioFetch} from '@/lib/studio-fetch';
import type {EditorDoc} from '@/lib/editor/doc';

// Autosave in the editor (lib/editor/autosave.ts): the working draft of the
// picture being edited, PUT /api/edits/<picture>/draft about two seconds after
// the last change, a copy on this device until the Studio holds it, sent again
// when the connection comes back. `enabled` is false for a viewer and while the
// design opens read only (someone else is editing it).
const SEND_MS=15_000;

async function sendDraft(pictureId:string,doc:EditorDoc,rev:number,keepalive=false){
 let r:Response;
 try{r=await studioFetch(`/api/edits/${pictureId}/draft`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({doc,rev}),keepalive,signal:AbortSignal.timeout(SEND_MS)})}
 // Never reached the Studio: no connection, or no answer in time. The change stays on this device.
 catch(e){throw new SendError(e instanceof Error&&e.name==='TimeoutError'?'The Studio didn’t answer in time.':'No connection.',true)}
 if(!r.ok){const d=await r.json().catch(()=>({})) as {error?:string};throw new SendError(d.error||'Your changes couldn’t be saved.',false)}
}

/** `unsent`: the design opened from this device's copy, which the Studio doesn't have yet: it is sent at once. */
export function useAutosave(pictureId:string,{enabled,doc,rev,unsent=false}:{enabled:boolean;doc:EditorDoc;rev:number;unsent?:boolean}){
 const [status,setStatus]=React.useState<{status:SaveStatus;detail?:string}>({status:'saved'});
 const saver=React.useRef<Autosave<EditorDoc>|null>(null);
 // A new controller for each picture (a copy made in place has its own draft); the first rev is the one it opened with.
 const startRev=React.useRef(unsent?rev-1:rev);
 React.useEffect(()=>{
  if(!enabled)return;
  const s=new Autosave<EditorDoc>({
   send:(d,r)=>sendDraft(pictureId,d,r),keep:deviceKeep<EditorDoc>(pictureId),online:()=>navigator.onLine,
   setTimer:(fn,ms)=>window.setTimeout(fn,ms),clearTimer:t=>window.clearTimeout(t as number),
   onStatus:(st,detail)=>{setStatus({status:st,detail});if(st==='error')console.warn('[editor] autosave failed',{detail})},
  },startRev.current);
  saver.current=s;
  const online=()=>s.reconnect();
  const offline=()=>{if(s.pending)setStatus({status:'offline'})};
  // Leaving: the last change goes with the page (keepalive); it is on this device either way.
  const leave=()=>{if(s.pending)void s.flush()};
  window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('pagehide',leave);
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',leave);if(s.pending)void s.flush();s.stop();saver.current=null};
 },[pictureId,enabled]);
 // Every change the history makes (undo and redo too) goes to the draft.
 React.useEffect(()=>{if(enabled&&rev!==startRev.current)saver.current?.change(doc,rev)},[doc,rev,enabled]);
 return {
  ...status,
  retry:()=>void saver.current?.retry(),
  /** Everything sent (before a duplicate, a restore, leaving): resolves once the Studio holds it or it failed. */
  flush:async()=>{await saver.current?.flush()},
  pending:()=>!!saver.current?.pending,
 };
}

/** This device's unsent copy of a picture's design, when it is newer than the draft the Studio has. */
export function deviceCopy(pictureId:string,serverAt:number|null):EditorDoc|null{
 const kept=deviceKeep<EditorDoc>(pictureId).read();
 return kept&&(!serverAt||kept.at>serverAt)?kept.doc:null;
}
