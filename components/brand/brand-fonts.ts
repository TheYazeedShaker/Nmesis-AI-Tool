'use client';
import * as React from 'react';
import {setBrandFonts} from '@/lib/editor/fonts';
import {studioFetch} from '@/lib/studio-fetch';
import {LICENCE_VERSION,type BrandFontFile,type BrandFontsState} from '@/lib/brand-fonts/shared';

// The company's own fonts in the browser: listed once per page from
// /api/brand-fonts and shared by Brand → Fonts, the editor's font list and the
// canvas (lib/editor/fonts.ts setBrandFonts registers them for drawing). An
// upload or a removal lists them again, so every view follows.

let state:BrandFontsState|null=null,error='',pending:Promise<BrandFontsState|null>|undefined;
const listeners=new Set<()=>void>();
const publish=()=>{for(const l of listeners)l()};
const LIST_MS=15_000;

/** Lists the company's fonts (once per page, or again with `fresh`). Never rejects: a list that can't load is said. */
export function loadBrandFonts(fresh=false):Promise<BrandFontsState|null>{
 if(!fresh&&pending)return pending;
 pending=(async()=>{
  try{
   const r=await fetch('/api/brand-fonts',{cache:'no-store',signal:AbortSignal.timeout(LIST_MS)});
   const body=await r.json().catch(()=>({})) as BrandFontsState&{error?:string};
   if(!r.ok)throw new Error(body.error||'Your brand fonts couldn’t load.');
   state=body;error='';
   setBrandFonts(body.fonts);
  }catch(e){
   error=e instanceof Error&&e.name!=='TimeoutError'?e.message:'Your brand fonts couldn’t load. Check your connection and try again.';
   console.warn('[brand-fonts] the list could not load',{reason:e instanceof Error?e.name:'unknown'});
   // Listed as none: a design's uploaded font then says "Missing font", never draws as another without saying so.
   if(!state)setBrandFonts([]);
  }
  publish();return state;
 })();
 return pending;
}

export function useBrandFonts():{state:BrandFontsState|null;error:string;reload:()=>Promise<BrandFontsState|null>}{
 const [,tick]=React.useReducer((n:number)=>n+1,0);
 React.useEffect(()=>{listeners.add(tick);void loadBrandFonts();return()=>{listeners.delete(tick)}},[]);
 return {state,error,reload:()=>loadBrandFonts(true)};
}

export type UploadResult={name:string;ok:true;font:BrandFontFile}|{name:string;ok:false;error:string;font?:BrandFontFile};
/** Uploads one font file with the licence confirmation, through the Studio's direct upload (never the function body). */
export async function uploadBrandFont(file:File):Promise<UploadResult>{
 const form=new FormData();
 form.set('font',file);form.set('licence','confirmed');form.set('licenceVersion',LICENCE_VERSION);
 try{
  const r=await studioFetch('/api/brand-fonts',{method:'POST',body:form});
  const body=await r.json().catch(()=>({})) as {font?:BrandFontFile;error?:string};
  if(r.ok&&body.font)return {name:file.name,ok:true,font:body.font};
  return {name:file.name,ok:false,error:body.font?.reason||body.error||'This font couldn’t be uploaded. Try again.',font:body.font};
 }catch(e){
  return {name:file.name,ok:false,error:e instanceof Error&&e.message?e.message:'This font couldn’t be uploaded. Check your connection and try again.'};
 }
}
/** Removes one font (owners): designs that use it then show "Missing font". */
export async function removeBrandFont(id:string):Promise<string|null>{
 try{
  const r=await fetch('/api/brand-fonts/'+encodeURIComponent(id),{method:'DELETE'});
  if(r.ok)return null;
  const body=await r.json().catch(()=>({})) as {error?:string};
  return body.error||'This font couldn’t be removed. Try again.';
 }catch{return 'This font couldn’t be removed. Check your connection and try again.'}
}
