'use client';
import {LiveFrame} from './live-frame';
import * as React from 'react';
import {Check,ExternalLink,Images,MonitorUp,X} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {Banner} from '@/components/ds/shell';
import {Field,Input} from '@/components/ds/field';
import {DropZone} from '@/components/ds/drop-zone';
import {readReference,uploadReference} from '@/lib/reference-upload';
import {clipboardImage} from '@/lib/clipboard-image';
import {captureSharedTab,highResolutionDisplayOptions,snapshotStream} from '@/lib/live-capture';
import type {Configurator} from '@/lib/configurators';
import type {CarView} from '@/lib/storyboards';
import {ConfiguratorStage} from './parts';
import {iframeConfigurator} from './iframe-configurator';
import type {ConfiguratorAdapter,ConfiguratorOptions} from './configurator';

// Story, the car (Phase 3 group 2): the configurator in the canvas behind the
// adapter (components/editor/configurator.ts), and the story's car views under
// it. "Use this view" asks the adapter for the picture; when the configurator
// sends none, the browser-tab capture and the screenshot upload of the old
// screen still work. Every view is framed (cropped) before it is added. The
// story's one next step is Generate in the settings panel ("Plan the shots"),
// so the canvas has no button of its own for it.

export const MAX_VIEWS=10;
// Said just before the browser asks to share this tab, and only then.
const SHARE_NOTICE='Your browser will ask to share this tab once, so the Studio can take the picture. Choose this tab and Share.';
export type SavedVisual={id:string;title?:string};
type Crop={src:string;original:Blob|null;label:string};
type Box={x:number;y:number;w:number;h:number};
const NO_OPTIONS:ConfiguratorOptions={colours:[],trims:[],views:[],frames:0};

function asDataUrl(blob:Blob){
 return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('This picture could not be read.'));r.readAsDataURL(blob)});
}

