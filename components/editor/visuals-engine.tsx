'use client';
import * as React from 'react';
import {Field,Radio,RadioGroup,Select} from '@/components/ds/field';
import {providerNames,useAccount} from '@/components/studio-account';
import {SettingsSection,type Quality} from '@/components/editor/parts';
import {credits as creditWords} from '@/lib/ds/words';
import {EXTERNAL_IMAGE_MODELS,GEMINI_IMAGE_MODELS,HIGGSFIELD_IMAGE_MODELS,OPENAI_IMAGE_MODELS,geminiImageModel,higgsImageModel,openaiImageModel,type ImageProvider} from '@/lib/image-models';
import {ENGINE_LABEL,imageModelLabel} from '@/lib/provider-words';
import {googleImageCost,openaiImageCost,topazCost} from '@/lib/credits/words';
import type {CostKey,CreditProvider} from '@/lib/credits/pricing';
import type {CreditOverview} from '@/lib/credits/usage';

// The key-visual editor's engine settings and prices (Phase 3 group 2). The
// same choices as the old screen's ImageGenerationSettings, on the design
// system's native controls (they work inside the phone settings sheet), with
// the same F-050 words: a client without its own keys sees plain names.

/** Quality maps onto the two output sizes every engine offers: 2K and 4K. */
export const QUALITY_SIZE:Record<Quality,string>={standard:'2048x1152',high:'3840x2160'};
export const qualityOfSize=(size:string):Quality=>size===QUALITY_SIZE.high?'high':'standard';
export const supportsHigh=(provider:ImageProvider,model:string)=>provider!=='higgsfield'||higgsImageModel(model).max4k;

/** The price key of one image, or null when the engine prices it as it starts. */
export function imageCostKey(provider:ImageProvider,model:string,size:string):CostKey|null{
 if(provider==='openai')return openaiImageCost(size);
 if(provider==='google')return googleImageCost(model,size);
 return higgsImageModel(model).variableCost?'higgsfield.image.token':null;
}
/** Credits for one action before it starts: 0 with the company's own key, null when unknown. */
export function priceOf(o:CreditOverview|null,key:CostKey|null,provider:CreditProvider):number|null{
 if(!o||!key)return null;
 if(o.billing[provider]==='own key')return 0;
 const n=o.prices[key];
 return typeof n==='number'?n:null;
}
export const upscalePrices=(o:CreditOverview|null,maxEdge:number)=>([2048,3840,7680] as const).filter(e=>e<=Math.max(maxEdge,2048)).map(edge=>({edge,label:edge===2048?'2K':edge===3840?'4K':'8K',credits:priceOf(o,topazCost(edge),'topaz')}));

/** Standard / High detail with each one's price; plain radios when a price is unknown. */
export function VisualsQuality({value,onChange,costs,highAllowed,disabled}:{value:Quality;onChange:(q:Quality)=>void;costs:Record<Quality,number|null>;highAllowed:boolean;disabled?:boolean}){
 const name=`kv-quality-${React.useId().replace(/[^a-zA-Z0-9]/g,'')}`;
 return <SettingsSection title="Quality" id={`${name}-title`}>
  <RadioGroup legend="Quality" className="editor-quality">
   {(['standard','high'] as Quality[]).map(q=><Radio key={q} name={name} checked={value===q} disabled={disabled||(q==='high'&&!highAllowed)} onChange={()=>onChange(q)}
    label={<span className="editor-quality-label">{q==='standard'?'Standard':'High detail'}{typeof costs[q]==="number"&&<span className="ds-muted">{creditWords(costs[q] as number)}</span>}</span>}
    help={q==='standard'?'2K. Quicker; good for trying ideas.':highAllowed?'4K. Sharper details for the final.':'This model makes up to 2K. Choose another model for 4K.'}/>)}
  </RadioGroup>
 </SettingsSection>;
}

