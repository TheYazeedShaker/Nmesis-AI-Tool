'use client';
import * as React from 'react';

// Pictures for the canvas. Every picture is fetched and drawn from a local blob
// address, so the canvas never becomes "tainted" by a cross-origin image and
// the design can always be exported (a signed storage link redirects to
// another origin). One fetch per address for the page's life.
const cache=new Map<string,Promise<HTMLImageElement>>();
const LOAD_MS=30_000;

export function loadImage(src:string):Promise<HTMLImageElement>{
 const known=cache.get(src);if(known)return known;
 const work=(async()=>{
  const r=await fetch(src,{credentials:'same-origin',signal:AbortSignal.timeout(LOAD_MS)});
  if(!r.ok)throw new Error('A picture in this design could not be loaded.');
  const url=URL.createObjectURL(await r.blob());
  const img=new Image();img.decoding='async';img.src=url;
  await img.decode().catch(()=>new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('A picture in this design could not be read.'))}));
  return img;
 })();
 cache.set(src,work);
 work.catch(()=>cache.delete(src));
 return work;
}

/** The loaded picture for an address, or null while it loads (or if it failed: `error` says so). */
export function useCanvasImage(src:string|null|undefined){
 const [state,setState]=React.useState<{src:string;img:HTMLImageElement|null;error:string}>({src:'',img:null,error:''});
 React.useEffect(()=>{
  if(!src)return;let live=true;
  loadImage(src).then(img=>{if(live)setState({src,img,error:''})},(e:unknown)=>{if(live)setState({src,img:null,error:e instanceof Error?e.message:'A picture could not be loaded.'})});
  return()=>{live=false};
 },[src]);
 return state.src===src?state:{src:src||'',img:null,error:''};
}
