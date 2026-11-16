'use client';
import {useUndoableRemoval} from '@/components/undo-removal';
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AlertCircle,Check,KeyRound,Maximize2,RefreshCw,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Field,Input,Select} from '@/components/ds/field';
import {Badge} from '@/components/ds/feedback';
import {useConfirm} from '@/components/ds/dialog';
import {topazActive,type TopazConnectionStatus,type TopazJob} from '@/lib/topaz';
import {upscaleTarget} from '@/lib/upscale-models';
import type {Visual} from '@/lib/studio';
import {CreditCost,CreditsUsed,NmesisProvides,refreshCredits} from '@/components/credits';
import {topazCost} from '@/lib/credits/words';
type Reply={error?:string;job:TopazJob;jobs:TopazJob[]}&TopazConnectionStatus;
async function responseJson(r:Response):Promise<Reply>{const d=await r.json() as Reply;if(!r.ok)throw new Error(d.error||'The upscale request could not be completed.');return d}
const jobWords=(job:TopazJob)=>job.status==='ready'?'Saved':job.status==='archiving'?'Saving image':job.status==='queued'?'Queued':job.status==='processing'?`Upscaling · ${job.progress}%`:job.status==='submitting'?'Submitting':job.status==='unknown'?'Check submission':job.status==='failed'?'Could not upscale':'Cancelled';
// Item 7b: on the design system (app/panels.css). The cost sits beside the
// Upscale button, before anything starts; each upscale shows its own progress.
export function TopazUpscale({visual,onSaved}:{visual:Visual;onSaved:(v:Visual)=>void}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const [connection,setConnection]=useState<TopazConnectionStatus|null>(null),[jobs,setJobs]=useState<TopazJob[]>([]),[loaded,setLoaded]=useState(false);
 const [key,setKey]=useState(''),[settings,setSettings]=useState(false),[savingKey,setSavingKey]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[edge,setEdge]=useState(3840);
 const lock=useRef(false),requestId=useRef<string|null>(null),mounted=useRef(true),root=useRef<HTMLElement>(null);
 const target=visual.width&&visual.height?upscaleTarget(visual.width,visual.height,edge):null;
 const active=jobs.find(j=>topazActive(j.status));
 const canEnlarge=!!target&&edge>Math.max(visual.width!,visual.height!);
 const load=useCallback(async()=>{
  try{const [c,j]=await Promise.all([fetch('/api/topaz/connection',{signal:AbortSignal.timeout(30000)}).then(responseJson),visual.example?Promise.resolve({jobs:[]}):fetch('/api/topaz/jobs?parentId='+encodeURIComponent(visual.id),{signal:AbortSignal.timeout(30000)}).then(responseJson)]);if(mounted.current){setConnection(c);setJobs(j.jobs);setLoaded(true)}}catch(e){if(mounted.current)setError((e as Error).name==='TimeoutError'?'Loading the upscale status took too long. Reload to try again.':(e as Error).message)}
 },[visual.id,visual.example]);
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false}},[load]);
 const refresh=useCallback(async(id:string)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const d=await fetch('/api/topaz/jobs/'+id,{method:'POST',signal:AbortSignal.timeout(110000)}).then(responseJson);if(mounted.current){setJobs(js=>js.map(j=>j.id===id?d.job:j));if(!['queued','processing','archiving'].includes(d.job.status))refreshCredits();if(d.job.status==='ready'&&d.job.visual)onSaved(d.job.visual)}}catch(e){if(mounted.current)setError((e as Error).name==='TimeoutError'?'Checking took too long. Use Refresh status; no new upscale will be submitted.':(e as Error).message)}finally{lock.current=false;if(mounted.current)setBusy(false)}
 },[onSaved]);
 useEffect(()=>{
  if(!active||error||busy||!['queued','processing','archiving'].includes(active.status))return;
  const timer=setTimeout(()=>void refresh(active.id),6000);return()=>clearTimeout(timer);
 },[active,error,busy,refresh]);
 const removeLater=useUndoableRemoval(),ask=useConfirm();
 async function connect(remove=false){
  if(savingKey)return;
  // Removing waits for Undo (components/undo-removal.tsx); the settings close so the toast can be reached.
  // This panel sits in the Upscale dialog, and a modal dialog leaves the Undo toast out of reach:
  // there, ask first (the ladder's rule for what cannot be undone), then still offer Undo.
  if(remove){if(root.current?.closest('dialog[open]')&&!await ask({title:w('Remove your Topaz key?'),body:<p>{w('The saved Topaz key is removed from your account. You can add a key again at any time.')}</p>,verb:'Remove key',danger:true}))return;setSettings(false);removeLater({message:w('Your Topaz key will be removed.'),url:'/api/topaz/connection',removed:()=>{setConnection(c=>c?{...c,connected:false}:null);setNotice(w('Topaz key removed.'))}});return}setSavingKey(true);setError('');setNotice('');
  try{const d=await fetch('/api/topaz/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),...remove?{}:{body:JSON.stringify({key:key.trim()})}}).then(responseJson);if(remove){setConnection(c=>c?{...c,connected:false}:null);setNotice(w('Topaz key removed.'))}else{setConnection(d);setSettings(false);setNotice(w('Topaz connected. ')+d.credits+' API credits available. Verification did not spend credits.')}}catch(e){setError((e as Error).name==='TimeoutError'?'Checking the key took too long. Try again.':(e as Error).message)}finally{setKey('');setSavingKey(false)}
 }
 async function start(){
  if(lock.current||!canEnlarge||active||!loaded)return;lock.current=true;setBusy(true);setError('');setNotice('');
  requestId.current??=crypto.randomUUID();
  try{const d=await fetch('/api/topaz/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,parentId:visual.id,edge}),signal:AbortSignal.timeout(65000)}).then(responseJson);if(mounted.current){setJobs(js=>[d.job,...js.filter(j=>j.id!==d.job.id)]);requestId.current=null;refreshCredits()}}catch(e){refreshCredits();if(mounted.current){setError((e as Error).name==='TimeoutError'?'Submission is taking longer than expected. Reload status before trying again.':(e as Error).message);setLoaded(false);await load()}}finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 // The key's own controls are for companies whose plan includes their own keys,
 // and only once the connection has said so.
 const ownKey=!!connection?.ownKeys&&!connection.sponsored;
 return <section ref={root} className="tool-panel" aria-label={showNames?'Topaz High Fidelity 3 upscale':'High Fidelity 3 upscale'}>
  <div className="tp-head tp-head-row"><div className="tp-head"><h3 className="tp-title">{w('Topaz Gigapixel · High Fidelity 3')}</h3><p className="ds-help">Enlarge your finished visual, right here.</p></div><Badge kind="accent">Recommended for car visuals</Badge></div>
  <p className="ds-help">Preserve the car’s structure and natural texture with gentle sharpening. Your original stays in the library.</p>
  {connection&&!connection.ownKeys?<NmesisProvides provider="topaz"/>:connection?.sponsored?<p className="ds-help">{w('Your company’s owner manages the Topaz connection. No API key is needed from you.')}</p>:ownKey&&<div><Button size="sm" icon={<KeyRound aria-hidden="true"/>} aria-expanded={settings} onClick={()=>{setKey('');setSettings(!settings)}} disabled={busy||savingKey}>{connection?.connected?w('Manage Topaz connection'):w('Connect Topaz API')}</Button></div>}
  {ownKey&&(settings||loaded&&!connection?.connected&&!connection?.available)&&<div className="tp-group">
   <p className="ds-help">Create a key in your <a className="ds-link" href="https://account.topazlabs.com/manage-api" target="_blank" rel="noreferrer">{w('Topaz API account ↗')}<span className="ds-sr-only"> (opens in a new tab)</span></a>{w('. API credits are separate from Higgsfield and desktop subscriptions.')}</p>
   <form className="tp-form" onSubmit={e=>{e.preventDefault();void connect()}}>
    <Field id="topaz-api-key" label={w('Topaz API key')} help="Encrypted for your signed-in account. Never stored in browser storage or displayed again."><Input type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} placeholder="Paste your Topaz API key" disabled={savingKey||busy}/></Field>
    <Button type="submit" busy={savingKey} disabled={savingKey||busy||!key.trim()||!connection?.keySetup}>{savingKey?'Verifying…':w('Verify & save Topaz key')}</Button>
   </form>
   {connection?.connected&&<div><Button kind="danger-quiet" size="sm" icon={<Trash2 aria-hidden="true"/>} disabled={savingKey||busy||!!active} onClick={()=>void connect(true)}>{w('Remove Topaz key')}</Button></div>}
  </div>}
  <div className="tp-output"><Field id="topaz-size" label="Output size"><Select value={edge} disabled={busy||!!active} onChange={e=>{setEdge(Number(e.target.value));requestId.current=null}}><option value={2048}>2K</option><option value={3840}>4K</option><option value={7680}>8K</option></Select></Field><p className="tp-figure">{target?`${target.width.toLocaleString()} × ${target.height.toLocaleString()} pixels`:'Choose a saved image with known dimensions'}<span className="ds-help">Original proportions · JPEG output</span></p></div>
  {!canEnlarge&&target&&<p className="tp-warn">Choose a size larger than your {visual.width?.toLocaleString()} × {visual.height?.toLocaleString()} original.</p>}
  <div className="ds-row"><Button kind="primary" busy={busy} icon={<Maximize2 aria-hidden="true"/>} disabled={!loaded||!(connection?.connected||connection?.available)||busy||savingKey||!!active||!canEnlarge||visual.example} onClick={()=>void start()}>{active?'Upscale in progress':busy?w('Submitting to Topaz…'):'Upscale with High Fidelity 3'}</Button><CreditCost cost={topazCost(edge)} provider="topaz"/></div>
  <p className="ds-help">Starts one upscale at once. Its credits are reserved now and charged when the upscale is saved; nothing is charged if {w('Topaz')} can’t complete it. Keep this panel open to save automatically, or reopen it within seven days and refresh.</p>
  {visual.example&&<p className="ds-help">Direct upscaling is available for your saved visuals.</p>}
  {jobs.length>0&&<ul className="tp-jobs" aria-live="polite" aria-label="Upscales of this visual">{jobs.map(job=><li key={job.id} className="tp-job"><div className="tp-job-text">
   <strong>{job.width.toLocaleString()} × {job.height.toLocaleString()} · {jobWords(job)}</strong>
   {job.status==='processing'&&<div className="ds-progress" role="progressbar" aria-label={`${job.width} × ${job.height} upscale progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><span className="ds-progress-bar" style={{transform:`scaleX(${Math.max(0,Math.min(100,job.progress))/100})`}}/></div>}
   {job.status==='ready'?<CreditsUsed credits={job.credits}/>:topazActive(job.status)&&job.credits?<span className="ds-help">{job.credits} credits reserved</span>:null}
   {job.error&&<p className="ds-error"><AlertCircle aria-hidden="true"/>{w(job.error)}</p>}
  </div>{(topazActive(job.status)||job.visual)&&<div className="ds-row">{topazActive(job.status)&&<Button size="sm" icon={<RefreshCw aria-hidden="true"/>} disabled={busy||savingKey} onClick={()=>void refresh(job.id)}>Refresh status</Button>}{job.visual&&<Button size="sm" icon={<Check aria-hidden="true"/>} onClick={()=>onSaved(job.visual!)}>Open saved upscale</Button>}</div>}</li>)}</ul>}
  {notice&&<p className="tp-notice" role="status">{notice}</p>}{error&&<p className="ds-error" role="alert"><AlertCircle aria-hidden="true"/>{w(error)}</p>}{!loaded&&<div><Button disabled={busy} onClick={()=>{setError('');void load()}}>Reload connection & requests</Button></div>}
 </section>;
}
