'use client';
import * as React from 'react';
import {MonitorUp,X} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {Field,Input,Select} from '@/components/ds/field';
import {DropZone} from '@/components/ds/drop-zone';
import {studioFetch} from '@/lib/studio-fetch';
import {readReference,uploadReference} from '@/lib/reference-upload';
import {clipboardImage} from '@/lib/clipboard-image';
import {CONFIGURATORS,type Configurator} from '@/lib/configurators';
import {mergePresets,useConfiguratorPresets} from '@/lib/configurator-presets';
import {captureSharedTab,highResolutionDisplayOptions,snapshotStream} from '@/lib/live-capture';
import type {LineupCar} from '@/lib/lineup';
import {ConfiguratorStage} from './parts';
import {iframeConfigurator} from './iframe-configurator';
import type {ConfiguratorAdapter} from './configurator';
import {LineupImg,asset} from './lineup-parts';

// One car of a line-up: its name, colour and trim, and its one or two views.
// The live configurator is reached only through the adapter
// (components/editor/configurator.ts); when it sends no picture, the tab
// capture, a pasted or uploaded screenshot are the fallbacks. Every new view is
// framed (cropped) before it is uploaded.

const MAX_VIEWS=2;
// Said just before the browser asks to share this tab, and only then.
const SHARE_NOTICE='Your browser will ask to share this tab once, so the Studio can take the picture. Choose this tab and Share.';
type Crop={src:string;label:string;revoke:boolean};
type Box={x:number;y:number;w:number;h:number};

