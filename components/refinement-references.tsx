"use client";
import {useRef,useState} from 'react';
import {ImagePlus,X} from 'lucide-react';
import {MAX_REFINEMENT_REFERENCES} from '@/lib/image-models';
export type RefinementReference={id:string;name:string;src:string};
export function RefinementReferences({value,onChange,disabled=false,limit=MAX_REFINEMENT_REFERENCES,onPreparingChange}:{value:RefinementReference[];onChange:(value:RefinementReference[])=>void;disabled?:boolean;limit?:number;onPreparingChange?:(busy:boolean)=>void}){
 const input=useRef<HTMLInputElement>(null),reading=useRef(false);
 const [preparing,setPreparing]=useState(false),[error,setError]=useState('');
 async function receive(files:File[]){
  if(disabled||reading.current||!files.length)return;
  setError('');
  if(value.length+files.length>limit){setError(`You can attach up to ${limit} references. Remove an image or choose fewer files.`);return}
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||!f.size||f.size>8_000_000)){setError('Choose PNG, JPEG or WebP images under 8 MB each.');return}
  reading.current=true;setPreparing(true);onPreparingChange?.(true);
  try{
   const added:RefinementReference[]=[];
   for(const file of files){
    const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('This image could not be read. Please try again.'));reader.readAsDataURL(file)});
    await new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error(file.name+' is not a readable image.'));image.src=src});
    added.push({id:crypto.randomUUID(),name:file.name,src});
   }
   onChange([...value,...added]);
  }catch(e){setError((e as Error).message)}finally{reading.current=false;setPreparing(false);onPreparingChange?.(false)}
 }
 return <div className="refinement-references">
  <div className="refinement-reference-heading"><div><strong>Reference images <span>Optional</span></strong><p>Add one or several images to guide your changes.</p></div><span>{limit?`${value.length} / ${limit}`:`${value.length} attached`}</span></div>
  {!!value.length&&<div className="refinement-reference-grid">{value.map((item,index)=><figure key={item.id}><img crossOrigin="anonymous" src={item.src} alt={`Reference ${index+1}: ${item.name}`}/><button type="button" className="icon-button" aria-label={`Remove Reference ${index+1}`} disabled={disabled||preparing} onClick={()=>{onChange(value.filter(r=>r.id!==item.id));setError(index<value.length-1?'Reference numbers have updated. Check the numbers in your prompt.':'')}}><X size={15}/></button><figcaption><strong>Reference {index+1}</strong><span title={item.name}>{item.name}</span></figcaption></figure>)}</div>}
  <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Add refinement reference images" hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void receive(files)}}/>
  <button type="button" className="button secondary" disabled={disabled||preparing||value.length>=limit} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{preparing?'Reading images…':value.length?'Add more references':'Add reference images'}</button>
  <p className="refinement-reference-help">{limit===0?'Choose ChatGPT, Sunburst or Flare for extra references. Grok currently uses the car, inspiration and previous visual.':'PNG, JPEG or WebP · up to 8 MB each. In your prompt, use “Reference 1”, “Reference 2”, and so on.'}</p>
  {value.length>limit&&<p role="alert" className="refinement-reference-error">Your references are kept. Choose a supported model or remove them before generating.</p>}
  {error&&<p role="alert" className="refinement-reference-error">{error}</p>}
 </div>
}
