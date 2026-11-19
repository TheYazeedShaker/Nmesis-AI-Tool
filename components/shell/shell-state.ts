'use client';
import {useSyncExternalStore} from 'react';
import type {ToolId} from '@/lib/tools';
import type {NavPanel} from '@/lib/shell-nav';
import {addReference,referenceLimit,trayItems,type TrayItem} from '@/lib/reference-tray';
import type {CanvasAdd} from '@/lib/editor/doc';
// What the shell shares with the page inside it: which secondary panel is open
// (References, Brand, Elements or Uploads, lib/shell-nav.ts), the tool whose
// view is on screen (Key visual, Car lineup; null outside tools) and the
// address it was opened on. One small store, so a page and the navigation never
// pass props through each other. The frame (components/workspace/frame.tsx)
// reports every page it shows; a new address closes the panel.
export type ShellPanel=NavPanel;
/** The open editor's way in: a panel hands it what to add (components/canvas/*). */
export type CanvasSink=(add:CanvasAdd)=>void;
type State={panel:ShellPanel|null;tool:ToolId|null;path:string|null;canvas:CanvasSink|null};
let state:State={panel:null,tool:null,path:null,canvas:null};
const listeners=new Set<()=>void>();
const set=(next:Partial<State>)=>{state={...state,...next};for(const l of listeners)l()};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l)}};
const SERVER:State={panel:null,tool:null,path:null,canvas:null};
export function useShell(){return useSyncExternalStore(subscribe,()=>state,()=>SERVER)}
export const shellState=()=>state;
export const openPanel=(panel:ShellPanel)=>set({panel});
export const closePanel=()=>{if(state.panel)set({panel:null})};
export const togglePanel=(panel:ShellPanel)=>set({panel:state.panel===panel?null:panel});
/** The frame reports the page on screen: navigating to another address closes the secondary panel. */
export function navigated(path:string,tool:ToolId|null){
 if(path===state.path&&tool===state.tool)return;
 set({path,tool,panel:state.path===null||path===state.path?state.panel:null});
}

/** The editor registers itself while it is open (null when it closes). */
export const setCanvasSink=(canvas:CanvasSink|null)=>{if(canvas!==state.canvas)set({canvas})};
/** The one "add to the design" action for every panel inside the editor: false when no editor is open. */
export function addToCanvas(add:CanvasAdd):boolean{if(!state.canvas)return false;state.canvas(add);return true}

/** The one "use as a reference" action, for every panel (References, Uploads, Brand) and every tool.
 *  A tool that takes one reference (Car lineup) swaps it; the others add up to their limit.
 *  Answers what happened, so the caller can say it. */
export function addAsReference(item:TrayItem):'added'|'replaced'|'full'{
 const limit=referenceLimit(state.tool),now=trayItems();
 if(limit===1){const swapped=now.some(i=>i.key!==item.key);addReference(item,{replace:true});return swapped?'replaced':'added'}
 return addReference(item,{limit})?'added':'full';
}
