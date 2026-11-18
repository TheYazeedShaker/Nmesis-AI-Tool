'use client';
import {useSyncExternalStore} from 'react';
// What the shell shares with the page inside it: which side panel is open
// (References or Uploads, opened from the left navigation or from a page's
// "Add" button), and the car the page is working on, which prefills the
// References search. One small store, so a page and the navigation never pass
// props through each other.
export type ShellPanel='references'|'uploads';
type State={panel:ShellPanel|null;car:string};
let state:State={panel:null,car:''};
const listeners=new Set<()=>void>();
const set=(next:Partial<State>)=>{state={...state,...next};for(const l of listeners)l()};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l)}};
const SERVER:State={panel:null,car:''};
export function useShell(){return useSyncExternalStore(subscribe,()=>state,()=>SERVER)}
export const openPanel=(panel:ShellPanel)=>set({panel});
export const closePanel=()=>set({panel:null});
export const togglePanel=(panel:ShellPanel)=>set({panel:state.panel===panel?null:panel});
/** The page's chosen car, for the References search (never the placeholder). */
export const setShellCar=(car:string)=>{if(car!==state.car)set({car})};
