// Undo and redo for the canvas editor: one history of immer patches.
//
// Every change is a recipe (lib/editor/doc.ts `edit`) run with
// produceWithPatches; a step keeps only the patches it made and their inverse,
// never a copy of the design, so a long history of small changes stays small.
//
// One gesture is one step. A change made with a `gesture` key joins the step
// before it while that gesture is still open (the same key, nothing else in
// between): a drag (and its Alt copy), a resize, a rotation, a slider moved
// from one end to the other, a typing session in one text. `end` closes the
// gesture: the next change, even with the same kind of key, is a new step.
// Undo and redo close it too.
import {applyPatches,enablePatches,produceWithPatches,type Draft,type Patch} from 'immer';

enablePatches();
/** What immer can draft: the design is a plain object. */
type Doc=Parameters<typeof applyPatches>[0];

export type Step={patches:Patch[];inverse:Patch[];gesture?:string};
export type History<T>={present:T;past:Step[];future:Step[];
 /** The gesture still taking changes into the last step. */open?:string;
 /** Goes up by one on every change, undo and redo: what autosave compares. */rev:number};
export const HISTORY_MAX=100;

export const startHistory=<T,>(present:T):History<T>=>({present,past:[],future:[],rev:0});

/** One change. Nothing changed → the same history (not a step). With `gesture`, joins the open step of that gesture. */
export function apply<T>(h:History<T>,recipe:(d:Draft<T>)=>void,gesture?:string):History<T>{
 const [present,patches,inverse]=produceWithPatches(h.present,recipe);
 if(!patches.length)return h;
 const last=h.past[h.past.length-1];
 if(gesture&&h.open===gesture&&last){
  const merged:Step={patches:[...last.patches,...patches],inverse:[...inverse,...last.inverse],gesture};
  return {present,past:[...h.past.slice(0,-1),merged],future:[],open:gesture,rev:h.rev+1};
 }
 const past=[...h.past,{patches,inverse,...(gesture?{gesture}:{})}].slice(-HISTORY_MAX);
 return {present,past,future:[],open:gesture,rev:h.rev+1};
}
/** The open gesture is finished: what comes next is a new step. */
export const end=<T,>(h:History<T>):History<T>=>h.open===undefined?h:{...h,open:undefined};
export function undo<T extends Doc>(h:History<T>):History<T>{
 const last=h.past[h.past.length-1];if(!last)return h;
 return {present:applyPatches(h.present,last.inverse),past:h.past.slice(0,-1),future:[last,...h.future],rev:h.rev+1};
}
export function redo<T extends Doc>(h:History<T>):History<T>{
 const next=h.future[0];if(!next)return h;
 return {present:applyPatches(h.present,next.patches),past:[...h.past,next],future:h.future.slice(1),rev:h.rev+1};
}
export const canUndo=(h:History<unknown>)=>h.past.length>0;
export const canRedo=(h:History<unknown>)=>h.future.length>0;
