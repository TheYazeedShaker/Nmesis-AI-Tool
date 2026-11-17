'use client';
import * as React from 'react';
import {ArrowRight,ArrowUp,Camera,Download,LifeBuoy,Pencil,RotateCcw,Sparkles} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {Checkbox,Field,Input,Select,Textarea} from '@/components/ds/field';
import {useToast} from '@/components/ds/toast';
import {credits as creditWords} from '@/lib/ds/words';
import {fetchDownloadImage,imageFilename} from '@/lib/image-download';
import type {Film} from '@/lib/films';
import type {BoardShot,CarView} from '@/lib/storyboards';
import {CostBadge} from './parts';

// Story, the board (Phase 3 group 2): the shots as cards in the canvas, each
// with its own quiet actions (its image with the cost first, edit, move,
// download), and the film's cut: one clip per chosen shot and the finished film.

const asset=(id:string)=>'/api/assets/'+id;
export const filmPending=(f?:Film)=>!!f&&['queued','in_progress','archiving','submitting','unknown'].includes(f.status);
const CLIP_WORDS:Record<string,string>={draft:'Ready to estimate',quoted:'Priced',queued:'Queued',submitting:'Starting',in_progress:'Rendering',archiving:'Saving',unknown:'Checking',ready:'Ready',failed:'Didn’t finish',canceled:'Cancelled',nsfw:'Stopped by the content check'};

/** Saves the picture to the device; a failure says so and offers the original. */
function useImageDownload(){
 const toast=useToast();
 const [busy,setBusy]=React.useState<string|null>(null);
 const download=React.useCallback(async(src:string,name:string)=>{
  setBusy(src);
  try{
   const blob=await fetchDownloadImage(src,AbortSignal.timeout(60_000));
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=imageFilename(name,blob.type);a.hidden=true;document.body.appendChild(a);
   try{a.click()}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  }catch(e){toast.toast({message:e instanceof Error?e.message:'Download interrupted. Try again or open the original.',kind:'bad',action:{label:'Open original',run:()=>{window.open(src,'_blank','noopener,noreferrer')}}})}
  finally{setBusy(null)}
 },[toast]);
 return {busy,download};
}