/** Engine, model, exact output size and, for new work, how many. */
export function VisualsEngine({provider,model,size,count,disabled,onProvider,onModel,onSize,onCount}:{provider:ImageProvider;model:string;size:string;count?:number;disabled?:boolean;onProvider:(p:ImageProvider)=>void;onModel:(m:string)=>void;onSize:(s:string)=>void;onCount?:(n:number)=>void}){
 const names=providerNames(useAccount());
 const info=higgsImageModel(provider==='higgsfield'?model:HIGGSFIELD_IMAGE_MODELS[0].id),fourK=provider!=='higgsfield'||info.max4k;
 const engine=(p:ImageProvider,named:string)=>names?named:ENGINE_LABEL[p];
 const modelName=(id:string,named:string)=>names?named:imageModelLabel(id);
 const models:{id:string;label:string}[]=provider==='openai'?[...OPENAI_IMAGE_MODELS]:provider==='google'?[...GEMINI_IMAGE_MODELS]:[...HIGGSFIELD_IMAGE_MODELS];
 const suffix=(id:string)=>provider==='google'?' · up to 4K':provider==='higgsfield'?(higgsImageModel(id).max4k?' · up to 4K':names?' · up to 2K':''):'';
 const plain=provider==='google'?'Recommended for precise car details and close matches to your references. 1K, 2K and 4K are resolution tiers; actual dimensions are saved with each image.':provider==='openai'?'Detailed visuals and precise area edits. Output dimensions are saved with each image.':info.max4k?'High-quality reference editing at 1K, 2K or 4K. Generate starts a paid request immediately. Each image costs the credits shown next to Generate.':'Quick works at 1K or 2K. Generate starts a paid request immediately; its credits are set as it starts. Choose High detail or Fast for 4K.';
 const named=provider==='google'?geminiImageModel(model).description+' Uses your Google account. References are prepared automatically; larger sets upload securely to Google. 1K, 2K and 4K are resolution tiers; actual dimensions are saved with each image.':provider==='openai'?openaiImageModel(model).description+' Uses your OpenAI connection. Output dimensions are saved with each image.':info.max4k?'High-quality reference editing at 1K, 2K or 4K. Generate starts a paid request immediately. Each image costs the credits shown next to Generate.':'Grok supports 1K or 2K. Generate starts a paid request immediately; Higgsfield prices it in credits as it starts. Choose Sunburst or Flare for 4K.';
 return <div className="ds-stack">
  <Field label={names?'Image generator':'Image engine'}><Select value={provider} disabled={disabled} onChange={e=>onProvider(e.target.value as ImageProvider)}>
   <option value="openai">{engine('openai','ChatGPT / OpenAI')}</option><option value="higgsfield">{engine('higgsfield','Higgsfield')}</option><option value="google">{engine('google','Google · Nano Banana')}</option>
  </Select></Field>
  <Field label={names?'Image model':'Model'}><Select value={model} disabled={disabled} onChange={e=>onModel(e.target.value)}>
   {models.map(m=><option key={m.id} value={m.id}>{modelName(m.id,m.label)}{suffix(m.id)}</option>)}
  </Select></Field>
  <Field label="Output size"><Select value={size} disabled={disabled} onChange={e=>onSize(e.target.value)}>
   {provider==='openai'?<option value="1536x864">Preview · 1536 × 864</option>:<option value="1024x576">1K · landscape</option>}
   <option value="2048x1152">2K · landscape</option>
   {fourK&&<option value="3840x2160">{provider==='openai'?'4K · 3840 × 2160':'4K · landscape'}</option>}
  </Select></Field>
  {onCount&&<Field label="Visuals"><Select value={String(count)} disabled={disabled} onChange={e=>onCount(Number(e.target.value))}><option value="1">1 visual</option><option value="3">3 visuals</option></Select></Field>}
  <p className="ds-help">{names?named:plain}</p>
  {names&&provider==='higgsfield'&&<details className="ds-fold"><summary className="ds-fold-head"><span className="ds-fold-title">Nano Banana Pro &amp; Seedream</span></summary><div className="ds-fold-body ds-stack">
   <p className="ds-help">Use these on Higgsfield’s website. These models are not connected through the Higgsfield API here. For Nano Banana Pro and 2.1 in Single car, choose Google · Nano Banana above. Seedream remains available on Higgsfield’s website.</p>
   {EXTERNAL_IMAGE_MODELS.map(m=><a key={m.label} className="ds-link" href={m.url} target="_blank" rel="noreferrer">Open {m.label} on Higgsfield</a>)}
  </div></details>}
 </div>;
}

/** Reads a captured picture into a data URL, the form the rest of the flow keeps a car reference in. */
export function blobToDataUrl(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('The captured picture could not be read.'));
  reader.onerror=()=>reject(new Error('The captured picture could not be read.'));
  reader.readAsDataURL(blob);
 });
}
