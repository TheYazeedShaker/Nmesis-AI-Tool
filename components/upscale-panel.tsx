"use client";
import {studioFetch} from '@/lib/studio-fetch';
import {TopazUpscale} from '@/components/topaz-upscale';
import {ImageDownload} from '@/components/image-download';
import {useRef,useState,useEffect} from 'react';
import {Check,Copy,Download,ExternalLink,Upload,LoaderCircle} from 'lucide-react';
import {UPSCALE_MODELS,HIGGSFIELD_UPSCALE_URL,upscaleModel,upscaleTarget,upscaleInstructions,type UpscaleModelId} from '@/lib/upscale-models';
import type {Visual} from '@/lib/studio';

export function UpscalePanel({visual,onSaved}:{visual:Visual;onSaved:(visual:Visual)=>void}){
  const [modelId,setModelId]=useState<UpscaleModelId>('topaz-high-fidelity');
  const [edge,setEdge]=useState(3840),[all,setAll]=useState(false),[copied,setCopied]=useState(false);
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[dimensions,setDimensions]=useState<{width:number;height:number}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null),lock=useRef(false);
  useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  const model=upscaleModel(modelId);
  const target=visual.width&&visual.height?upscaleTarget(visual.width,visual.height,edge):null;
  const settings=target?upscaleInstructions(modelId,target.width,target.height):`Model: ${model.label}. Keep the original aspect ratio. Select ${edge===2048?'2K':edge===3840?'4K':'8K'} output.`;
  const canEnlarge=!visual.width||!visual.height||edge>Math.max(visual.width,visual.height);
  async function copy(){try{await navigator.clipboard.writeText(settings);setCopied(true)}catch{setError('Copy the settings from the text below.')}}
  function choose(id:UpscaleModelId){setModelId(id);setCopied(false);if(id==='bytedance'&&edge===7680)setEdge(3840)}
  function receive(next?:File){setError('');setDimensions(null);setFile(null);if(!next)return;if(!['image/png','image/jpeg','image/webp'].includes(next.type)||next.size>30_000_000){setError('Choose a PNG, JPEG or WebP under 30 MB.');return}setFile(next)}
  async function save(){if(!file||!dimensions||lock.current)return;lock.current=true;setBusy(true);setError('');try{
    const form=new FormData();form.append('image',file);form.append('parentId',visual.id);form.append('model',modelId);
    const r=await studioFetch('/api/upscale-import',{method:'POST',body:form});const d=await r.json() as {error?:string;visual?:Visual};if(!r.ok)throw new Error(d.error||'The image could not be saved.');if(!d.visual)throw new Error('The saved image could not be confirmed. Refresh your library before importing again.');onSaved(d.visual);
  }catch(e){setError((e as Error).message||'The connection was interrupted. Your file is still selected.')}finally{lock.current=false;setBusy(false)}}
  return <section className="upscale-panel" aria-label="Upscale image options">
    <TopazUpscale visual={visual} onSaved={onSaved}/>
    <details className="upscale-alternatives"><summary>Other upscalers · finish in Higgsfield</summary>
    <div className="upscale-heading"><div><h3>More detail. Same car.</h3><p>Choose an upscaler for this approved visual.</p></div><span className="upscale-external">Finish in Higgsfield</span></div>
    <p className="upscale-connection">These upscalers aren’t connected to the studio’s API key. Download this image, upscale it in Higgsfield, then import the result below. Higgsfield uses its separate website credits; the studio’s API budget does not cover that spend.</p>
    <div className="upscale-models" role="group" aria-label="Upscaling model">
      {(all?UPSCALE_MODELS:UPSCALE_MODELS.slice(0,3)).map(m=><button type="button" key={m.id} className={'upscale-model '+(m.id===modelId?'selected':'')} aria-pressed={m.id===modelId} onClick={()=>choose(m.id)} disabled={busy}>
        <span className="upscale-model-name">{m.label}{m.id===modelId&&<Check size={16}/>}</span>
        {'recommended' in m&&<span className="upscale-recommended">{m.recommended}</span>}
        <small>{m.description}</small><span className="upscale-family">{m.family}</span>
      </button>)}
    </div>
    <button type="button" className="text-button" onClick={()=>setAll(!all)}>{all?'Show recommended choices':'Show all 10 upscaling options'}</button>
    <div className="upscale-output"><label htmlFor="upscale-size">Target size<select id="upscale-size" value={edge} disabled={busy} onChange={e=>{setEdge(Number(e.target.value));setCopied(false)}}><option value={2048}>2K</option><option value={3840}>4K</option>{modelId!=='bytedance'&&<option value={7680}>8K</option>}</select></label><p>{target?`${target.width.toLocaleString()} × ${target.height.toLocaleString()} pixels`:'Keep the original image shape'}<small>Original proportions preserved · confirm size limits in Higgsfield</small></p></div>
    {!canEnlarge&&<p className="upscale-warning">Your original is already this size or larger. Choose a larger target to increase its resolution.</p>}
    {model.family==='Generative'&&<p className="upscale-warning">Creative reconstruction may change wheels, badges, lights or body shape. For an approved car, start with High Fidelity V2.</p>}
    <div className="upscale-steps"><div><h4>1. Take your image to Higgsfield</h4><div className="upscale-controls"><ImageDownload key={visual.id} src={visual.src} name={visual.title} label="Download original" className="secondary"/><button className="secondary" onClick={()=>void copy()}><Copy size={16}/>{copied?'Settings copied':'Copy settings'}</button><a className="primary" href={HIGGSFIELD_UPSCALE_URL} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open Higgsfield Upscale</a></div><p className="helper">Upload the downloaded image there, then choose the model and size above. Opening Higgsfield does not transfer this image or apply these settings.</p><details><summary>View settings to use</summary><pre>{settings}</pre></details></div>
    <div><h4>2. Bring the enlarged image back</h4><p className="helper">Save a separate version in your library and compare it with the original. The model label records your selection; the studio cannot verify which model processed an uploaded file.</p>
      <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{receive(e.target.files?.[0]);e.target.value=''}}/>
      <button className="secondary" disabled={busy||visual.example} onClick={()=>input.current?.click()}><Upload size={16}/>{file?'Choose another result':'Import enlarged image'}</button>
      {visual.example&&<p className="helper">Import is available for your saved visuals. You can still download and upscale this example.</p>}
      {preview&&<div className="upscale-preview"><img crossOrigin="anonymous" src={preview} alt="Enlarged image to review" onError={()=>{setError('This image cannot be opened. Choose another file.');setDimensions(null)}} onLoad={e=>{const {naturalWidth:width,naturalHeight:height}=e.currentTarget;if(visual.width&&visual.height&&(width<=visual.width||height<=visual.height)){setError('This image must be larger than the original.');setDimensions(null)}else if(visual.width&&visual.height&&Math.abs(width/height-visual.width/visual.height)/(visual.width/visual.height)>.01){setError('The image shape changed. Export with the original aspect ratio.');setDimensions(null)}else{setDimensions({width,height});setError('')}}}/><p>{dimensions?`${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} pixels · actual file size`:file?.name}</p><button className="generate" disabled={busy||!dimensions} onClick={()=>void save()}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} {busy?'Saving enlarged image…':'Save enlarged version'}</button></div>}
    </div></div>
    {error&&<p className="upscale-warning" role="alert">{error}</p>}
    </details>
  </section>
}