export function ShotBoard({shots,views,films,expert,disabled,imageCost,onShot,onMove,onImage,onReview}:{
 shots:BoardShot[];views:CarView[];films:Film[];expert:boolean;disabled:boolean;
 /** Credits for one image, before it is made (null when not known). */imageCost:number|null;
 onShot:(id:string,patch:Partial<BoardShot>)=>void;onMove:(index:number)=>void;onImage:(id:string)=>void;onReview:()=>void;
}){
 const [editing,setEditing]=React.useState<string|null>(null);
 const {busy,download}=useImageDownload();
 const selected=shots.filter(s=>s.selected);
 const open=shots.find(s=>s.id===editing),openIndex=shots.findIndex(s=>s.id===editing);
 return <div className="ds-stack editor-storyboard-board">
  <ol className="editor-story" aria-label="Shots">{shots.map((s,i)=>{
   const pending=filmPending(films.find(f=>f.id===s.filmId));
   return <li key={s.id} className="editor-shot editor-storyboard-shot" data-selected={s.selected||undefined}>
    <div className="editor-storyboard-frame">
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
     {s.imageId?<img crossOrigin="anonymous" src={asset(s.imageId)} alt={s.title}/>:<span className="editor-storyboard-empty"><Camera aria-hidden="true"/><span>{s.status==='generating'?'Generation pending — reload before retrying':'Ready to visualize'}</span></span>}
    </div>
    <span><b>{String(i+1).padStart(2,'0')} · {s.title}</b><span className="ds-muted editor-storyboard-clamp">{s.motion}</span></span>
    {typeof s.credits==='number'&&s.imageId&&<CostBadge credits={s.credits} used/>}
    {s.error&&<p className="ds-error" role="alert">{s.error}</p>}
    <Checkbox label="Use shot" checked={s.selected} disabled={disabled} onChange={e=>onShot(s.id,{selected:e.target.checked})}/>
    <div className="ds-row">
     <Button size="sm" kind="quiet" icon={<Sparkles aria-hidden="true"/>} disabled={disabled||pending} onClick={()=>onImage(s.id)}>{s.imageId?'Regenerate image':'Generate image'}{imageCost!==null&&<span className="ds-btn-meta">· {creditWords(imageCost)}</span>}</Button>
     <IconButton label={`Edit shot ${i+1}`} size="sm" disabled={disabled} onClick={()=>setEditing(s.id)}><Pencil aria-hidden="true"/></IconButton>
     <IconButton label={`Move shot ${i+1} earlier`} size="sm" disabled={disabled||i===0} onClick={()=>onMove(i)}><ArrowUp aria-hidden="true"/></IconButton>
     {s.imageId&&<IconButton label={`Download shot ${i+1}`} size="sm" busy={busy===asset(s.imageId)} onClick={()=>void download(asset(s.imageId!),s.title)}><Download aria-hidden="true"/></IconButton>}
    </div>
   </li>})}</ol>
  <div className="ds-row">
   <span className="ds-muted editor-storyboard-grow" role="status">{selected.length} selected · choose 3–6 for a 15-second film</span>
   <Button disabled={disabled||selected.length<3||selected.length>6||selected.some(s=>!s.imageId)} onClick={onReview}>Review film <ArrowRight aria-hidden="true"/></Button>
  </div>
  <Dialog open={!!open} onClose={()=>setEditing(null)} title={open?`Shot ${openIndex+1}`:'Shot'} wide footer={<Button kind="primary" onClick={()=>setEditing(null)}>Done</Button>}>
   {open&&<div className="ds-stack">
    <Field label="Title"><Input value={open.title} onChange={e=>onShot(open.id,{title:e.target.value})} maxLength={80} disabled={disabled}/></Field>
    <Field label="Image direction" help="Changing it archives this image; the next one needs your approval." count={{value:open.visual.length,max:1800}}><Textarea value={open.visual} onChange={e=>onShot(open.id,{visual:e.target.value})} maxLength={1800} rows={4} disabled={disabled}/></Field>
    <Field label="Camera & animation" count={{value:open.motion.length,max:700}}><Textarea value={open.motion} onChange={e=>onShot(open.id,{motion:e.target.value})} maxLength={700} rows={3} disabled={disabled}/></Field>
    {expert&&<Field label="Car angle"><Select value={open.viewId} onChange={e=>onShot(open.id,{viewId:e.target.value})} disabled={disabled}>{views.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</Select></Field>}
    {open.versions.length>0&&<section className="ds-stack" aria-labelledby="story-earlier-title">
     <h3 className="editor-section-title" id="story-earlier-title">Earlier images ({open.versions.length})</h3>
     <ul className="ds-grid dense editor-storyboard-library">{open.versions.map(id=><li key={id}><a className="editor-storyboard-pick" href={asset(id)} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
      <img crossOrigin="anonymous" src={asset(id)} alt="Earlier storyboard version"/>
     </a></li>)}</ul>
    </section>}
   </div>}
  </Dialog>
 </div>;
}

export function FilmCut({shots,films,finalUrl,quote,disabled,onRecover,onRedo,onEdit}:{
 /** The chosen shots, in order, and each one's clip. */shots:BoardShot[];films:(Film|undefined)[];finalUrl?:string;
 /** New clips priced and not yet approved. */quote:{clips:number;label:string}|null;disabled:boolean;
 onRecover:(film:Film)=>void;onRedo:(shotId:string)=>void;onEdit:()=>void;
}){
 return <div className="ds-stack editor-storyboard-board">
  {finalUrl&&<figure className="editor-result editor-storyboard-final">
   <video src={finalUrl} controls playsInline aria-label="Your finished film"/>
   <figcaption><span>Your finished film · 15 seconds</span><a className="ds-btn sm quiet" href={finalUrl+'&download=1'} download><Download aria-hidden="true"/>Download 15-second film</a></figcaption>
  </figure>}
  <div className="ds-row">
   <p className="ds-muted editor-storyboard-grow">{shots.length} shots · 15 seconds · landscape 720p. Each approved frame becomes a 5-second clip; they are trimmed and joined in this order.</p>
   <Button size="sm" kind="quiet" icon={<Pencil aria-hidden="true"/>} disabled={disabled} onClick={onEdit}>Edit storyboard</Button>
  </div>
  {quote&&<p className="ds-note" role="status">{quote.clips} new {quote.clips===1?'clip':'clips'} · {quote.label}. Video credits only; images show their own. Prices are checked again before rendering.</p>}
  <ol className="editor-story" aria-label="Clips">{shots.map((s,i)=>{const f=films[i];return <li key={s.id} className="editor-shot">
   <div className="editor-storyboard-frame">
    {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    {f?.videoUrl?<video src={f.videoUrl} controls playsInline aria-label={s.title}/>:s.imageId?<img crossOrigin="anonymous" src={asset(s.imageId)} alt={s.title}/>:<span className="editor-storyboard-empty"><Camera aria-hidden="true"/><span>No image yet</span></span>}
   </div>
   <span><b>{i+1}. {s.title}</b><span className="ds-muted">{f?CLIP_WORDS[f.status]||f.status:'Ready to estimate'} · edit {(15/shots.length).toFixed(1)}s</span></span>
   {f?.status==='ready'&&<CostBadge credits={f.credits} used/>}
   {f?.error&&<p className="ds-error" role="alert">{f.error}</p>}
   <div className="ds-row">
    {f&&['unknown','submitting'].includes(f.status)&&<Button size="sm" kind="quiet" icon={<LifeBuoy aria-hidden="true"/>} disabled={disabled} onClick={()=>onRecover(f)}>Recover approved render</Button>}
    {f?.videoUrl&&<a className="ds-btn sm quiet" href={f.videoUrl+'?download=1'} download><Download aria-hidden="true"/>Download clip</a>}
    {f&&['ready','failed','nsfw','canceled'].includes(f.status)&&<Button size="sm" kind="quiet" icon={<RotateCcw aria-hidden="true"/>} disabled={disabled} onClick={()=>onRedo(s.id)}>Redo this clip</Button>}
   </div>
  </li>})}</ol>
 </div>;
}
