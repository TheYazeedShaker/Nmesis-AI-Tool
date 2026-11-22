'use client';
import * as React from 'react';
import {brandFontsLoaded,brandFontsVersion,canvasFontFamily,cssFontFamily,fallbackFamily,faceFamily,fileFor,FONT_LOAD_MS,fontByName,fontKey,fontsInDoc,fontUrl,onBrandFonts,previewFamily,SYSTEM_FONT,type CatalogueFont,type FontNeed,type FontResult} from '@/lib/editor/fonts';
import {isBrandFontName} from '@/lib/brand-fonts/shared';
import type {EditorDoc} from '@/lib/editor/doc';
import {loadBrandFonts} from '@/components/brand/brand-fonts';

// The catalogue's fonts in the browser (lib/editor/fonts.ts says why and how).
// A family's file is registered as a FontFace, from the Studio's own address
// (/fonts/<id>/…), only when a design uses it or a person picks it, and each
// file once per page; the font list shows each name in a tiny file of its own
// glyphs (preview.woff2), loaded only when its row is on screen. A file that
// doesn't arrive within FONT_LOAD_MS, or fails, is a missing font: never
// silent (the layer, the panel and a notice say so; the console says which).
// The company's uploaded fonts load the same way, from their own address
// (/api/brand-fonts/<id>/font, a short-lived signed link to private storage),
// once the page has listed them (components/brand/brand-fonts.ts).

const faces=new Map<string,Promise<FontResult>>();
const timeout=(ms:number)=>new Promise<'timeout'>(resolve=>setTimeout(()=>resolve('timeout'),ms));
const canLoad=()=>typeof document!=='undefined'&&!!document.fonts&&typeof FontFace!=='undefined';

async function loadFace(family:string,url:string,descriptors:FontFaceDescriptors):Promise<FontResult>{
 if(!canLoad())return {ok:false,reason:'missing'};
 const face=new FontFace(family,`url(${url}) format("woff2")`,{display:'swap',...descriptors});
 document.fonts.add(face);
 try{
  const got=await Promise.race([face.load(),timeout(FONT_LOAD_MS)]);
  if(got==='timeout')return {ok:false,reason:'timeout'};
  return face.status==='loaded'?{ok:true}:{ok:false,reason:'failed'};
 }catch{document.fonts.delete(face);return {ok:false,reason:'failed'}}
}

/** Resolves once the company's fonts are listed (or after FONT_LOAD_MS, when they can't be). */
function brandFontsListed():Promise<void>{
 if(brandFontsLoaded())return Promise.resolve();
 void loadBrandFonts();
 return new Promise(resolve=>{const stop=onBrandFonts(()=>{if(brandFontsLoaded()){stop();clearTimeout(t);resolve()}});const t=setTimeout(()=>{stop();resolve()},FONT_LOAD_MS)});
}
/** Loads the one file that draws this font, weight and style (once per page). System and a loaded file answer at once. */
export function loadCanvasFont(need:FontNeed):Promise<FontResult>{
 if(need.font===SYSTEM_FONT)return Promise.resolve({ok:true});
 // An uploaded font is known once the company's fonts are listed; until then it is neither loaded nor missing.
 if(isBrandFontName(need.font)&&!brandFontsLoaded())return brandFontsListed().then(()=>brandFontsLoaded()?loadCanvasFont(need):{ok:false,reason:'missing'} as FontResult);
 const f=fontByName(need.font);
 if(!f&&isBrandFontName(need.font)){
  // Not (or no longer) one of the company's fonts: missing, asked again whenever the list changes.
  console.warn('[editor] a font is missing',{font:need.font,reason:'unknown'});
  return Promise.resolve({ok:false,reason:'unknown'});
 }
 if(!f){
  const key='unknown|'+need.font;
  if(!faces.has(key)){console.warn('[editor] a font is missing',{font:need.font,reason:'unknown'});faces.set(key,Promise.resolve({ok:false,reason:'unknown'}))}
  return faces.get(key)!;
 }
 const file=fileFor(f,need.weight,need.italic),key=f.id+'/'+file.file,known=faces.get(key);if(known)return known;
 const weight=Array.isArray(file.weight)?`${file.weight[0]} ${file.weight[1]}`:String(file.weight);
 const work=loadFace(faceFamily(f),file.src??fontUrl(f,file.file),{weight,style:file.style}).then(r=>{
  if(!r.ok)console.warn('[editor] a font is missing',{font:need.font,file:file.file,reason:r.reason});
  return r;
 });
 faces.set(key,work);
 return work;
}

