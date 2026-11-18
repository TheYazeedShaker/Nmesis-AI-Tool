'use client';
import {useSyncExternalStore} from 'react';
// The references chosen for the next piece of work: one tray for the page and
// the panels (References, Uploads) that add to it. A photo added in the
// References panel shows with a tick there and in the settings panel's
// References; removing it in either place removes it from both. Kept for this
// tab (sessionStorage), so going from Home to Key visual keeps them.
//
// `src` is what the page shows (a provider's hotlinked image, or /api/assets/<id>);
// `assetId` is set once the picture is in the Studio's own storage (an upload,
// or an imported photo), which is what generation reads.
export type TrayItem={
 /** provider:id, e.g. "unsplash:abc123" or "upload:<asset id>". */key:string;
 src:string;thumb?:string;name:string;
 provider:'unsplash'|'pinterest'|'upload'|'brand';
 assetId?:string;
 /** Shown with the picture wherever it appears (the provider's attribution rules). */credit?:{name:string;href:string;source:string;sourceHref:string};
 /** Added by Smart pick rather than by hand. */picked?:boolean;
};
export const TRAY_LIMIT=6;
const STORE='studio-reference-tray';
let items:TrayItem[]|null=null;
const listeners=new Set<()=>void>();
function read():TrayItem[]{
 if(items)return items;
 try{const raw=JSON.parse(sessionStorage.getItem(STORE)||'[]');items=Array.isArray(raw)?raw.filter(valid).slice(0,TRAY_LIMIT):[]}catch{items=[]}
 return items;
}
function valid(v:unknown):v is TrayItem{const i=v as TrayItem;return !!i&&typeof i.key==='string'&&typeof i.src==='string'&&typeof i.name==='string'&&['unsplash','pinterest','upload','brand'].includes(i.provider)&&(i.src.startsWith('https://')||i.src.startsWith('/api/'))}
function write(next:TrayItem[]){
 items=next.slice(0,TRAY_LIMIT);
 try{sessionStorage.setItem(STORE,JSON.stringify(items))}catch{/* private mode: the tray still works for this page */}
 for(const l of listeners)l();
}
const EMPTY:TrayItem[]=[];
export const trayItems=()=>typeof window==='undefined'?EMPTY:read();
export function useReferenceTray(){
 return useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l)},trayItems,()=>EMPTY);
}
/** Adds (or updates, by key) one reference; false when the tray is full. */
export function addReference(item:TrayItem):boolean{
 const now=read(),at=now.findIndex(i=>i.key===item.key);
 if(at>=0){write(now.map((i,n)=>n===at?{...i,...item}:i));return true}
 if(now.length>=TRAY_LIMIT)return false;
 write([...now,item]);return true;
}
export function removeReference(key:string){write(read().filter(i=>i.key!==key))}
export function updateReference(key:string,patch:Partial<TrayItem>){write(read().map(i=>i.key===key?{...i,...patch}:i))}
export function clearPicked(){write(read().filter(i=>!i.picked))}
export const inTray=(key:string)=>read().some(i=>i.key===key);
