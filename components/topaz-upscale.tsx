'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {LoaderCircle,Maximize2,KeyRound,Check} from 'lucide-react';
import {topazActive,type TopazConnectionStatus,type TopazJob} from '@/lib/topaz';
import {upscaleTarget} from '@/lib/upscale-models';
import type {Visual} from '@/lib/studio';
type Reply={error?:string;job:TopazJob;jobs:TopazJob[]}&TopazConnectionStatus;
async function responseJson(r:Response):Promise<Reply>{const d=await r.json() as Reply;if(!r.ok)throw new Error(d.error||'The Topaz request could not be completed.');return d}
export function TopazUpscale({visual,onSaved}:{visual:Visual;onSaved:(v:Visual)=>void}){
 const [connection,setConnection]=useState<TopazConnectionStatus|null>(null),[jobs,setJobs]=useState<TopazJob[]>([]),[loaded,setLoaded]=useState(false);
 const [key,setKey]=useState(''),[settings,setSettings]=useState(false),[savingKey,setSavingKey]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[edge,setEdge]=useState(3840);
 const lock=useRef(false),requestId=useRef<string|null>(null),mounted=useRef(true);
 const target=visual.width&&visual.height?upscaleTarget(visual.width,visual.height,edge):null;
 const active=jobs.find(j=>topazActive(j.status));
 const canEnlarge=!!target&&edge>Math.max(visual.width!,visual.height!);
 const load=useCallback(async()=>{
  try{const [c,j]=await Promise.all([fetch('/api/topaz/connection').then(responseJson),visual.example?Promise.resolve({jobs:[]}):fetch('/api/topaz/jobs?parentId='+encodeURIComponent(visual.id)).then(responseJson)]);if(mounted.current){setConnection(c);setJobs(j.jobs);setLoaded(true)}}catch(e){if(mounted.current)setError((e as Error).message)}
 },[visual.id,visual.example]);
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false}},[load]);
 const refresh=useCallback(async(id:string)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const d=await fetch('/api/topaz/jobs/'+id,{method:'POST',signal:AbortSignal.timeout(110000)}).then(responseJson);if(mounted.current){setJobs(js=>js.map(j=>j.id===id?d.job:j));if(d.job.status==='ready'&&d.job.visual)onSaved(d.job.visual)}}catch(e){if(mounted.current)setError((e as Error).name==='TimeoutError'?'Checking took too long. Use Refresh status; no new upscale will be submitted.':(e as Error).message)}finally{lock.current=false;if(mounted.current)setBusy(false)}
 },[onSaved]);
 useEffect(()=>{
  if(!active||error||busy||!['queued','processing','archiving'].includes(active.status))return;
  const timer=setTimeout(()=>void refresh(active.id),6000);return()=>clearTimeout(timer);
 },[active,error,busy,refresh]);
 async function connect(remove=false){
  if(savingKey)return;setSavingKey(true);setError('');setNotice('');
  try{const d=await fetch('/api/topaz/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},...remove?{}:{body:JSON.stringify({key:key.trim()})}}).then(responseJson);if(remove){setConnection(c=>c?{...c,connected:false}:null);setNotice('Topaz key removed.')}else{setConnection(d);setSettings(false);setNotice('Topaz connected. '+d.credits+' API credits available. Verification did not spend credits.')}}catch(e){setError((e as Error).message)}finally{setKey('');setSavingKey(false)}
 }
 async function start(){
  if(lock.current||!canEnlarge||active||!loaded)return;lock.current=true;setBusy(true);setError('');setNotice('');
  requestId.current??=crypto.randomUUID();
  try{const d=await fetch('/api/topaz/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,parentId:visual.id,edge}),signal:AbortSignal.timeout(65000)}).then(responseJson);if(mounted.current){setJobs(js=>[d.job,...js.filter(j=>j.id!==d.job.id)]);requestId.current=null}}catch(e){if(mounted.current){setError((e as Error).name==='TimeoutError'?'Submission is taking longer than expected. Reload status before trying again.':(e as Error).message);setLoaded(false);await load()}}finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 return <section className="topaz-direct" aria-label="Topaz High Fidelity 3 upscale">
  <div className="upscale-heading"><div><h3>Topaz Gigapixel · High Fidelity 3</h3><p>Enlarge your finished visual, right here.</p></div><span className="upscale-recommended">Recommended for car visuals</span></div>
  <p className="helper">Preserve the car’s structure and natural texture with gentle sharpening. Your original stays in the library.</p>
  <button className="secondary" onClick={()=>{setKey('');setSettings(!settings)}} disabled={busy||savingKey}><KeyRound size={16}/>{connection?.connected?'Manage Topaz connection':'Connect Topaz API'}</button>
  {(settings||loaded&&!connection?.connected)&&<div className="topaz-connection">
   <p className="helper">Create a key in your <a href="https://account.topazlabs.com/manage-api" target="_blank" rel="noreferrer">Topaz API account ↗</a>. API credits are separate from Higgsfield and desktop subscriptions.</p>
   <form onSubmit={e=>{e.preventDefault();void connect()}}><label className="field-label" htmlFor="topaz-api-key">Topaz API key</label><input id="topaz-api-key" className="text-input" type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} placeholder="Paste your Topaz API key" disabled={savingKey||busy}/><p className="helper">Encrypted for your signed-in account. Never stored in browser storage or displayed again.</p><button className="secondary" disabled={savingKey||busy||!key.trim()||!connection?.keySetup}>{savingKey?'Verifying…':'Verify & save Topaz key'}</button></form>
   {connection?.connected&&<button className="remove-key" disabled={savingKey||busy||!!active} onClick={()=>void connect(true)}>Remove Topaz key</button>}
  </div>}
  <div className="upscale-output"><label htmlFor="topaz-size">Output size<select id="topaz-size" value={edge} disabled={busy||!!active} onChange={e=>{setEdge(Number(e.target.value));requestId.current=null}}><option value={2048}>2K</option><option value={3840}>4K</option><option value={7680}>8K</option></select></label><p>{target?`${target.width.toLocaleString()} × ${target.height.toLocaleString()} pixels`:'Choose a saved image with known dimensions'}<small>Original proportions · JPEG output</small></p></div>
  {!canEnlarge&&target&&<p className="helper">Choose a size larger than your {visual.width?.toLocaleString()} × {visual.height?.toLocaleString()} original.</p>}
  <button className="generate" disabled={!loaded||!connection?.connected||busy||savingKey||!!active||!canEnlarge||visual.example} onClick={()=>void start()}>{busy?<LoaderCircle size={17} className="spin"/>:<Maximize2 size={17}/>} {active?'Upscale in progress':busy?'Submitting to Topaz…':'Upscale with High Fidelity 3'}</button>
  <p className="helper">Starts one paid Topaz request immediately. Billed in Topaz API credits; your Higgsfield daily limit does not apply. Keep this panel open to save automatically, or reopen it within seven days and refresh.</p>
  {visual.example&&<p className="helper">Direct upscaling is available for your saved visuals.</p>}
  {jobs.length>0&&<div className="topaz-jobs" aria-live="polite">{jobs.map(job=><div key={job.id} className="topaz-job"><div><strong>{job.width.toLocaleString()} × {job.height.toLocaleString()} · {job.status==='ready'?'Saved':job.status==='archiving'?'Saving image':job.status==='queued'?'Queued':job.status==='processing'?`Upscaling · ${job.progress}%`:job.status==='submitting'?'Submitting':job.status==='unknown'?'Check submission':job.status==='failed'?'Could not upscale':'Cancelled'}</strong>{job.credits!==undefined&&<small>{job.credits} Topaz credits</small>}{job.error&&<p className="field-error">{job.error}</p>}</div>{topazActive(job.status)&&<button className="secondary" disabled={busy||savingKey} onClick={()=>void refresh(job.id)}>Refresh status</button>}{job.visual&&<button className="secondary" onClick={()=>onSaved(job.visual!)}><Check size={16}/>Open saved upscale</button>}</div>)}</div>}
  {notice&&<p className="key-notice" role="status">{notice}</p>}{error&&<p className="field-error" role="alert">{error}</p>}{!loaded&&<button className="secondary" disabled={busy} onClick={()=>{setError('');void load()}}>Reload connection & requests</button>}
 </section>;
}
