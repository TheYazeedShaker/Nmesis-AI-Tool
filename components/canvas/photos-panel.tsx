'use client';
import * as React from 'react';
import {ImageOff,Search} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {addToCanvas,carryToCanvas,endCarry,type DropPoint} from '@/components/shell/shell-state';
import {canvasAddSaid,photoCanvasAdd} from '@/lib/elements';
import type {ReferencePhoto} from '@/lib/references/provider';

// The editor's Photos panel (inside the shell's panel slot, components/shell/panels.tsx):
// one search over every photo library that is switched on (Unsplash, Pixabay:
// GET /api/references?provider=all, the References panel's own route and
// registry, lib/references). Results in a masonry grid; the photographer and
// the library show over a photo on hover and on keyboard focus, and the
// libraries are named under the grid. Click a photo to add it to the middle of
// the page, or drag it onto the canvas. Either way it is first copied into the
// person's own storage (POST /api/references/import, the upload path), so a
// design never depends on a library's address; the layer keeps the credit.
// Every state is drawn on purpose: before a search, loading (a placeholder
// grid), no results, a library off or failing, and all of them off.
// Styles: app/elements.css ("Photos").

const SEARCH_MS=20_000,IMPORT_MS=45_000,DEBOUNCE_MS=350,QUERY_MAX=100;
const IDEAS=['Mountain road','City at night','Desert dunes','Studio lighting','Coastline','Forest'];
type Library={id:string;label:string;on:boolean;notice?:string};
type Results={q:string;photos:ReferencePhoto[];nextPage:number|null;libraries:Library[]};
type View={kind:'idle'}|{kind:'loading';q:string}|{kind:'error';q:string;message:string}|({kind:'done'}&Results);

const isHttps=(v:unknown):v is string=>typeof v==='string'&&v.startsWith('https://');
function validPhoto(v:unknown):v is ReferencePhoto{
 const p=v as ReferencePhoto;
 return !!p&&typeof p.id==='string'&&typeof p.provider==='string'&&isHttps(p.thumb)&&isHttps(p.src)&&typeof p.alt==='string'
  &&typeof p.width==='number'&&typeof p.height==='number'&&!!p.credit&&typeof p.credit.name==='string'&&typeof p.credit.source==='string';
}
function validLibraries(v:unknown):Library[]{
 return Array.isArray(v)?v.filter((l):l is Library=>!!l&&typeof l.id==='string'&&typeof l.label==='string'&&typeof l.on==='boolean'):[];
}

async function studioJson(url:string,init:RequestInit,ms:number,outer?:AbortSignal){
 const inner=new AbortController(),stop=()=>inner.abort(),timer=window.setTimeout(stop,ms);
 outer?.addEventListener('abort',stop,{once:true});
 try{
  const response=await fetch(url,{...init,credentials:'same-origin',signal:inner.signal,headers:{Accept:'application/json',...init.headers}});
  const body=(await response.json().catch(()=>null)) as Record<string,unknown>|null;
  return {response,body};
 }finally{window.clearTimeout(timer);outer?.removeEventListener('abort',stop)}
}
const SEARCH_FAILED='The photo libraries couldn’t be reached. Check your connection and try again.';
async function fetchPage(q:string,page:number,signal:AbortSignal):Promise<Results|{error:string}>{
 try{
  const {response,body}=await studioJson('/api/references?'+new URLSearchParams({provider:'all',q,page:String(page)}),{},SEARCH_MS,signal);
  if(!response.ok||!body||!Array.isArray(body.photos))return {error:typeof body?.error==='string'?body.error:SEARCH_FAILED};
  return {q,photos:body.photos.filter(validPhoto),nextPage:typeof body.nextPage==='number'?body.nextPage:null,libraries:validLibraries(body.libraries)};
 }catch(e){if(signal.aborted)throw e;return {error:SEARCH_FAILED}}
}

