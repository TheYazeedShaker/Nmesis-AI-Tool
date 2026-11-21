'use client';
import * as React from 'react';
import {Autosave,deviceKeep,fitsKeepalive,SendError,whichCopy,type HeldDraft,type SaveStatus} from '@/lib/editor/autosave';
import {studioFetch} from '@/lib/studio-fetch';
import type {EditorDoc} from '@/lib/editor/doc';

// Autosave in the editor (lib/editor/autosave.ts): the working draft of the
// picture being edited, PUT /api/edits/<picture>/draft about two seconds after
// the last change, a copy on this device until the Studio holds it, sent again
// when the connection comes back. `enabled` is false for a viewer and while the
// design opens read only (someone else is editing it).
//
// Leaving: when the tab is hidden (on a phone it may be closed from there with
// no other event) or the page goes (closed, reloaded, another site), the latest
// change is sent at once, with keepalive so it outlives the page, when the body
// fits the browser's limit for that. A larger one is sent as usual: it arrives if
// the page stays (a hidden tab), and is kept on this device either way, so the
// next opening here restores it. Leaving within the Studio (another page, another
// design) unmounts the editor, which sends what is left as usual: the page lives on.
const SEND_MS=15_000;

/** The draft's body: the design, its change count and the session that made it (the next opening compares them). */
const draftBody=(doc:EditorDoc,rev:number,session:string)=>JSON.stringify({doc,rev,session});

async function sendDraft(pictureId:string,body:string,leaving:boolean){
 let r:Response;
 try{r=await studioFetch(`/api/edits/${pictureId}/draft`,{method:'PUT',headers:{'content-type':'application/json'},body,keepalive:leaving&&fitsKeepalive(body),signal:AbortSignal.timeout(SEND_MS)})}
 // Never reached the Studio: no connection, or no answer in time. The change stays on this device.
 catch(e){throw new SendError(e instanceof Error&&e.name==='TimeoutError'?'The Studio didn’t answer in time.':'No connection.',true)}
 if(!r.ok){const d=await r.json().catch(()=>({})) as {error?:string};throw new SendError(d.error||'Your changes couldn’t be saved.',false)}
}

/** `unsent`: the design opened from this device's copy, which the Studio doesn't have yet: it is sent at once. */
export function useAutosave(pictureId:string,{enabled,doc,rev,unsent=false}:{enabled:boolean;doc:EditorDoc;rev:number;unsent?:boolean}){
 const [status,setStatus]=React.useState<{status:SaveStatus;detail?:string}>({status:'saved'});
 const saver=React.useRef<{s:Autosave<EditorDoc>;session:string}|null>(null);
 // A new controller for each picture (a copy made in place has its own draft); the first rev is the one it opened with.
 const startRev=React.useRef(unsent?rev-1:rev);
 React.useEffect(()=>{
  if(!enabled)return;
  // This editing session: with the change count, it tells the next opening which copy of the design is newer.
  const session=crypto.randomUUID();
  const s=new Autosave<EditorDoc>({
   send:(d,r,leaving)=>sendDraft(pictureId,draftBody(d,r,session),leaving),keep:deviceKeep<EditorDoc>(pictureId),online:()=>navigator.onLine,
   setTimer:(fn,ms)=>window.setTimeout(fn,ms),clearTimer:t=>window.clearTimeout(t as number),session,
   onStatus:(st,detail)=>{setStatus({status:st,detail});if(st==='error')console.warn('[editor] autosave failed',{detail})},
  },startRev.current);
  saver.current={s,session};
  const online=()=>s.reconnect();
  const offline=()=>{if(s.pending)setStatus({status:'offline'})};
  const hidden=()=>{if(document.visibilityState==='hidden')s.leave()};
  const leave=()=>s.leave();
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
  return()=>{
   window.removeEventListener('online',online);window.removeEventListener('offline',offline);
   document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);
   if(s.pending)void s.flush();s.stop();saver.current=null;
  };
 },[pictureId,enabled]);
 // Every change the history makes (undo and redo too) goes to the draft.
 React.useEffect(()=>{if(enabled&&rev!==startRev.current)saver.current?.s.change(doc,rev)},[doc,rev,enabled]);
 return {
  ...status,
  retry:()=>void saver.current?.s.retry(),
  /** Everything sent (before a duplicate, a restore, leaving): resolves once the Studio holds it or it failed. */
  flush:async()=>{await saver.current?.s.flush()},
  pending:()=>!!saver.current?.s.pending,
  /** A change that leaving now would not take to the Studio (offline, refused, or too large to go with the page):
   *  the page asks before it closes. It is kept on this device either way. */
  atRisk:()=>{
   const c=saver.current,w=c?.s.waiting();
   return !!c&&!!w&&(c.s.status!=='saving'||!navigator.onLine||!fitsKeepalive(draftBody(w.doc,w.rev,c.session)));
  },
 };
}

/** This device's unsent copy of a picture's design, when it is newer than the draft the Studio has (null: open the
 *  Studio's). A copy the Studio already holds (the same session, sent as the page closed) is cleared. */
export function deviceCopy(pictureId:string,server:HeldDraft|null):EditorDoc|null{
 const keep=deviceKeep<EditorDoc>(pictureId),kept=keep.read(),which=whichCopy(kept,server);
 if(which==='held')keep.clear();
 return which==='device'&&kept?kept.doc:null;
}
