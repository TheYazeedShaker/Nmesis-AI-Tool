'use client';
import * as React from 'react';
import {Check,X} from 'lucide-react';
import {IconButton} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {DropZone} from '@/components/ds/drop-zone';
import {SkeletonTile,State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {useAccount} from '@/components/studio-account';
import {ReferencesPanel} from '@/components/references/references-panel';
import {can} from '@/lib/accounts/can';
import {uploadReference} from '@/lib/reference-upload';
import {addReference,removeReference,TRAY_LIMIT,useReferenceTray} from '@/lib/reference-tray';
import type {Upload} from '@/lib/uploads';
import {closePanel,useShell,type ShellPanel} from './shell-state';

// The side panel beside the left navigation: References or Uploads. On wide
// screens a column next to the navigation (the page stays usable beside it);
// below 768px a drawer over the page.
const TITLE:Record<ShellPanel,string>={references:'References',uploads:'Uploads'};

function useNarrow(){
 return React.useSyncExternalStore(l=>{const m=window.matchMedia('(max-width: 768px)');m.addEventListener('change',l);return()=>m.removeEventListener('change',l)},()=>window.matchMedia('(max-width: 768px)').matches,()=>false);
}

function Body({panel}:{panel:ShellPanel}){
 const {car}=useShell();
 return panel==='references'?<ReferencesPanel key={car} initialQuery={car}/>:<UploadsPanel/>;
}

export function ShellPanels(){
 const {panel}=useShell(),narrow=useNarrow();
 if(!panel)return null;
 if(narrow)return <Dialog open onClose={closePanel} title={TITLE[panel]} variant="drawer" className="studio-panel-drawer"><Body panel={panel}/></Dialog>;
 return <aside id="studio-panel" className="studio-panel" aria-label={TITLE[panel]}>
  <div className="studio-panel-head"><h2 className="ds-section-title">{TITLE[panel]}</h2><IconButton label={`Close ${TITLE[panel]}`} size="sm" kind="quiet" onClick={closePanel}><X aria-hidden="true"/></IconButton></div>
  <div className="studio-panel-body"><Body panel={panel}/></div>
 </aside>;
}

/** The person's own uploads: add pictures, and pick one as a reference (a tick shows it is in use). */
export function UploadsPanel(){
 const account=useAccount(),tray=useReferenceTray(),toaster=useToast();
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
  if(!addReference({key,src:u.src,thumb:u.thumb,name:'Your upload',provider:'upload',assetId:u.id}))toaster.toast({message:`You can use up to ${TRAY_LIMIT} references. Remove one first.`,kind:'info'});
 }
 return <div className="ds-stack">
  {mayAdd&&<DropZone name="picture" label="Drop, paste or upload a picture" hint="PNG, JPEG or WebP · up to 40 MB" onFile={file=>void add(file)} disabled={!!busy}/>}
  {busy&&<p className="ds-help" role="status">{busy}</p>}
  {problem&&<State kind="error" title="Your uploads didn’t load" actions={<button type="button" className="ds-btn" onClick={retry}>Try again</button>}>{problem}</State>}
  {uploads===null?<div className="studio-pick-grid" aria-busy="true" aria-label="Loading your uploads">{Array.from({length:6},(_,i)=><SkeletonTile key={i}/>)}</div>
   :uploads.length===0&&!problem?<p className="ds-muted">Nothing here yet. Pictures you upload appear here, ready to use as references.</p>
   :<ul className="studio-pick-grid" aria-label="Your uploads">{uploads.map(u=>{const on=tray.some(t=>t.key==='upload:'+u.id);return <li key={u.id}>
    <button type="button" className="studio-pick" aria-pressed={on} aria-label={on?'Remove this upload from your references':'Use this upload as a reference'} onClick={()=>pick(u)}>
     {/* eslint-disable-next-line @next/next/no-img-element -- a private picture on a signed link */}
     <img src={u.thumb} alt="" loading="lazy" decoding="async"/>
     {on&&<span className="studio-pick-tick" aria-hidden="true"><Check/></span>}
    </button></li>})}</ul>}
 </div>;
}