export function LineupCarDialog({car,index,config,onPatch,onClose}:{car:LineupCar;index:number;config:Configurator;onPatch:(patch:Partial<LineupCar>)=>void;onClose:()=>void}){
 const [items,setItems]=React.useState<Configurator[]>(CONFIGURATORS);
 useConfiguratorPresets(list=>setItems(mergePresets(list)));
 const options=items.some(x=>x.url===config.url)?items:[...items,config];
 const [busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const [crop,setCrop]=React.useState<Crop|null>(null),[box,setBox]=React.useState<Box|null>(null),[fallback,setFallback]=React.useState(false);
 const frame=React.useRef<HTMLIFrameElement>(null),image=React.useRef<HTMLImageElement>(null),drag=React.useRef<{x:number;y:number}|null>(null),handle=React.useRef('');
 const adapter=React.useRef<ConfiguratorAdapter|null>(null);
 const views=car.views,full=views.length>=MAX_VIEWS;

 // Today's configurator behind the adapter; a new car address is a new adapter.
 React.useEffect(()=>{
  const a=iframeConfigurator(()=>frame.current,()=>config.url);
  adapter.current=a;
  return ()=>{a.dispose();if(adapter.current===a)adapter.current=null};
 },[config.url]);
 // Lets a tab capture of this page find the configurator in it.
 React.useEffect(()=>{
  handle.current=crypto.randomUUID();
  const media=navigator.mediaDevices as MediaDevices&{setCaptureHandleConfig?:(v:unknown)=>void};
  try{media?.setCaptureHandleConfig?.({handle:handle.current,exposeOrigin:true,permittedOrigins:[location.origin]})}
  catch{handle.current=''/* this browser cannot label the tab: the tab capture asks for it instead */}
 },[]);
 React.useEffect(()=>()=>{if(crop?.revoke)URL.revokeObjectURL(crop.src)},[crop]);

 const openCrop=(src:string,label:string,revoke=false)=>{setCrop({src,label,revoke});setBox(null)};
 async function capture(){
  if(full){setError(`Use up to ${MAX_VIEWS} car views.`);return}
  setBusy('capture');setError('');setNotice('');
  try{
   // The configurator's own picture first; null when it cannot send one.
   const shot=await adapter.current?.capture().catch(()=>null);
   if(shot){openCrop(URL.createObjectURL(shot.blob),shot.state.view||'Configurator view',true);setNotice('Current configurator frame captured. Crop out the interface if needed.');return}
   if(navigator.mediaDevices?.getDisplayMedia&&'setCaptureHandleConfig' in navigator.mediaDevices){
    let stream:MediaStream|undefined;
    setNotice(SHARE_NOTICE);
    try{stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());openCrop(await snapshotStream(stream,frame.current,handle.current),'Configurator view');setNotice('Current view captured. Crop out any remaining controls if needed.')}
    finally{stream?.getTracks().forEach(t=>t.stop())}
   }else setFallback(true);
  }catch(e){setNotice('');setFallback(true);if((e as Error).name!=='NotAllowedError')setError((e as Error).message)}
  finally{setBusy('')}
 }
 async function screenCapture(){
  setFallback(false);setError('');
  let stream:MediaStream|undefined;
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('This browser cannot capture tabs. Upload a screenshot instead.');
   setNotice(SHARE_NOTICE);
   stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());
   openCrop(await captureSharedTab(stream,frame.current,handle.current),'Captured car view');setNotice('');
  }catch(e){setNotice('');setError((e as Error).name==='NotAllowedError'?'Tab sharing was canceled.':(e as Error).message)}
  finally{stream?.getTracks().forEach(t=>t.stop())}
 }
 // A picture of the car from a file; the drop zone shows its own problems.
 async function readScreenshot(f:File){if(full||crop)return;openCrop(await readReference(f),f.name);setFallback(false)}
 async function screenshot(f?:File|null){
  if(!f)return;
  try{await readScreenshot(f)}catch(e){setError((e as Error).message)}
 }
 function point(e:React.PointerEvent<HTMLElement>){const r=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
 async function saveCrop(){
  const img=image.current;if(!img||!img.naturalWidth||!crop)return;
  const b=box||{x:0,y:0,w:1,h:1};
  if(b.w<.1||b.h<.1){setError('Choose a larger area around the car.');return}
  const c=document.createElement('canvas'),w=img.naturalWidth*b.w,h=img.naturalHeight*b.h;
  c.width=Math.round(w);c.height=Math.round(h);
  const ctx=c.getContext('2d');if(!ctx){setError('The cropped image could not be saved.');return}
  ctx.drawImage(img,img.naturalWidth*b.x,img.naturalHeight*b.y,w,h,0,0,c.width,c.height);
  const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',0.91));
  if(!blob){setError('The cropped image could not be saved.');return}
  setBusy('upload');setError('');
  try{
   const original=await(await studioFetch(crop.src)).blob();
   const d=await uploadReference(new File([blob],'car-view.jpg',{type:'image/jpeg'}),original);
   onPatch({views:[...views,{id:d.id,label:crop.label}]});
   setCrop(null);setNotice('View added. Give it a descriptive label below.');
  }catch(e){setError((e as Error).message)}
  finally{setBusy('')}
 }

 return <Dialog open wide onClose={onClose} title={`${car.name} · references`} footer={<Button kind="primary" onClick={onClose}>Done</Button>}>
  <div className="ds-stack" onPaste={e=>{const f=clipboardImage(e.clipboardData);if(f){e.preventDefault();if(!busy)void screenshot(f)}}}>
   <p className="ds-help">Car {index+1}. The first view sets this car’s angle. Add an optional second view for detail accuracy.</p>
   {error&&<p className="ds-error" role="alert">{error}</p>}
   {notice&&<p className="ds-help" role="status">{notice}</p>}
   <Field label="Car name"><Input value={car.name} onChange={e=>onPatch({name:e.target.value})} maxLength={100}/></Field>
   <Field label="Colour and trim" help="Optional notes; the views show the rest."><Input value={car.finish} onChange={e=>onPatch({finish:e.target.value})} placeholder="As captured · optional notes" maxLength={200}/></Field>
   <Field label="Configurator" help={<a className="ds-link" href={config.url} target="_blank" rel="noreferrer">Open {hostOf(config.url)} in a tab</a>}>
    <Select value={config.url} disabled={!!busy} onChange={e=>{const c=options.find(x=>x.url===e.target.value);if(c)onPatch({name:c.name,configurator:c.url,views:[],finish:''})}}>{options.map(x=><option key={x.url} value={x.url}>{x.name}</option>)}</Select>
   </Field>
   <div hidden={!!crop}>
    <ConfiguratorStage frame={0} frames={0} onFrame={()=>undefined} onCapture={()=>void capture()} capturing={busy==='capture'}>
     <iframe ref={frame} key={config.url} title={`${config.name} configurator`} src={config.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen/>
     <span className="editor-live"><span aria-hidden="true"/>Live configurator</span>
    </ConfiguratorStage>
    <p className="ds-help">Set the colour, trim and angle in the configurator, then Use this view. Capture views with the same colour and trim.</p>
   </div>
   {crop&&<section className="ds-stack" aria-label="Frame the car">
    <p className="ds-help">Drag to crop out configurator controls. Keep the full car visible.</p>
    <div className="editor-lineup-crop" onPointerDown={e=>{drag.current=point(e);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;const p=point(e),s=drag.current;setBox({x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)})}} onPointerUp={()=>{drag.current=null}}>
     <LineupImg ref={image} src={crop.src} alt="Capture to crop" draggable={false}/>
     {box&&<span style={{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'}}/>}
    </div>
    <div className="editor-row">
     <Button kind="primary" busy={busy==='upload'} onClick={()=>void saveCrop()}>Add car view</Button>
     <Button disabled={!box||!!busy} onClick={()=>setBox(null)}>Use full image</Button>
     <Button kind="quiet" disabled={!!busy} onClick={()=>setCrop(null)}>Cancel</Button>
    </div>
   </section>}
   {fallback&&!crop&&<div className="editor-upload">
    <MonitorUp aria-hidden="true"/>
    <span><b>This configurator does not send a picture</b><span className="ds-muted">Capture its tab, or add a screenshot below.</span></span>
    <Button size="sm" onClick={()=>void screenCapture()}>Capture a tab</Button>
   </div>}
   {!crop&&<DropZone name="car screenshot" label="Drop, paste or upload a screenshot of the car" hint={full?`This car has its ${MAX_VIEWS} views. Remove one to add another.`:'PNG, JPEG or WebP · up to 40 MB. You frame it next.'} onFile={readScreenshot} disabled={full||!!busy}/>}
   <section className="ds-stack" aria-label="Views">
    <p className="ds-label">{views.length} / {MAX_VIEWS} views</p>
    {views.length?<ol className="editor-lineup">{views.map((v,j)=><li key={v.id} className="editor-lineup-car">
     <span className="editor-lineup-thumb"><LineupImg src={asset(v.id)} alt={`Car reference ${j+1}`}/></span>
     <Field label={j?'Detail reference':'Primary angle'}><Input value={v.label} onChange={e=>onPatch({views:views.map(x=>x.id===v.id?{...x,label:e.target.value}:x)})} maxLength={100}/></Field>
     {j>0&&<Button size="sm" kind="quiet" onClick={()=>onPatch({views:[v,...views.filter(x=>x.id!==v.id)]})}>Use as primary</Button>}
     <IconButton label={`Remove view ${j+1}`} size="sm" disabled={!!busy} onClick={()=>onPatch({views:views.filter(x=>x.id!==v.id)})}><X aria-hidden="true"/></IconButton>
    </li>)}</ol>
    :<p className="ds-help">Capture your preferred angle first. Add a second view only to clarify this car’s details.</p>}
   </section>
  </div>
 </Dialog>;
}

function hostOf(url:string){try{return new URL(url).hostname}catch{return 'the configurator'}}
