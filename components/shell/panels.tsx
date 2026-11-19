'use client';
import * as React from 'react';
import {Check,X} from 'lucide-react';
import {IconButton} from '@/components/ds/button';
import {DropZone} from '@/components/ds/drop-zone';
import {SkeletonTile,State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {useAccount} from '@/components/studio-account';
import {ReferencesPanel} from '@/components/references/references-panel';
import {BrandPanel} from '@/components/brand/brand-panel';
import {can} from '@/lib/accounts/can';
import {uploadReference} from '@/lib/reference-upload';
import {removeReference,useReferenceTray} from '@/lib/reference-tray';
import {panelsOn,type NavPage} from '@/lib/shell-nav';
import type {Upload} from '@/lib/uploads';
import {canvasAddSaid,imageSize,uploadCanvasAdd} from '@/lib/elements';
import {addAsReference,addToCanvas,closePanel,useShell,type ShellPanel} from './shell-state';
import {ElementsPanel} from './elements-panel';
import {TextPanel} from './text-panel';

// The one secondary-panel slot, beside the left navigation: References, Brand,
// Elements or Uploads, only inside a tool's view (lib/shell-nav.ts). On wide
// screens a column next to the navigation (the page stays usable beside it);
// below 768px a sheet under the slim top bar. Either way it sits on the panel
// layer (--ds-z-panel), so menus and drawers open over it, never under it.
const TITLE:Record<ShellPanel,string>={references:'References',brand:'Brand',elements:'Elements',text:'Text',uploads:'Uploads'};

function Body({panel}:{panel:ShellPanel}){
 const {tool}=useShell();
 if(panel==='references')return <ReferencesPanel tool={tool}/>;
 if(panel==='brand')return <BrandPanel/>;
 if(panel==='elements')return <ElementsPanel/>;
 if(panel==='text')return <TextPanel/>;
 return <UploadsPanel/>;
}

export function ShellPanels({current}:{current?:NavPage}){
 const {panel}=useShell(),ref=React.useRef<HTMLElement>(null);
 const shown=panel&&panelsOn(current).includes(panel)?panel:null;
 // Opening a panel takes the keyboard there; Escape closes it.
 React.useEffect(()=>{if(shown)ref.current?.focus({preventScroll:true})},[shown]);
 if(!shown)return null;
 return <aside ref={ref} id="studio-panel" className="studio-panel" aria-label={TITLE[shown]} tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closePanel()}}}>
  <div className="studio-panel-head"><h2 className="ds-section-title">{TITLE[shown]}</h2><IconButton label={`Close ${TITLE[shown]}`} size="sm" kind="quiet" onClick={closePanel}><X aria-hidden="true"/></IconButton></div>
  <div className="studio-panel-body"><Body panel={shown}/></div>
 </aside>;
}

/** The uploads as buttons. Inside the canvas editor (`design`) a press adds the
 *  picture to the design; elsewhere it toggles it as a reference (a tick shows it is in use). */
export function UploadGrid({uploads,inUse,design,onPress}:{uploads:readonly Upload[];inUse:(u:Upload)=>boolean;design:boolean;onPress:(u:Upload,img:HTMLImageElement|null)=>void}){
 return <ul className="studio-pick-grid" aria-label="Your uploads">{uploads.map(u=>{const on=!design&&inUse(u);return <li key={u.id}>
  <button type="button" className="studio-pick" aria-pressed={design?undefined:on} aria-label={design?'Add this upload to the design':on?'Remove this upload from your references':'Use this upload as a reference'} onClick={e=>onPress(u,e.currentTarget.querySelector('img'))}>
   {/* eslint-disable-next-line @next/next/no-img-element -- a private picture on a signed link */}
   <img src={u.thumb} alt="" loading="lazy" decoding="async"/>
   {on&&<span className="studio-pick-tick" aria-hidden="true"><Check/></span>}
  </button></li>})}</ul>;
}

/** The person's own uploads: add pictures, and pick one as a reference (a tick shows it is in use),
 *  or, inside the canvas editor, add one to the design.
 *  The Uploads panel inside a tool or the editor, and the Uploads page outside one. */
export function UploadsPanel(){
 const account=useAccount(),tray=useReferenceTray(),toaster=useToast(),design=!!useShell().canvas;
 const [uploads,setUploads]=React.useState<Upload[]|null>(null),[problem,setProblem]=React.useState(''),[busy,setBusy]=React.useState('');
 const [attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{
  let live=true;
  fetch('/api/assets',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15_000)})
   .then(async r=>{const d=await r.json().catch(()=>({})) as {uploads?:Upload[];error?:string};if(!r.ok)throw new Error(d.error||'Your uploads didn’t load.');if(live)setUploads(d.uploads||[])})
   .catch((e:unknown)=>{if(!live)return;setProblem(e instanceof Error&&e.name!=='TimeoutError'?e.message:'Your uploads didn’t load.');setUploads(u=>u??[])});
  return()=>{live=false};
 },[attempt]);
 const retry=()=>{setProblem('');setAttempt(a=>a+1)};
 const mayAdd=can(account,'uploads.add');
 async function add(file:File){
  setBusy('Uploading…');
  try{const a=await uploadReference(file,file,{upload:true,onStage:setBusy});setUploads(u=>[{id:a.id,src:a.url,thumb:a.url+'?thumb=1',at:new Date().toISOString()},...(u||[])]);toaster.toast({message:'Uploaded.',kind:'ok'})}
  catch(e){toaster.toast({message:e instanceof Error?e.message:'The upload didn’t finish.',kind:'bad'})}
  finally{setBusy('')}
 }
 function pick(u:Upload){
  const key='upload:'+u.id;
  if(tray.some(t=>t.key===key)){removeReference(key);return}
  const done=addAsReference({key,src:u.src,thumb:u.thumb,name:'Your upload',provider:'upload',assetId:u.id});
  if(done==='full')toaster.toast({message:'Your references are full. Remove one first.',kind:'info'});
  else if(done==='replaced')toaster.toast({message:'This upload is now your reference.',kind:'ok'});
 }
 // Inside the editor: the thumbnail keeps the picture's shape (resized to fit), so its size gives the editor the shape.
 function press(u:Upload,img:HTMLImageElement|null){
  if(!design){pick(u);return}
  const add=uploadCanvasAdd(u,imageSize(img));
  toaster.toast(add?canvasAddSaid(add,addToCanvas(add)):{message:'This upload can’t be added to the design.',kind:'bad'});
 }
 return <div className="ds-stack">
  {mayAdd&&<DropZone name="picture" label="Drop, paste or upload a picture" hint="PNG, JPEG or WebP · up to 40 MB" onFile={file=>void add(file)} disabled={!!busy}/>}
  {busy&&<p className="ds-help" role="status">{busy}</p>}
  {problem&&<State kind="error" title="Your uploads didn’t load" actions={<button type="button" className="ds-btn" onClick={retry}>Try again</button>}>{problem}</State>}
  {uploads===null?<div className="studio-pick-grid" aria-busy="true" aria-label="Loading your uploads">{Array.from({length:6},(_,i)=><SkeletonTile key={i}/>)}</div>
   :uploads.length===0&&!problem?<p className="ds-muted">{design?'Nothing here yet. Pictures you upload appear here, ready to add to your design.':'Nothing here yet. Pictures you upload appear here, ready to use as references.'}</p>
   :<UploadGrid uploads={uploads} design={design} inUse={u=>tray.some(t=>t.key==='upload:'+u.id)} onPress={press}/>}
 </div>;
}
