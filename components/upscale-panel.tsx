"use client";
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText,upscaleModelLabel} from '@/lib/provider-words';
import {studioFetch} from '@/lib/studio-fetch';
import {TopazUpscale} from '@/components/topaz-upscale';
import {ImageDownload} from '@/components/image-download';
import {useRef,useState,useEffect} from 'react';
import {AlertCircle,Check,Copy,ExternalLink,Upload} from 'lucide-react';
import {Button,buttonClass} from '@/components/ds/button';
import {Field,Select} from '@/components/ds/field';
import {Badge} from '@/components/ds/feedback';
import {UPSCALE_MODELS,HIGGSFIELD_UPSCALE_URL,upscaleModel,upscaleTarget,upscaleInstructions,type UpscaleModelId} from '@/lib/upscale-models';
import type {Visual} from '@/lib/studio';

// Item 7b: on the design system (app/panels.css). The direct upscale first, with
// its cost before it starts; the other upscalers (own-key companies and staff
// only: they name their providers) fold away below it.
export function UpscalePanel({visual,onSaved}:{visual:Visual;onSaved:(visual:Visual)=>void}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
  const [modelId,setModelId]=useState<UpscaleModelId>('topaz-high-fidelity');
  const [edge,setEdge]=useState(3840),[all,setAll]=useState(false),[copied,setCopied]=useState(false);
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[dimensions,setDimensions]=useState<{width:number;height:number}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null),lock=useRef(false);
  useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  const model=upscaleModel(modelId);
  const target=visual.width&&visual.height?upscaleTarget(visual.width,visual.height,edge):null;
  const settings=target?upscaleInstructions(modelId,target.width,target.height):`Model: ${showNames?model.label:upscaleModelLabel(model)}. Keep the original aspect ratio. Select ${edge===2048?'2K':edge===3840?'4K':'8K'} output.`;
  const canEnlarge=!visual.width||!visual.height||edge>Math.max(visual.width,visual.height);
  async function copy(){try{await navigator.clipboard.writeText(settings);setCopied(true)}catch{setError('Copy the settings from the text below.')}}
  function choose(id:UpscaleModelId){setModelId(id);setCopied(false);if(id==='bytedance'&&edge===7680)setEdge(3840)}
  function receive(next?:File){setError('');setDimensions(null);setFile(null);if(!next)return;if(!['image/png','image/jpeg','image/webp'].includes(next.type)||next.size>30_000_000){setError('Choose a PNG, JPEG or WebP under 30 MB.');return}setFile(next)}
  async function save(){if(!file||!dimensions||lock.current)return;lock.current=true;setBusy(true);setError('');try{
    const form=new FormData();form.append('image',file);form.append('parentId',visual.id);form.append('model',modelId);
    const r=await studioFetch('/api/upscale-import',{method:'POST',body:form});const d=await r.json() as {error?:string;visual?:Visual};if(!r.ok)throw new Error(d.error||'The image could not be saved.');if(!d.visual)throw new Error('The saved image could not be confirmed. Refresh your library before importing again.');onSaved(d.visual);
  }catch(e){setError((e as Error).message||'The connection was interrupted. Your file is still selected.')}finally{lock.current=false;setBusy(false)}}
  return <section className="tool-panel tp-framed" aria-label="Upscale image options">
    <TopazUpscale visual={visual} onSaved={onSaved}/>
    {showNames&&<details className="tp-details tp-alternatives"><summary>{w('Other upscalers · finish in Higgsfield')}</summary>
    <div className="tool-panel">
    <div className="tp-head tp-head-row"><div className="tp-head"><h3 className="tp-title">More detail. Same car.</h3><p className="ds-help">Choose an upscaler for this approved visual.</p></div><Badge kind="info">{w('Finish in Higgsfield')}</Badge></div>
    <p className="ds-help">These upscalers aren’t connected to the studio’s API key. Download this image, upscale it in Higgsfield, then import the result below. Higgsfield uses its separate website credits; the studio’s API budget does not cover that spend.</p>
    <div className="tp-choices" role="group" aria-label="Upscaling model">
      {(all?UPSCALE_MODELS:UPSCALE_MODELS.slice(0,3)).map(m=><button type="button" key={m.id} className="tp-choice" aria-pressed={m.id===modelId} onClick={()=>choose(m.id)} disabled={busy}>
        <span className="tp-choice-name">{showNames?m.label:upscaleModelLabel(m)}{m.id===modelId&&<Check aria-hidden="true"/>}</span>
        {'recommended' in m&&<Badge kind="accent">{m.recommended}</Badge>}
        <span className="ds-help">{w(m.description)}</span><span className="tp-choice-family">{m.family}</span>
      </button>)}
    </div>
    <div><Button size="sm" kind="quiet" aria-expanded={all} onClick={()=>setAll(!all)}>{all?'Show recommended choices':'Show all 10 upscaling options'}</Button></div>
    <div className="tp-output"><Field id="upscale-size" label="Target size"><Select value={edge} disabled={busy} onChange={e=>{setEdge(Number(e.target.value));setCopied(false)}}><option value={2048}>2K</option><option value={3840}>4K</option>{modelId!=='bytedance'&&<option value={7680}>8K</option>}</Select></Field><p className="tp-figure">{target?`${target.width.toLocaleString()} × ${target.height.toLocaleString()} pixels`:'Keep the original image shape'}<span className="ds-help">{w('Original proportions preserved · confirm size limits in Higgsfield')}</span></p></div>
    {!canEnlarge&&<p className="tp-warn">Your original is already this size or larger. Choose a larger target to increase its resolution.</p>}
    {model.family==='Generative'&&<p className="tp-warn">Creative reconstruction may change wheels, badges, lights or body shape. For an approved car, start with High Fidelity V2.</p>}
    <div className="tp-step"><h4 className="tp-subtitle">{w('1. Take your image to Higgsfield')}</h4>
      <div className="ds-row"><ImageDownload key={visual.id} src={visual.src} name={visual.title} label="Download original" className={buttonClass({})}/><Button icon={<Copy aria-hidden="true"/>} onClick={()=>void copy()}>{copied?'Settings copied':'Copy settings'}</Button><a className={buttonClass({})} href={HIGGSFIELD_UPSCALE_URL} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true"/>{w('Open Higgsfield Upscale')}<span className="ds-sr-only"> (opens in a new tab)</span></a></div>
      <p className="ds-help">{w('Upload the downloaded image there, then choose the model and size above. Opening Higgsfield does not transfer this image or apply these settings.')}</p>
      <details className="tp-details"><summary>View settings to use</summary><pre className="tp-pre">{settings}</pre></details></div>
    <div className="tp-step"><h4 className="tp-subtitle">2. Bring the enlarged image back</h4><p className="ds-help">Save a separate version in your library and compare it with the original. The model label records your selection; the studio cannot verify which model processed an uploaded file.</p>
      <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{receive(e.target.files?.[0]);e.target.value=''}}/>
      <div><Button disabled={busy||visual.example} icon={<Upload aria-hidden="true"/>} onClick={()=>input.current?.click()}>{file?'Choose another result':'Import enlarged image'}</Button></div>
      {visual.example&&<p className="ds-help">Import is available for your saved visuals. You can still download and upscale this example.</p>}
      {preview&&<div className="tp-preview">{/* eslint-disable-next-line @next/next/no-img-element -- a local file being reviewed */}
       <img crossOrigin="anonymous" src={preview} alt="Enlarged image to review" onError={()=>{setError('This image cannot be opened. Choose another file.');setDimensions(null)}} onLoad={e=>{const {naturalWidth:width,naturalHeight:height}=e.currentTarget;if(visual.width&&visual.height&&(width<=visual.width||height<=visual.height)){setError('This image must be larger than the original.');setDimensions(null)}else if(visual.width&&visual.height&&Math.abs(width/height-visual.width/visual.height)/(visual.width/visual.height)>.01){setError('The image shape changed. Export with the original aspect ratio.');setDimensions(null)}else{setDimensions({width,height});setError('')}}}/><p className="tp-figure">{dimensions?`${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} pixels · actual file size`:file?.name}</p><Button kind="primary" busy={busy} disabled={busy||!dimensions} icon={<Check aria-hidden="true"/>} onClick={()=>void save()}>{busy?'Saving enlarged image…':'Save enlarged version'}</Button></div>}
    </div>
    {error&&<p className="ds-error" role="alert"><AlertCircle aria-hidden="true"/>{error}</p>}
    </div>
    </details>}
  </section>
}
