'use client';
import * as React from 'react';
import {useAccount} from '@/components/studio-account';
import {mergeLists,RECENT_MAX,withValue,type Recent,type RecentKind} from '@/lib/editor/recent';

// This person's recent fonts and colours, kept with their account
// (/api/account/recent, lib/editor/recent.ts) so every browser they use shows
// the same "Recent", and on this device too (in the browser, under a key of
// their own: a short hash of their sign-in, never the address itself). The
// account's list is asked for each time a list opens; until it answers, or
// when it can't be reached, the device's copy is shown, and what was picked
// here meanwhile is sent when it can be. A browser that keeps nothing simply
// has no device copy (said once in the console).

type Kind=RecentKind;
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
const keyOf=(kind:Kind,who:string)=>`nmesis.editor.recent-${kind}.${hash(who)}`;
const listeners=new Set<()=>void>();
const SYNC_MS=8000;
let warned=false;
function read(key:string):string[]{
 try{const v=JSON.parse(window.localStorage.getItem(key)||'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[]}
 catch(e){if(!warned){warned=true;console.warn('[editor] this browser keeps no recent fonts or colours',{reason:e instanceof Error?e.name:'unknown'})}return []}
}
function write(key:string,list:string[]){
 try{window.localStorage.setItem(key,JSON.stringify(list))}
 catch(e){if(!warned){warned=true;console.warn('[editor] this browser keeps no recent fonts or colours',{reason:e instanceof Error?e.name:'unknown'})}}
 for(const l of listeners)l();
}
/** The account's lists, or null when they can't be reached (the device's copy is used). */
async function fetchAccount():Promise<Recent|null>{
 try{
  const r=await fetch('/api/account/recent',{cache:'no-store',signal:AbortSignal.timeout(SYNC_MS)});
  if(!r.ok)return null;
  return ((await r.json()) as {recent?:Recent}).recent??null;
 }catch{return null}
}
/** Adds a value to the account's list; false when it couldn't be sent (kept on this device). */
async function sendAccount(kind:Kind,value:string):Promise<boolean>{
 try{
  const r=await fetch('/api/account/recent',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,value}),signal:AbortSignal.timeout(SYNC_MS)});
  return r.ok;
 }catch{return false}
}

export function useRecent(kind:Kind){
 const account=useAccount(),who=account?.user?.email||'';
 const key=who?keyOf(kind,who):'';
 const [list,setList]=React.useState<string[]>([]);
 React.useEffect(()=>{
  if(!key)return;let live=true;
  const sync=()=>setList(read(key));sync();listeners.add(sync);
  // The account's list: the device's copy follows it, keeping what only this device has (picked while offline), which is sent now.
  void fetchAccount().then(async remote=>{
   if(!live||!remote)return;
   const device=read(key),onlyHere=device.filter(v=>!remote[kind].includes(v));
   write(key,mergeLists(remote[kind],device,kind));
   for(const v of [...onlyHere].reverse())await sendAccount(kind,v);
  });
  return()=>{live=false;listeners.delete(sync)};
 },[key,kind]);
 const add=React.useCallback((value:string)=>{
  if(!key)return;
  write(key,withValue(read(key),value,kind).slice(0,RECENT_MAX[kind]));
  void sendAccount(kind,value).then(ok=>{if(!ok)console.info('[editor] a recent '+(kind==='fonts'?'font':'colour')+' is kept on this device until your account can be reached')});
 },[key,kind]);
 return {list,add};
}
