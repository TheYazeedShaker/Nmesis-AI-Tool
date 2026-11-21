'use client';
import * as React from 'react';
import {studioFetch} from '@/lib/studio-fetch';

// The soft lock (owner, 2026-11-21: one person edits; others see a note). On
// opening, the editor says it is here (POST /api/edits/<picture>/presence) and
// learns who else has the design open. If someone else is editing it, it opens
// read only with "Being edited by <name>" and "Edit anyway". It says so again
// every 20 s and leaves when the page closes. Nothing is locked on the server:
// "Edit anyway" always works. Before migration 0012 the Studio answers
// ready: false and the editor simply opens for editing.
export type Presence={name:string;editing:boolean};
const BEAT_MS=20_000,ASK_MS=8_000;

async function say(pictureId:string,editing:boolean):Promise<Presence[]|null>{
 try{
  const r=await studioFetch(`/api/edits/${pictureId}/presence`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({editing}),signal:AbortSignal.timeout(ASK_MS)});
  if(!r.ok){console.warn('[editor] presence not updated',{status:r.status});return null}
  const d=await r.json().catch(()=>({})) as {others?:Presence[]};
  return Array.isArray(d.others)?d.others.filter(o=>o&&typeof o.name==='string'):[];
 }catch(e){console.warn('[editor] presence not updated',{reason:e instanceof Error?e.name:'unknown'});return null}
}

/** Who else is here, and whether this person is editing. `checked` is false until the first answer (or its failure). */
export function usePresence(pictureId:string,enabled:boolean){
 const [state,setState]=React.useState<{checked:boolean;others:Presence[];editing:boolean;forced:boolean}>({checked:!enabled,others:[],editing:false,forced:false});
 const editing=React.useRef(false);
 React.useEffect(()=>{
  if(!enabled)return;let live=true;
  // First: here, not editing yet. If nobody else is editing, start editing at once.
  void say(pictureId,false).then(async others=>{
   if(!live)return;
   const busy=(others||[]).some(o=>o.editing);
   editing.current=!busy;
   setState({checked:true,others:others||[],editing:!busy,forced:false});
   if(!busy){const now=await say(pictureId,true);if(live&&now)setState(s=>({...s,others:now}))}
  });
  const beat=window.setInterval(()=>{void say(pictureId,editing.current).then(o=>{if(live&&o)setState(s=>({...s,others:o}))})},BEAT_MS);
  const leave=()=>{void studioFetch(`/api/edits/${pictureId}/presence`,{method:'DELETE',keepalive:true}).catch(e=>console.warn('[editor] presence not cleared',{reason:e instanceof Error?e.name:'unknown'}))};
  window.addEventListener('pagehide',leave);
  return()=>{live=false;window.clearInterval(beat);window.removeEventListener('pagehide',leave);leave()};
 },[pictureId,enabled]);
 return {
  ...state,
  /** "Edit anyway": this person edits too (the others keep their own copy until they save). */
  editAnyway:()=>{editing.current=true;setState(s=>({...s,editing:true,forced:true}));void say(pictureId,true)},
 };
}

/** "Being edited by Sam", "… by Sam and Alex", "… by Sam and 2 others". */
export function editedBy(others:Presence[]){
 const names=[...new Set(others.filter(o=>o.editing).map(o=>o.name.trim()||'A teammate'))];
 if(!names.length)return '';
 return 'Being edited by '+(names.length===1?names[0]:names.length===2?`${names[0]} and ${names[1]}`:`${names[0]} and ${names.length-1} others`);
}