/** The font list's preview of a family: its name in its own font, a few kilobytes. */
export function loadPreview(f:CatalogueFont):Promise<FontResult>{
 const key='preview/'+f.id,known=faces.get(key);if(known)return known;
 const work=loadFace(previewFamily(f),f.preview.src??fontUrl(f,f.preview.file),{weight:'400',style:'normal'});
 faces.set(key,work);return work;
}

/** A font as the page's own boxes show it (panel previews), loaded first; `missing` once it can't load. */
export function useFontFace(name:string|null,weight=400,italic=false):{family:string|undefined;missing:boolean;ready:boolean}{
 const [r,setR]=React.useState<FontResult|null>(null),key=name?fontKey({font:name,weight,italic}):'';
 React.useEffect(()=>{if(!name)return;let live=true;void loadCanvasFont({font:name,weight,italic}).then(x=>{if(live)setR(x)});return()=>{live=false}},[key,name,weight,italic]);
 if(!name)return {family:undefined,missing:false,ready:true};
 return {family:cssFontFamily(name),missing:!!r&&!r.ok,ready:!!r};
}

export type CanvasFonts={
 /** Every font the design needs is settled (loaded or missing) and the canvas shows it. */
 ready:boolean;
 /** Missing fonts (couldn't load, or not in the catalogue), each named once. */
 failed:string[];
 /** Whether a font (by name) is missing. */
 missing:(font:string)=>boolean;
 /** The family a text layer draws with now, and a key that changes when it does (the text is measured again). */
 family:(font:string,weight:number,italic?:boolean)=>{family:string;key:string};
 /** Resolves once ready (the export waits here). */
 whenReady:()=>Promise<void>;
};

/** The fonts of a design, loaded before they are drawn; the canvas redraws its text as each arrives. */
export function useCanvasFonts(doc:Pick<EditorDoc,'layers'>):CanvasFonts{
 const needs=fontsInDoc(doc),wanted=JSON.stringify(needs);
 const [settled,setSettled]=React.useState<Record<string,FontResult>>({});
 // The company's fonts: listed with the editor, and every font asked again when the list changes (an upload, a removal).
 const brandVersion=React.useSyncExternalStore(onBrandFonts,brandFontsVersion,()=>0);
 React.useEffect(()=>{void loadBrandFonts()},[]);
 React.useEffect(()=>{
  let live=true;
  for(const n of JSON.parse(wanted) as FontNeed[]){
   const k=fontKey(n);
   void loadCanvasFont(n).then(r=>{if(live)setSettled(s=>s[k]===r||(s[k]&&s[k].ok===r.ok&&r.ok)?s:{...s,[k]:r})});
  }
  return()=>{live=false};
 },[wanted,brandVersion]);
 const ready=needs.every(n=>settled[fontKey(n)]);
 const failed=[...new Set(needs.filter(n=>settled[fontKey(n)]&&!settled[fontKey(n)].ok).map(n=>n.font))];
 const failedKey=failed.join('|');
 // Waiters are let go after the render that shows the settled fonts has been committed.
 const gate=React.useRef<{ready:boolean;waiters:(()=>void)[]}>({ready:false,waiters:[]});
 React.useEffect(()=>{
  gate.current.ready=ready;
  if(ready&&gate.current.waiters.length){const w=gate.current.waiters;gate.current.waiters=[];for(const f of w)f()}
 });
 const whenReady=React.useCallback(()=>gate.current.ready?Promise.resolve():new Promise<void>(resolve=>{gate.current.waiters.push(resolve)}),[]);
 const family=React.useCallback((font:string,weight:number,italic=false)=>{
  const k=fontKey({font,weight,italic}),r=settled[k];
  if(r&&!r.ok)return {family:fallbackFamily(),key:k+':missing'};
  return {family:canvasFontFamily(font),key:k+(r?':loaded':':loading')};
 },[settled]);
 const missing=React.useCallback((font:string)=>failedKey.split('|').includes(font),[failedKey]);
 return {ready,failed,missing,family,whenReady};
}
