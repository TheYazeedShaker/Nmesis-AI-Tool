'use client';
import * as React from 'react';
import {canvasFontFamily,fallbackFamily,FONT_LOAD_MS,FONT_VARS,firstFamily,fontKey,fontSpec,fontsInDoc,type FontNeed,type FontResult} from '@/lib/editor/fonts';
import type {EditorDoc} from '@/lib/editor/doc';
import type {BrandFont} from '@/lib/brand-kit';

// Brand fonts in the browser (lib/editor/fonts.ts says why and how). A font is
// asked for through the page's FontFaceSet, which downloads the face Next's
// font loader declared (app/brand-fonts.ts) and answers once it is ready; each
// font and weight is asked for once per page. A face that doesn't arrive within
// FONT_LOAD_MS, or doesn't exist, settles as a fallback and is logged.

/** A CSS variable on <html>, as the page resolved it. */
export const resolveVar=(name:string)=>typeof document==='undefined'?'':getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** The family list the canvas draws a font with (its own family, then the Studio's sans serif). */
export const familyFor=(font:unknown)=>canvasFontFamily(font,resolveVar);

const loads=new Map<string,Promise<FontResult>>();
const timeout=(ms:number)=>new Promise<'timeout'>(resolve=>setTimeout(()=>resolve('timeout'),ms));

export function loadCanvasFont(need:FontNeed):Promise<FontResult>{
 const key=fontKey(need),known=loads.get(key);if(known)return known;
 const work=(async():Promise<FontResult>=>{
  const v=FONT_VARS[need.font];if(!v)return {ok:true};// System: the device's own font, nothing to load.
  const family=firstFamily(resolveVar(v));
  if(!family||typeof document==='undefined'||!document.fonts)return {ok:false,reason:'missing'};
  const spec=fontSpec(family,need.weight);
  try{
   const got=await Promise.race([document.fonts.load(spec),timeout(FONT_LOAD_MS)]);
   if(got==='timeout')return {ok:false,reason:'timeout'};
   // An empty answer means no face by that name: nothing was loaded, the canvas would draw a fallback.
   return got.length>0&&got.every(f=>f.status==='loaded')?{ok:true}:{ok:false,reason:'missing'};
  }catch{return {ok:false,reason:'failed'}}
 })().then(r=>{
  // Never silent: the editor shows a notice; the console says which and why (no address).
  if(!r.ok)console.warn('[editor] a brand font fell back',{font:need.font,weight:need.weight,reason:r.reason});
  return r;
 });
 loads.set(key,work);
 return work;
}

export type CanvasFonts={
 /** Every font the design needs is settled (loaded or fallen back) and the canvas shows it. */
 ready:boolean;
 /** Fonts that fell back, each named once. */
 failed:BrandFont[];
 /** The family a text layer draws with now, and a key that changes when it does (the text is measured again). */
 family:(font:BrandFont|string,weight:number)=>{family:string;key:string};
 /** Resolves once ready (the export waits here). */
 whenReady:()=>Promise<void>;
};

/** The fonts of a design, loaded before they are drawn; the canvas redraws its text as each arrives. */
export function useCanvasFonts(doc:Pick<EditorDoc,'layers'>):CanvasFonts{
 const needs=fontsInDoc(doc),wanted=needs.map(fontKey).join(',');
 const [settled,setSettled]=React.useState<Record<string,FontResult>>({});
 React.useEffect(()=>{
  let live=true;
  for(const n of wanted?wanted.split(','):[]){
   const [font,weight]=n.split('|');
   void loadCanvasFont({font:font as BrandFont,weight:Number(weight)}).then(r=>{if(live)setSettled(s=>s[n]===r?s:{...s,[n]:r})});
  }
  return()=>{live=false};
 },[wanted]);
 const ready=needs.every(n=>settled[fontKey(n)]);
 const failed=[...new Set(needs.filter(n=>settled[fontKey(n)]&&!settled[fontKey(n)].ok).map(n=>n.font))];
 // Waiters are let go after the render that shows the settled fonts has been committed.
 const gate=React.useRef<{ready:boolean;waiters:(()=>void)[]}>({ready:false,waiters:[]});
 React.useEffect(()=>{
  gate.current.ready=ready;
  if(ready&&gate.current.waiters.length){const w=gate.current.waiters;gate.current.waiters=[];for(const f of w)f()}
 });
 const whenReady=React.useCallback(()=>gate.current.ready?Promise.resolve():new Promise<void>(resolve=>{gate.current.waiters.push(resolve)}),[]);
 const family=React.useCallback((font:BrandFont|string,weight:number)=>{
  const k=fontKey({font:font as BrandFont,weight}),r=settled[k];
  if(r&&!r.ok)return {family:fallbackFamily(resolveVar),key:k+':fallback'};
  return {family:familyFor(font),key:k+(r?':loaded':':loading')};
 },[settled]);
 return {ready,failed,family,whenReady};
}
