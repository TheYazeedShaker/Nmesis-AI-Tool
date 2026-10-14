'use client';
import {useId,useState} from 'react';
import type {Visual} from '@/lib/studio';
type Reference='inspiration'|'car'|'original';
export function VisualComparison({visual,showOriginal=false}:{visual:Visual;showOriginal?:boolean}){
 const options:{id:Reference;label:string;src:string}[]=[
  ...(visual.moodId?[{id:'inspiration' as const,label:'Inspiration reference',src:'/api/assets/'+visual.moodId}]:[]),
  ...(visual.sourceId?[{id:'car' as const,label:'Configurator reference',src:'/api/assets/'+visual.sourceId}]:[]),
  ...((visual.upscale||visual.areaEdit)?[{id:'original' as const,label:'Before this edit',src:(visual.upscale||visual.areaEdit)!.parentSrc}]:[]),
 ];
 const [reference,setReference]=useState<Reference>(showOriginal?'original':options[0]?.id||'inspiration');
 const [mode,setMode]=useState<'none'|'side'|'slider'>(showOriginal?'side':'none');
 const [position,setPosition]=useState(50);const selectId=useId(),rangeId=useId();
 const chosen=options.find(o=>o.id===reference)||options[0];
 return <section className="kv-comparison" aria-label="Compare visual with references">
  {!!options.length&&<div className="kv-compare-controls"><label htmlFor={selectId}>Compare with<select id={selectId} value={chosen.id} onChange={e=>setReference(e.target.value as Reference)}>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label><button className="secondary" aria-pressed={mode==='side'} onClick={()=>setMode('side')}>A/B side by side</button><button className="secondary" aria-pressed={mode==='slider'} onClick={()=>setMode('slider')}>Comparison slider</button>{mode!=='none'&&<button className="secondary" onClick={()=>setMode('none')}>Hide comparison</button>}</div>}
  {mode==='side'&&chosen?<div className="kv-compare-pair"><figure><figcaption>A · Generated image</figcaption><img crossOrigin="anonymous" src={visual.src} alt={visual.title}/></figure><figure><figcaption>B · {chosen.label}</figcaption><img crossOrigin="anonymous" key={chosen.src} src={chosen.src} alt={chosen.label}/></figure></div>:mode==='slider'&&chosen?<><div className="kv-compare-slider" style={{aspectRatio:visual.width&&visual.height?`${visual.width}/${visual.height}`:'16/9'}}><img crossOrigin="anonymous" src={visual.src} alt="A · Generated image"/><img crossOrigin="anonymous" key={chosen.src} className="kv-compare-overlay" style={{clipPath:`inset(0 ${100-position}% 0 0)`}} src={chosen.src} alt={'B · '+chosen.label}/><span className="kv-slider-label left">B · Reference</span><span className="kv-slider-label right">A · Generated</span><div className="kv-slider-divider" style={{left:position+'%'}} aria-hidden="true"><span>↔</span></div><input id={rangeId} aria-label="Comparison slider position" type="range" min={0} max={100} value={position} onChange={e=>setPosition(Number(e.target.value))}/></div><label className="kv-slider-help" htmlFor={rangeId}>Drag across the image, or use the arrow keys. Reference revealed: {position}%.</label><p className="helper">Both images keep their proportions. Different angles or crops may not line up exactly.</p></>:<img crossOrigin="anonymous" className="kv-compare-single" src={visual.src} alt={visual.title}/>}
 </section>;
}