const keyOf=(p:ReferencePhoto)=>`${p.provider}:${p.id}`;
const sentence=(l:Library)=>l.on?`${l.label}: ${l.notice}`:`${l.label} is off. Ask Nmesis to set it up.`;
const names=(ls:Library[])=>ls.map(l=>l.label).join(' and ');

// ── The masonry grid ──
// Two columns; each photo goes under the shorter one (by its own shape, known from the library), and its place is
// written as grid rows, so the order a keyboard or a screen reader follows is the order of the results.
const UNITS=50,GAP_UNITS=3;
function placeAll(photos:readonly ReferencePhoto[]){
 const tops=[0,0];
 return photos.map(p=>{
  const ratio=p.width>0&&p.height>0?p.height/p.width:0.75,span=Math.round(UNITS*Math.min(1.6,Math.max(0.5,ratio)))+GAP_UNITS;
  const col=tops[0]<=tops[1]?0:1,row=tops[col];tops[col]+=span;
  return {col,row,span};
 });
}

function Skeletons({count,from=0}:{count:number;from?:number}){
 // Heights vary like photos do, so the grid keeps its shape when the photos arrive.
 const shapes=[0.7,1.25,0.85,1,1.4,0.66];
 const fake=Array.from({length:count},(_,i)=>({width:100,height:100*shapes[(i+from)%shapes.length]})) as ReferencePhoto[];
 return <>{placeAll(fake).map((at,i)=><li key={'s'+i} className="photos-tile" aria-hidden="true" style={{gridColumn:at.col+1,gridRow:`${at.row+1} / span ${at.span}`}}><span className="ds-skel photos-skeleton"/></li>)}</>;
}