export function StoryCar({config,views,onViews,onLabel,locked,disabled,library}:{
 config:Configurator;views:CarView[];
 /** Saves the story with these views (label: what the screen says meanwhile). */onViews:(views:CarView[],label:string)=>void;
 /** A view's label while typing (saved with the story). */onLabel:(id:string,label:string)=>void;
 /** The story has shots: its car is set. */locked:boolean;disabled:boolean;library:SavedVisual[];
}){
 const frame=React.useRef<HTMLIFrameElement>(null),image=React.useRef<HTMLImageElement>(null);
 const drag=React.useRef<{x:number;y:number}|null>(null),captureHandle=React.useRef('');
 const [adapter,setAdapter]=React.useState<ConfiguratorAdapter|null>(null),[options,setOptions]=React.useState<ConfiguratorOptions>(NO_OPTIONS),[turn,setTurn]=React.useState(0);
 const [busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const [crop,setCrop]=React.useState<Crop|null>(null),[box,setBox]=React.useState<Box|null>(null),[fallback,setFallback]=React.useState(false),[picker,setPicker]=React.useState(false);
 const full=views.length>=MAX_VIEWS,off=disabled||locked||!!busy;
 // One adapter per configurator page; the remote-control adapter will slot in here.
 React.useEffect(()=>{
  const address=config.url,a=iframeConfigurator(()=>frame.current,()=>address);
  setAdapter(a);setOptions(NO_OPTIONS);setTurn(0);
  let live=true;
  a.getOptions().then(o=>{if(live)setOptions(o)},(e:unknown)=>{if(live)setError(e instanceof Error?e.message:'The configurator did not say what it offers.')});
  return ()=>{live=false;a.dispose()};
 },[config.url]);
 // Lets a capture of this tab find the configurator in it (lib/live-capture.ts).
 React.useEffect(()=>{
  captureHandle.current=crypto.randomUUID();
  const media=navigator.mediaDevices as MediaDevices&{setCaptureHandleConfig?:(v:unknown)=>void}|undefined;
  try{media?.setCaptureHandleConfig?.({handle:captureHandle.current,exposeOrigin:true,permittedOrigins:[location.origin]})}
  catch(e){console.warn('Tab capture cannot mark this tab; the configurator capture still works.',e)}
 },[]);

 const frameIt=(src:string,original:Blob|null,label:string)=>{setCrop({src,original,label});setBox(null)};
 async function capture(){
  if(full){setError(`Use up to ${MAX_VIEWS} car views.`);return}
  if(!adapter)return;
  setBusy('capture');setError('');setNotice('');
  try{
   const shot=await adapter.capture();
   frameIt(await asDataUrl(shot.blob),shot.blob,shot.state.view||'Configurator view');
   setNotice('Current configurator frame captured. Crop out the interface if needed.');
  }catch{
   // The configurator sent no picture: capture this tab instead, as before.
   try{
    if(navigator.mediaDevices?.getDisplayMedia&&'setCaptureHandleConfig' in navigator.mediaDevices){
     let stream:MediaStream|undefined;
     setNotice(SHARE_NOTICE);
     try{stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());frameIt(await snapshotStream(stream,frame.current,captureHandle.current),null,'Configurator view');setNotice('Current view captured. Crop out any remaining controls if needed.')}
     finally{stream?.getTracks().forEach(t=>t.stop())}
    }else setFallback(true);
   }catch(e){setNotice('');setFallback(true);if((e as Error).name!=='NotAllowedError')setError((e as Error).message)}
  }finally{setBusy('')}
 }
 async function captureTab(){
  setFallback(false);setError('');
  let stream:MediaStream|undefined;
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('This browser cannot capture tabs. Upload a screenshot instead.');
   setNotice(SHARE_NOTICE);
   stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());
   frameIt(await captureSharedTab(stream,frame.current,captureHandle.current),null,'Captured car view');setNotice('');
  }catch(e){setNotice('');setError((e as Error).name==='NotAllowedError'?'Tab sharing was canceled.':(e as Error).message)}
  finally{stream?.getTracks().forEach(t=>t.stop())}
 }
 // A picture of the car from a file; the drop zone shows its own problems.
 async function readFile(file:File){frameIt(await readReference(file),file,file.name);setFallback(false)}
 async function takeFile(file?:File|null){
  if(!file)return;
  try{await readFile(file)}catch(e){setError((e as Error).message)}
 }
 function point(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
 async function addView(){
  const img=image.current,source=crop;
  if(!img||!img.naturalWidth||!source)return;
  const area=box||{x:0,y:0,w:1,h:1};
  if(area.w<.1||area.h<.1){setError('Choose a larger area around the car.');return}
  const c=document.createElement('canvas'),w=img.naturalWidth*area.w,h=img.naturalHeight*area.h;
  c.width=Math.round(w);c.height=Math.round(h);
  const ctx=c.getContext('2d');
  if(!ctx){setError('The cropped image could not be saved.');return}
  ctx.drawImage(img,img.naturalWidth*area.x,img.naturalHeight*area.y,w,h,0,0,c.width,c.height);
  const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',0.91));
  if(!blob){setError('The cropped image could not be saved.');return}
  setCrop(null);
  if(full)return;
  setBusy('upload');
  try{
   const original=source.original??await(await fetch(source.src)).blob();
   const d=await uploadReference(new File([blob],'car-view.jpg',{type:'image/jpeg'}),original);
   onViews([...views,{id:d.id,label:source.label}],'Saving car views…');
   setNotice('View added. Give it a descriptive label below.');
  }catch(e){setError((e as Error).message)}finally{setBusy('')}
 }

 return <div className="ds-stack editor-storyboard-car" onPaste={e=>{const file=clipboardImage(e.clipboardData);if(file){e.preventDefault();if(!off&&!full&&!crop)void takeFile(file)}}}>
  {error&&<div className="ds-row"><Banner kind="bad">{error}</Banner><IconButton label="Dismiss" size="sm" onClick={()=>setError('')}><X aria-hidden="true"/></IconButton></div>}
  {notice&&<p className="ds-help" role="status">{notice}</p>}
  {locked
   ?<p className="ds-note">This story’s car is set: its shots were planned from these views. Start a new story for another car.</p>
   :<ConfiguratorStage frame={turn} frames={options.frames} onFrame={f=>{setTurn(f);adapter?.setFrame(f).catch((e:unknown)=>setError(e instanceof Error?e.message:'The configurator did not turn.'))}} onCapture={()=>void capture()} capturing={busy==='capture'}>
     <LiveFrame frameRef={frame} url={config.url} name={config.name}/>
    </ConfiguratorStage>}
  {fallback&&!locked&&<div className="ds-note ds-stack">
   <p>This configurator does not send a picture. Capture its tab, or add a screenshot under Car views.</p>
   <div className="ds-row">
    <Button size="sm" icon={<MonitorUp aria-hidden="true"/>} onClick={()=>void captureTab()}>Capture browser tab</Button>
   </div>
  </div>}
  <section className="ds-stack" aria-labelledby="story-views-title">
   <div className="ds-row">
    <h2 className="editor-section-title" id="story-views-title">Car views · {views.length} / {MAX_VIEWS}</h2>
    <span className="ds-spacer"/>
    {!locked&&<>
     <Button size="sm" kind="quiet" icon={<Images aria-hidden="true"/>} disabled={off||full} onClick={()=>setPicker(true)}>Use a saved key visual</Button>
     <a className="ds-btn sm quiet" href={config.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true"/>Open configurator in a tab</a>
    </>}
   </div>
   {!locked&&<DropZone name="car picture" label="Drop, paste or upload a picture of the car" hint={full?`The story has its ${MAX_VIEWS} views. Remove one to add another.`:'PNG, JPEG or WebP · up to 40 MB. You frame it next.'} onFile={readFile} disabled={off||full||!!crop}/>}
   {views.length
    ?<ol className="editor-storyboard-views" aria-label="Car views">{views.map((v,i)=><li key={v.id} className="editor-storyboard-view">
      <div className="editor-storyboard-frame">
       {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
       <img crossOrigin="anonymous" src={'/api/assets/'+v.id} alt={'Car view '+(i+1)}/>
      </div>
      <div className="ds-row">
       <Field label={`View ${i+1}`} className="editor-storyboard-grow"><Input value={v.label} onChange={e=>onLabel(v.id,e.target.value)} placeholder="Front three-quarter · black paint" maxLength={100} disabled={disabled}/></Field>
       {!locked&&<IconButton label={'Remove car view '+(i+1)} size="sm" disabled={off} onClick={()=>onViews(views.filter(x=>x.id!==v.id),'Saving car views…')}><X aria-hidden="true"/></IconButton>}
      </div>
     </li>)}</ol>
    :<p className="ds-muted">Capture a clean front three-quarter view first. Add side and rear angles to support more storyboard angles. Keep the same colour, wheels and trim in every capture.</p>}
   <p className="ds-help">{locked?'Only capture and upload happen here.':'Only capture and upload happen here. When your views are in, describe your idea in the settings and choose Plan the shots; nothing is generated until you approve it.'}</p>
  </section>
  <Dialog open={!!crop} onClose={()=>setCrop(null)} title="Frame the car" wide
   footer={<><Button onClick={()=>setBox(null)}>Use full image</Button><Button kind="primary" icon={<Check aria-hidden="true"/>} busy={busy==='upload'} onClick={()=>void addView()}>Add car view</Button></>}>
   <p className="ds-help">Drag to crop out configurator controls. Keep the full car visible, or use the full image.</p>
   {crop&&<div className="editor-storyboard-crop" onPointerDown={e=>{drag.current=point(e);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;const p=point(e),s=drag.current;setBox({x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)})}} onPointerUp={()=>{drag.current=null}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a local capture */}
    <img ref={image} src={crop.src} alt="Capture to crop" draggable={false}/>
    {box&&<span aria-hidden="true" style={{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'}}/>}
   </div>}
  </Dialog>
  <Dialog open={picker} onClose={()=>setPicker(false)} title="Use a saved key visual" wide>
   {library.length
    ?<ul className="ds-grid dense editor-storyboard-library" aria-label="Saved key visuals">{library.slice(0,36).map(v=><li key={v.id}>
      <button type="button" className="editor-storyboard-pick" disabled={views.some(x=>x.id===v.id)||full} onClick={()=>{setPicker(false);onViews([...views,{id:v.id,label:v.title||'Saved car visual'}],'Adding saved visual…')}}>
       {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
       <img crossOrigin="anonymous" src={'/api/assets/'+v.id} alt=""/>
       <span className="ds-truncate">{v.title||'Saved car visual'}</span>
      </button>
     </li>)}</ul>
    :<p className="ds-muted">No saved key visuals yet. Capture or upload a car view.</p>}
  </Dialog>
 </div>;
}
