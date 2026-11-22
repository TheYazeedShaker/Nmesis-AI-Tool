'use client';
import * as React from 'react';
import {useAccount} from '@/components/studio-account';

// This person's recent fonts and colours, on this device: kept in the browser
// under a key of their own (a short hash of their sign-in, never the address
// itself), newest first, a few of each. A browser that keeps nothing simply
// shows no "Recent" (said once in the console).

const MAX={fonts:8,colours:10};
type Kind=keyof typeof MAX;
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
const keyOf=(kind:Kind,who:string)=>`nmesis.editor.recent-${kind}.${hash(who)}`;
const listeners=new Set<()=>void>();
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

export function useRecent(kind:Kind){
 const account=useAccount(),who=account?.user?.email||'';
 const key=who?keyOf(kind,who):'';
 const [list,setList]=React.useState<string[]>([]);
 React.useEffect(()=>{if(!key)return;const sync=()=>setList(read(key));sync();listeners.add(sync);return()=>{listeners.delete(sync)}},[key]);
 const add=React.useCallback((value:string)=>{if(!key)return;write(key,[value,...read(key).filter(v=>v!==value)].slice(0,MAX[kind]))},[key,kind]);
 return {list,add};
}
