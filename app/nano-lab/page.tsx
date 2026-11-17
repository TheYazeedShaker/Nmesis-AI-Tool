'use client';
import '@/app/lab.css';
import {Button,buttonClass} from '@/components/ds/button';
import {Field,Select} from '@/components/ds/field';
import {Fold,PageHeader,Section} from '@/components/ds/layout';
import {Banner} from '@/components/ds/shell';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {providerNames,useAccount} from '@/components/studio-account';
import {imageModelLabel,plainProviderText} from '@/lib/provider-words';
import {AccountNotices,PlanGate} from '@/components/studio-account';
import {useEffect,useRef,useState} from 'react';
import {GEMINI_IMAGE_MODELS} from '@/lib/image-models';
import {NANO_STRATEGIES,nanoReferencePrompt,type NanoAnalysis,type NanoStrategy} from '@/lib/nano-reference';
import type {Visual} from '@/lib/studio';
import {SmartReferenceLab} from '@/components/smart-reference-lab';
import {ImageDownload} from '@/components/image-download';
async function json(r:Response){const d:any=await r.json();if(!r.ok)throw new Error(d.error||'The request failed.');return d}
export default function Page(){return <PlanGate feature="studio.smart_reference"><NanoLab/></PlanGate>}
function NanoLab(){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const [visuals,setVisuals]=useState<Visual[]>([]),[selected,setSelected]=useState(''),[analysis,setAnalysis]=useState<NanoAnalysis|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[size,setSize]=useState('2048x1152'),[model,setModel]=useState<string>(GEMINI_IMAGE_MODELS[0].id),[strategy,setStrategy]=useState<NanoStrategy>('detail'),[results,setResults]=useState<Visual[]>([]);const running=useRef(false);const [smartBusy,setSmartBusy]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/visuals').then(json).then(d=>{if(!active)return;const all=d.visuals as Visual[];setVisuals(all);const eligible=all.filter(v=>v.status==='ready'&&v.sourceId&&v.moodId&&!v.lineup&&!v.nanoStrategy&&!v.smartTest);const wanted=new URLSearchParams(location.search).get('visual'),target=all.find(v=>v.id===wanted);setSelected(eligible.find(v=>v.id===wanted)?.id||eligible.find(v=>target&&v.sourceId===target.sourceId&&v.moodId===target.moodId)?.id||eligible[0]?.id||'');setResults(all.filter(v=>!!v.nanoStrategy))}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
 const pair=visuals.find(v=>v.id===selected),eligible=visuals.filter(v=>v.status==='ready'&&v.sourceId&&v.moodId&&!v.lineup&&!v.nanoStrategy&&!v.smartTest),matches=results.filter(v=>v.sourceId===pair?.sourceId&&v.moodId===pair?.moodId);
 async function inspect(){if(!pair||running.current)return;running.current=true;setBusy('Inspecting the car and inspiration…');setError('');try{const d=await json(await fetch('/api/google/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:pair.sourceId,moodId:pair.moodId})}));setAnalysis(d.analysis)}catch(e){setError((e as Error).message)}finally{running.current=false;setBusy('')}}
 async function generate(batch=false){if(!pair||running.current)return;if(!analysis&&(batch||strategy!=='baseline')){setError('Inspect this pair first.');return}running.current=true;setError('');
  const jobs=batch?GEMINI_IMAGE_MODELS.flatMap(m=>NANO_STRATEGIES.map(s=>({model:m.id,strategy:s.id}))):[{model,strategy}];
  for(let i=0;i<jobs.length;i++){
   const job=jobs[i],label=(showNames?GEMINI_IMAGE_MODELS.find(m=>m.id===job.model)!.label:imageModelLabel(job.model))+' · '+NANO_STRATEGIES.find(s=>s.id===job.strategy)!.label,id=crypto.randomUUID();setBusy(`Generating ${i+1} of ${jobs.length}: ${label}…`);
   const pending:Visual={id,title:'Reference test · '+imageModelLabel(job.model)+' · '+NANO_STRATEGIES.find(s=>s.id===job.strategy)!.label,src:'',status:'pending',createdAt:new Date().toISOString(),provider:'google',model:job.model,nanoStrategy:job.strategy,sourceId:pair.sourceId,moodId:pair.moodId,size};setResults(v=>[pending,...v]);
   try{const d=await json(await fetch('/api/google/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending,referenceMode:'match-inspiration',brief:'Use only the two references to create one finished automotive photograph.',vehicle:pair.vehicle,finish:pair.finish,angle:pair.angle,nanoStrategy:job.strategy,analysisId:analysis?.id})}));setResults(v=>v.map(x=>x.id===id?d.visual:x))}
   catch(e){const message=(e as Error).message;setResults(v=>v.map(x=>x.id===id?{...x,status:'failed',error:message}:x));setError(message+' Testing stopped; no remaining requests were submitted. Check saved visuals before trying again.');break}
  }
  running.current=false;setBusy('');
 }
 const off=!!busy||smartBusy;
 return <WorkspaceFrame current="lab" notices={<AccountNotices variant="ds"/>}>
  <PageHeader eyebrow="Reference lab" title="Keep the car. Match the shot." lede={w('Try an image-specific smart prompt, or open your original Nano Banana approaches below. Your existing prompts are unchanged.')}/>
  <div className="lab">
   <Section>
    <Field label="Reference pair"><Select value={selected} disabled={off} onChange={e=>{setSelected(e.target.value);setAnalysis(null);setError('')}}>{eligible.map(v=><option key={v.id} value={v.id}>{v.title} · {v.id.slice(0,8)}</option>)}</Select></Field>
    {!eligible.length&&<p className="ds-help">No key visual has both a car and an inspiration picture yet. Make one in Key visual, then come back.</p>}
    {pair&&<div className="lab-pair">
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
     <figure><img crossOrigin="anonymous" src={'/api/assets/'+pair.sourceId} alt="Lab configurator reference"/><figcaption className="ds-help">1 · Configurator car: identity source</figcaption></figure>
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
     <figure><img crossOrigin="anonymous" src={'/api/assets/'+pair.moodId} alt="Lab inspiration reference"/><figcaption className="ds-help">2 · Inspiration: scene and camera</figcaption></figure>
    </div>}
   </Section>
   <SmartReferenceLab pair={pair} initialResults={visuals} onBusy={setSmartBusy} disabled={!!busy}/>
   <Fold name="nano-lab-original" title={w('Original Nano Banana approaches')} summary="Unchanged">
    <div className="lab-stack">
     <div className="lab-actions"><Button kind="primary" disabled={!pair||off} onClick={()=>void inspect()}>Inspect references & build prompts</Button></div>
     <p className="ds-help">{w('Uses your saved Google key for a paid image analysis. An existing inspection of the same pair is reused. This button does not generate images.')}</p>
     {analysis?.detailRegions&&pair&&<figure className="lab-anchors"><figcaption className="ds-help">Detected detail anchors: check that each box covers the intended car part</figcaption><div className="lab-anchors-frame">
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
      <img crossOrigin="anonymous" src={'/api/assets/'+pair.sourceId} alt="Detected car details"/>
      {analysis.detailRegions.map((r,i)=><div key={i} className="lab-anchor" style={{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}}><span>{i+3} · {r.label}</span></div>)}</div></figure>}
     {analysis&&<section className="lab-card" aria-label="What the model sees"><h3 className="ds-label">What the model sees</h3><p><strong>Capture advice:</strong> {analysis.captureAdvice}</p><h4 className="ds-label">Conflicts to review</h4><ul className="lab-bullets">{analysis.conflicts.map((v,i)=><li key={i}>{v}</li>)}</ul>
      <details className="lab-details"><summary>Car identity checklist</summary><ul className="lab-bullets">{analysis.carDetails.map((v,i)=><li key={i}>{v}</li>)}</ul></details>
      <details className="lab-details"><summary>Inspiration checklist</summary><ul className="lab-bullets">{analysis.sceneDetails.map((v,i)=><li key={i}>{v}</li>)}</ul></details>
      <p className="ds-help">These are AI observations. Compare them against the images; uncertain or hidden details cannot be confirmed.</p></section>}
     <div className="lab-row">
      <Field label="Model"><Select value={model} disabled={off} onChange={e=>setModel(e.target.value)}>{GEMINI_IMAGE_MODELS.map(m=><option key={m.id} value={m.id}>{showNames?m.label:imageModelLabel(m.id)}</option>)}</Select></Field>
      <Field label="Approach" help={NANO_STRATEGIES.find(s=>s.id===strategy)?.description}><Select value={strategy} disabled={off} onChange={e=>setStrategy(e.target.value as NanoStrategy)}>{NANO_STRATEGIES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
      <Field label="Resolution"><Select value={size} disabled={off} onChange={e=>setSize(e.target.value)}><option value="1024x576">1K</option><option value="2048x1152">2K</option><option value="3840x2160">4K</option></Select></Field>
     </div>
     {(analysis||strategy==='baseline')&&<details className="lab-details"><summary>Preview generated prompt</summary><pre>{nanoReferencePrompt(strategy,analysis||undefined,'Use only the two references to create one finished automotive photograph.')}</pre></details>}
     <div className="lab-actions"><Button kind="primary" disabled={!pair||off||strategy!=='baseline'&&!analysis} onClick={()=>void generate()}>Generate selected approach · 1 paid image</Button><Button disabled={!pair||off||!analysis} onClick={()=>void generate(true)}>Compare all approaches · 8 paid images</Button></div>
     <p className="ds-help">Both models use the same references, brief and resolution. Each result is saved in your key visuals. Tests start fresh from the original references. Keep this page open during a comparison; failed requests are never automatically retried.</p>
     {busy&&<p className="ds-help" role="status">{busy}</p>}{error&&<Banner kind="bad">{error}</Banner>}
     <h3 className="ds-section-title">Comparison results</h3>
     <p className="ds-help">Inspect grille and lamps, wheels, window line and body proportions first. Then check architecture, people, camera and lighting. Car first asks to retain the configurator viewpoint; verify that the model actually follows it.</p>
     {matches.length>0&&<div className="lab-grid">{matches.map(v=><article className="lab-card" key={v.id}><h4 className="ds-label">{v.title}</h4><p className="ds-help">{v.size} · {v.status}</p>{v.status==='ready'?<>
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
      <a href={v.src} target="_blank" rel="noreferrer"><img crossOrigin="anonymous" src={v.src} alt={v.title}/></a><ImageDownload src={v.src} name={v.title} label="Download" className={buttonClass({kind:'quiet',size:'sm'})}/><details className="lab-details"><summary>Exact generation prompt</summary><pre>{v.prompt}</pre></details></>:<p className="ds-help">{v.error||'Generating…'}</p>}</article>)}</div>}
    </div>
   </Fold>
  </div>
 </WorkspaceFrame>;
}
