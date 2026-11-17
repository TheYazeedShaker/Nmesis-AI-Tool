'use client';
import {providerNames,useAccount} from '@/components/studio-account';
import {imageModelLabel,plainProviderText} from '@/lib/provider-words';

import {CreditCost} from '@/components/credits';
import {Button,buttonClass} from '@/components/ds/button';
import {Field,Select,Textarea} from '@/components/ds/field';
import {Section} from '@/components/ds/layout';
import {Banner} from '@/components/ds/shell';
import {studioFetch} from '@/lib/studio-fetch';
import {useEffect,useRef,useState} from 'react';
import {GEMINI_IMAGE_MODELS,OPENAI_IMAGE_MODELS,OPENAI_IMAGE_MODEL} from '@/lib/image-models';
import {SMART_OPTIONS,type SmartPriority,type SmartPlan} from '@/lib/smart-reference';
import type {Visual} from '@/lib/studio';
import {SmartControls,SmartPlanView,SmartReviewView} from './smart-reference';
import {submitSmartImage} from '@/lib/smart-reference-client';
import {ImageDownload} from './image-download';
async function json(r:Response){const d:any=await r.json();if(!r.ok)throw new Error(d.error||'The request failed.');return d}
export function SmartReferenceLab({pair,initialResults,onBusy,disabled=false}:{pair?:Visual;initialResults:Visual[];onBusy:(busy:boolean)=>void;disabled?:boolean}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const [priority,setPriority]=useState<SmartPriority|null>('balanced'),[model,setModel]=useState<string>(OPENAI_IMAGE_MODEL),[size,setSize]=useState('2048x1152'),[brief,setBrief]=useState('Use the supplied car and inspiration to create a finished automotive photograph.'),[plan,setPlan]=useState<SmartPlan|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[results,setResults]=useState<Visual[]>([]);const running=useRef(false);
 useEffect(()=>{setPlan(null);setError('')},[pair?.id,model,size,brief,priority]);
 useEffect(()=>{setResults(initialResults.filter(v=>v.smartTest))},[initialResults]);
 useEffect(()=>{if(!busy)return;const stop=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',stop);return()=>window.removeEventListener('beforeunload',stop)},[busy]);
 const provider=OPENAI_IMAGE_MODELS.some(m=>m.id===model)?'openai':'google';
 async function prepare(p:SmartPriority){const data=await json(await studioFetch('/api/smart-prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:pair!.sourceId,moodId:pair!.moodId,brief,provider,model,size,priority:p})}));setPlan(data.plan);return data.plan as SmartPlan}
 async function run(generate=false,compare=false){if(disabled||running.current||!pair||!priority)return;running.current=true;onBusy(true);setError('');
 try{for(const choice of compare?SMART_OPTIONS.map(x=>x.id):[priority]){setBusy('Analyzing references and preparing the '+SMART_OPTIONS.find(x=>x.id===choice)!.label+' prompt…');const current=await prepare(choice);if(!generate)break;
 const id=crypto.randomUUID(),title='Smart test · '+([...OPENAI_IMAGE_MODELS,...GEMINI_IMAGE_MODELS].find(m=>m.id===model)?.label)+' · '+SMART_OPTIONS.find(x=>x.id===choice)!.label;
 setBusy('Generating '+title+'…');const pending:Visual={id,title,src:'',status:'pending',createdAt:new Date().toISOString(),sourceId:pair.sourceId,moodId:pair.moodId,smartPlanId:current.id,smartPriority:choice,smartTest:true,provider,model,size};setResults(v=>[pending,...v]);
 let image:Visual;try{const d=await submitSmartImage(provider==='openai'?'/api/generate':'/api/google/generate',{...pending,brief,referenceMode:'match-inspiration',vehicle:pair.vehicle,finish:pair.finish,angle:pair.angle});image=d.visual;setResults(v=>v.map(x=>x.id===id?image:x))}catch(e){setResults(v=>v.map(x=>x.id===id?{...x,status:'failed',error:(e as Error).message}:x));throw e}
 setBusy('Image saved. Checking car details and inspiration…');try{const d=await json(await studioFetch('/api/smart-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}));setResults(v=>v.map(x=>x.id===id?d.visual:x))}catch(e){setResults(v=>v.map(x=>x.id===id?{...x,smartReview:{status:'failed',error:(e as Error).message}}:x))}
 }}catch(e){setError((e as Error).message+' No automatic retry was made.')}finally{running.current=false;setBusy('');onBusy(false)}}
 async function checkDetails(id:string){if(running.current||disabled)return;running.current=true;onBusy(true);setBusy('Checking saved image details…');setError('');try{const d=await json(await studioFetch('/api/smart-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}));setResults(v=>v.map(x=>x.id===id?d.visual:x))}catch(e){setError((e as Error).message)}finally{running.current=false;onBusy(false);setBusy('')}}
 const matches=results.filter(v=>v.sourceId===pair?.sourceId&&v.moodId===pair?.moodId);
 return <Section title="Let the references write the prompt" className="lab-smart">
  <p className="ds-help">{w('Choose one direction. OpenAI prepares a specific prompt from the two images, then your chosen model renders it.')}</p>
  <SmartControls value={priority} onChange={setPriority} disabled={disabled||!!busy}/>
  {priority&&<>
   <div className="lab-row">
    <Field label="Image model"><Select disabled={disabled||!!busy} value={model} onChange={e=>setModel(e.target.value)}>{OPENAI_IMAGE_MODELS.map(m=><option key={m.id} value={m.id}>{showNames?m.label:imageModelLabel(m.id)}</option>)}{GEMINI_IMAGE_MODELS.map(m=><option key={m.id} value={m.id}>{showNames?m.label:imageModelLabel(m.id)}</option>)}</Select></Field>
    <Field label="Size"><Select disabled={disabled||!!busy} value={size} onChange={e=>setSize(e.target.value)}><option value="2048x1152">2K</option><option value="3840x2160">4K</option></Select></Field>
   </div>
   <Field label="Your idea" id="smart-lab-brief"><Textarea value={brief} maxLength={2000} rows={4} disabled={disabled||!!busy} onChange={e=>setBrief(e.target.value)}/></Field>
   <div className="lab-actions">
    <Button disabled={disabled||!pair||!!busy} onClick={()=>void run()}>Prepare & preview prompt</Button>
    <Button kind="primary" disabled={disabled||!pair||!!busy} onClick={()=>void run(true)}>Generate smart visual · 1 paid image</Button>
    <Button disabled={disabled||!pair||!!busy} onClick={()=>void run(true,true)}>Compare 3 priorities · 3 paid images</Button>
   </div>
   <p className="ds-help">{w('Planning and checks also use paid OpenAI requests.')} Comparisons use the same originals, idea, model and size. Keep this page open; no automatic image retries.</p>
  </>}
  {busy&&<p className="ds-help" role="status">{busy}</p>}
  {error&&<Banner kind="bad">{error}</Banner>}
  {plan&&<SmartPlanView plan={plan}/>}
  {matches.length>0&&<div className="lab-grid">{matches.map(v=><article className="lab-card" key={v.id}><h3 className="ds-label">{v.title}</h3><p className="ds-help">{v.width?`${v.width} × ${v.height}`:v.size} · {v.status}</p>
   {v.status==='ready'?<>
    {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    <img crossOrigin="anonymous" src={v.src} alt={v.title}/><ImageDownload src={v.src} name={v.title} label="Download" className={buttonClass({kind:'quiet',size:'sm'})}/><SmartReviewView review={v.smartReview}/>
    {!v.smartReview&&<Button size="sm" disabled={disabled||!!busy} onClick={()=>void checkDetails(v.id)}>Check details · <CreditCost cost="openai.text" provider="openai"/></Button>}
    <details className="lab-details"><summary>Exact generation prompt</summary><pre>{v.prompt}</pre></details></>
   :<p className="ds-help">{v.error||'Generating…'}</p>}</article>)}</div>}
 </Section>;
}
