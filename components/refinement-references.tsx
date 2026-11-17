"use client";
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {uploadReference} from '@/lib/reference-upload';
import {useId,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {MAX_REFINEMENT_REFERENCES} from '@/lib/image-models';
import {IconButton} from '@/components/ds/button';
import {DropZone} from '@/components/ds/drop-zone';
export type RefinementReference={id:string;name:string;src:string};
// Extra pictures for a refinement: the design-system drop zone (several at
// once), then each reference numbered so the prompt can name it. Styles:
// app/inputs.css (.editor-refs-*).
export function RefinementReferences({value,onChange,disabled=false,limit=MAX_REFINEMENT_REFERENCES,onPreparingChange}:{value:RefinementReference[];onChange:(value:RefinementReference[])=>void;disabled?:boolean;limit?:number;onPreparingChange?:(busy:boolean)=>void}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const reading=useRef(false),title=useId();
 const [preparing,setPreparing]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 async function receive(files:File[]){
  if(disabled||reading.current||!files.length)return;
  setError('');setNote('');
  if(value.length+files.length>limit){setError(`You can attach up to ${limit} references. Remove an image or choose fewer files.`);return}
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||!f.size||f.size>40_000_000)){setError('Choose PNG, JPEG or WebP images up to 40 MB each.');return}
  reading.current=true;setPreparing(true);onPreparingChange?.(true);
  try{
   const added:RefinementReference[]=[];
   for(const file of files){
    const asset=await uploadReference(file);const src=asset.url;
    added.push({id:crypto.randomUUID(),name:file.name,src});
   }
   onChange([...value,...added]);
  }catch(e){setError((e as Error).message)}finally{reading.current=false;setPreparing(false);onPreparingChange?.(false)}
 }
 const full=value.length>=limit;
 return <section className="editor-refs" aria-labelledby={title}>
  <div className="editor-refs-head"><div><p className="ds-label" id={title}>Reference images <span className="ds-muted">(optional)</span></p><p className="ds-help">Add one or several images to guide your changes.</p></div><span className="ds-help ds-num">{limit?`${value.length} / ${limit}`:`${value.length} attached`}</span></div>
  {!!value.length&&<ol className="editor-refs-grid" aria-label="Reference images">{value.map((item,index)=><li key={item.id}><figure className="editor-refs-item">
   {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
   <img crossOrigin="anonymous" src={item.src} alt={`Reference ${index+1}: ${item.name}`}/>
   <figcaption><b>Reference {index+1}</b><span className="ds-truncate" title={item.name}>{item.name}</span></figcaption>
   <IconButton className="editor-refs-remove" label={`Remove Reference ${index+1}`} size="sm" kind="secondary" disabled={disabled||preparing} onClick={()=>{onChange(value.filter(r=>r.id!==item.id));setError('');setNote(index<value.length-1?'Reference numbers have updated. Check the numbers in your prompt.':'')}}><X aria-hidden="true"/></IconButton>
  </figure></li>)}</ol>}
  {limit>0&&<DropZone multiple name="reference pictures" label={value.length?'Drop, paste or upload more reference pictures':'Drop, paste or upload reference pictures'}
   hint={full?`You have ${limit} references. Remove one to add another.`:'PNG, JPEG or WebP · up to 40 MB each; originals kept. In your prompt, use “Reference 1”, “Reference 2”, and so on.'}
   onFiles={receive} busy={preparing?'Reading images…':false} disabled={disabled||full} error={error||undefined}/>}
  {limit===0&&<p className="ds-help">{w('Choose ChatGPT, Sunburst or Flare for extra references. Grok currently uses the car, inspiration and previous visual.')}</p>}
  {note&&<p className="ds-help" role="status">{note}</p>}
  {value.length>limit&&<p role="alert" className="ds-error">Your references are kept. Choose a supported model or remove them before generating.</p>}
  {limit===0&&error&&<p role="alert" className="ds-error">{error}</p>}
 </section>
}