export function PhotosPanel(){
 const {toast}=useToast();
 const [typed,setTyped]=React.useState(''),[query,setQuery]=React.useState('');
 // The last answer, for the search (and the attempt) it answered: anything else on screen is still loading.
 const [got,setGot]=React.useState<{q:string;attempt:number;answer:Results|{error:string};more:'idle'|'loading'|'error'}|null>(null);
 const [status,setStatus]=React.useState<Library[]|null>(null);
 const [busy,setBusy]=React.useState<string|null>(null),[attempt,setAttempt]=React.useState(0);
 const grid=React.useRef<HTMLUListElement>(null),sentinel=React.useRef<HTMLDivElement>(null),moreCall=React.useRef<AbortController|null>(null);
 const searchId=React.useId(),helpId=React.useId();

 // Which libraries are on, before any search (the same answer without a search).
 React.useEffect(()=>{
  const ac=new AbortController();
  studioJson('/api/references?provider=all',{},SEARCH_MS,ac.signal).then(({body})=>setStatus(validLibraries(body?.libraries)),()=>{/* the panel closed */});
  return()=>ac.abort();
 },[]);

 // A moment after typing stops, the search runs (Enter runs it at once).
 React.useEffect(()=>{const t=window.setTimeout(()=>setQuery(typed.trim().slice(0,QUERY_MAX)),DEBOUNCE_MS);return()=>window.clearTimeout(t)},[typed]);
 React.useEffect(()=>{
  if(!query)return;
  const ac=new AbortController();
  moreCall.current?.abort();
  fetchPage(query,1,ac.signal).then(answer=>{
   setGot({q:query,attempt,answer,more:'idle'});
   if(!('error' in answer))setStatus(answer.libraries);
  },()=>{/* replaced by a newer search */});
  return()=>{ac.abort();moreCall.current?.abort()};
 },[query,attempt]);

 const current=got&&got.q===query&&got.attempt===attempt?got:null;
 const view:View=!query?{kind:'idle'}:!current?{kind:'loading',q:query}:'error' in current.answer?{kind:'error',q:query,message:current.answer.error}:{kind:'done',...current.answer};
 const more=current?.more??'idle';
 const done=view.kind==='done'?view:null;
 const loadMore=React.useCallback(()=>{
  if(!done||done.nextPage===null||more==='loading')return;
  const ac=new AbortController(),q=done.q;moreCall.current?.abort();moreCall.current=ac;
  const mark=(m:'idle'|'loading'|'error')=>setGot(g=>g&&g.q===q?{...g,more:m}:g);
  mark('loading');
  fetchPage(q,done.nextPage,ac.signal).then(r=>{
   if('error' in r){mark('error');return}
   setGot(g=>{
    if(!g||g.q!==q||'error' in g.answer)return g;
    const seen=new Set(g.answer.photos.map(keyOf));
    return {...g,more:'idle',answer:{...g.answer,photos:[...g.answer.photos,...r.photos.filter(p=>!seen.has(keyOf(p)))],nextPage:r.nextPage}};
   });
  },()=>{/* replaced */});
 },[done,more]);

 // The next page loads as the end of the grid scrolls into view (the panel body is what scrolls).
 React.useEffect(()=>{
  const end=sentinel.current;if(!end||!done||done.nextPage===null||more!=='idle')return;
  const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadMore()},{rootMargin:'0px 0px 400px 0px'});
  io.observe(end);return()=>io.disconnect();
 },[done,more,loadMore]);

 /** Copies the photo into the person's storage, then adds it (in the middle of the page, or where it was dropped). */
 async function place(photo:ReferencePhoto,at?:DropPoint){
  if(busy)return;
  setBusy(keyOf(photo));
  try{
   const {response,body}=await studioJson('/api/references/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:photo.provider,id:photo.id})},IMPORT_MS);
   if(!response.ok||!body){toast({message:typeof body?.error==='string'?body.error:'That photo couldn’t be added. Try again.',kind:'bad'});return}
   const add=photoCanvasAdd(body as Parameters<typeof photoCanvasAdd>[0],photo);
   if(!add){toast({message:'That photo couldn’t be added. Try again.',kind:'bad'});return}
   toast(canvasAddSaid(at?{...add,at}:add,addToCanvas(at?{...add,at}:add)));
  }catch{toast({message:'Adding the photo took too long. Try again.',kind:'bad'})}
  finally{setBusy(null)}
 }

 /** The arrow keys move between photos in the results' order; Home and End go to the first and the last. */
 function onGridKey(e:React.KeyboardEvent<HTMLUListElement>){
  const buttons=[...(grid.current?.querySelectorAll<HTMLButtonElement>('button.photos-add')??[])],at=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(at<0)return;
  const to=e.key==='ArrowRight'||e.key==='ArrowDown'?at+1:e.key==='ArrowLeft'||e.key==='ArrowUp'?at-1:e.key==='Home'?0:e.key==='End'?buttons.length-1:null;
  if(to===null)return;
  e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,to))]?.focus();
 }

 const libraries=done?.libraries??status??[];
 const off=libraries.filter(l=>!l.on),failing=libraries.filter(l=>l.on&&l.notice),on=libraries.filter(l=>l.on);
 const allOff=libraries.length>0&&on.length===0;
 const searching=view.kind==='loading'||(typed.trim()!==query&&!!typed.trim());
 const placed=done?placeAll(done.photos):[];

 return <div className="photos-panel">
  <form role="search" className="photos-search" onSubmit={e=>{e.preventDefault();setQuery(typed.trim().slice(0,QUERY_MAX))}}>
   <label className="ds-search" htmlFor={searchId}><Search aria-hidden="true"/><span className="ds-sr-only">Search photos</span>
    <input id={searchId} className="ds-input" type="search" value={typed} maxLength={QUERY_MAX} placeholder="Search free photos" aria-describedby={helpId} disabled={allOff}
     onChange={e=>setTyped(e.target.value)}
     onKeyDown={e=>{if(e.key==='ArrowDown'&&grid.current){const first=grid.current.querySelector<HTMLButtonElement>('button.photos-add');if(first){e.preventDefault();first.focus()}}}}/>
   </label>
  </form>
  <p className="ds-help" id={helpId} role="status">{allOff?'Photos are off.'
   :!query?'Click a photo to add it, or drag it onto the canvas.'
   :searching?'Searching…'
   :view.kind==='error'?view.message
   :done&&done.photos.length?`Photos for “${done.q}”${done.nextPage!==null?', more as you scroll':''}.`
   :done?`No photos match “${done.q}”.`:''}</p>

  {!allOff&&(off.length>0||failing.length>0)&&<ul className="photos-libraries" aria-label="Photo libraries">
   {[...off,...failing].map(l=><li key={l.id} className="ds-help" data-library={l.id} data-on={l.on?'true':'false'}><ImageOff aria-hidden="true"/>{sentence(l)}</li>)}
  </ul>}

  {allOff?<State kind="empty" title="Photos aren’t set up yet">{`${names(libraries)} ${libraries.length===1?'is':'are'} off until Nmesis adds ${libraries.length===1?'its key':'their keys'}. Your uploads still work.`}</State>
   :view.kind==='idle'?<div className="photos-start">
    <State kind="empty" title="Find a photo">{`Search free photos from ${names(on.length?on:libraries)||'the photo libraries'}. Each one is copied into your Studio when you add it.`}</State>
    <div className="photos-ideas" role="group" aria-label="Ideas to search">{IDEAS.map(idea=><button key={idea} type="button" className="ds-chip" onClick={()=>{setTyped(idea);setQuery(idea)}}>{idea}</button>)}</div>
   </div>
   :view.kind==='error'?<State kind="error" title="The search didn’t finish" actions={<Button size="sm" onClick={()=>setAttempt(a=>a+1)}>Try again</Button>}>{view.message}</State>
   :view.kind==='loading'?<div className="photos-box"><ul className="photos-grid" aria-busy="true" aria-label="Loading photos"><Skeletons count={8}/></ul></div>
   :done&&!done.photos.length?<State kind="empty" title={`No photos match “${done.q}”`}>Try a shorter or different word, such as “road” or “sky”.</State>
   :done&&<>
    <div className="photos-box">
     <ul ref={grid} className="photos-grid" aria-label={`Photos for ${done.q}`} aria-busy={more==='loading'||undefined} onKeyDown={onGridKey}>
      {done.photos.map((p,i)=>{
       const k=keyOf(p),at=placed[i],label=`Add ${p.alt?`“${p.alt}”`:'this photo'} by ${p.credit.name} from ${p.credit.source}`;
       return <li key={k} className="photos-tile" style={{gridColumn:at.col+1,gridRow:`${at.row+1} / span ${at.span}`}}>
        <button type="button" className="photos-add" aria-label={label} data-provider={p.provider} data-busy={busy===k?'true':undefined} disabled={!!busy&&busy!==k}
         draggable onDragStart={e=>carryToCanvas(e,p.alt||'Photo',point=>void place(p,point))} onDragEnd={endCarry} onClick={()=>void place(p)}>
         {/* eslint-disable-next-line @next/next/no-img-element -- the library's own picture, shown for the search only (never kept on a design) */}
         <img src={p.thumb} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"/>
         <span className="photos-credit" aria-hidden="true"><span className="photos-credit-name">{p.credit.name}</span><span>{p.credit.source}</span></span>
         {busy===k&&<span className="photos-adding" aria-hidden="true">Adding…</span>}
        </button>
       </li>;
      })}
      {more==='loading'&&<Skeletons count={4} from={done.photos.length}/>}
     </ul>
    </div>
    <div ref={sentinel} className="photos-end">
     {done.nextPage!==null&&<Button size="sm" kind="quiet" disabled={more==='loading'} onClick={loadMore}>{more==='loading'?'Loading more…':more==='error'?'Couldn’t load more. Try again':'Load more'}</Button>}
    </div>
   </>}
  {!allOff&&on.length>0&&<p className="ds-help photos-sources">Photos from {on.map((l,i)=><React.Fragment key={l.id}>{i>0&&' and '}<a className="ds-link" href={l.id==='unsplash'?'https://unsplash.com/?utm_source=nmesis_studio&utm_medium=referral':`https://${l.id}.com/`} target="_blank" rel="noopener noreferrer">{l.label}</a></React.Fragment>)}.</p>}
 </div>;
}
