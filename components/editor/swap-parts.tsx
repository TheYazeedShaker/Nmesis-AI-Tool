'use client';
import * as React from 'react';
import Link from 'next/link';
import {AlertTriangle,Check,Coins,ExternalLink,LockKeyhole,X} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Banner} from '@/components/ds/shell';
import {Dialog} from '@/components/ds/dialog';
import {Checkbox,Field,Input,Radio,RadioGroup} from '@/components/ds/field';
import {DropZone} from '@/components/ds/drop-zone';
import {useCredits} from '@/components/credits';
import {creditsLabel} from '@/lib/credits/words';
import type {Swap} from '@/lib/swaps';
import {SettingsSection,type Quality,type Version} from './parts';

// The swap tool's pieces of the one editor (Phase 3 group 2): the reference ad,
// the car views, quality, the video connection, the estimate to approve, the
// crop of a captured view, and the swaps as versions. The page keeps the state.

export type SwapResolution='480p'|'720p';
export type SwapConnection={connected:boolean;sponsored:boolean;ownKeys?:boolean;nmesis?:boolean;available?:boolean};
export type CarView={id:string;label:string};

/** Standard is the lower-cost 480p test, High detail the 720p final. */
export const qualityOf=(r:SwapResolution):Quality=>r==='480p'?'standard':'high';
export const resolutionOf=(q:Quality):SwapResolution=>q==='standard'?'480p':'720p';

export const SWAP_STATUS:Record<string,string>={draft:'Draft',quoted:'Estimate ready',submitting:'Checking submission',unknown:'Submission uncertain',queued:'In queue',in_progress:'Replacing car',archiving:'Saving video',ready:'Ready',failed:'Could not render',nsfw:'Needs revision',canceled:'Canceled'};
export const statusWords=(s:string)=>SWAP_STATUS[s]||s;
export const pendingSwap=(s:Swap)=>['queued','in_progress','archiving'].includes(s.status);
/** Sent, or maybe sent: it cannot be deleted or changed until it settles. */
export const busySwap=(s:Swap)=>['queued','in_progress','submitting','unknown','archiving'].includes(s.status);
const UNSETTLED=['submitting','unknown'];

/** The swaps, newest first, as the editor's versions. Credits used only where
 *  the swap finished; a hold while it is being submitted; the charge once the
 *  provider has accepted it (that is when it is charged). Nothing is claimed for
 *  a swap that failed or was canceled: the old screen did not know either. */
export function swapVersions(swaps:Swap[]):Version[]{
 return swaps.map((s,i)=>{
  const n=swaps.length-i,working=busySwap(s);
  const base={id:s.id,n,src:s.data.imageIds[0]?'/api/assets/'+s.data.imageIds[0]:undefined,quality:qualityOf(s.data.resolution),at:new Date(s.createdAt).toLocaleDateString()};
  if(working)return {...base,status:'working' as const,used:null,label:`Version ${n}`,
   stage:UNSETTLED.includes(s.status)?statusWords(s.status):`${statusWords(s.status)} · ${creditsLabel(s.credits)} used`,
   held:UNSETTLED.includes(s.status)?s.credits:undefined};
  return {...base,status:'ready' as const,used:s.status==='ready'?s.credits:null,label:s.status==='ready'?`Version ${n}`:`Version ${n} · ${statusWords(s.status)}`};
 });
}

export function SwapAlert({error,onDismiss}:{error:string;onDismiss:()=>void}){
 if(!error)return null;
 return <Banner kind="bad" icon={<AlertTriangle/>}><span className="editor-swap-alert">{error}<IconButton label="Dismiss" size="sm" onClick={onDismiss}><X aria-hidden="true"/></IconButton></span></Banner>;
}

export function SwapAdSection({name,seconds,onFile,busy,disabled}:{name?:string;seconds?:number;onFile:(file:File)=>unknown;busy?:boolean;disabled?:boolean}){
 return <SettingsSection title="Reference ad" id="swap-ad-title">
  <DropZone kind="video" name="reference ad" label="Drop or upload your reference ad" hint="MP4 · 4–30 seconds · at least 409,600 pixels per frame · up to 48 MB"
   value={name?'ad':null} valueName={name} valueMeta={typeof seconds==='number'?`${seconds.toFixed(1)} seconds`:undefined}
   onFile={onFile} busy={busy?'Uploading your ad…':false} disabled={disabled}/>
  <p className="ds-help">The ad guides the camera move, timing and scene. Use an ad you have permission to edit.</p>
 </SettingsSection>;
}

export function SwapCarViews({views,onRemove,onFile,disabled,configuratorUrl}:{views:CarView[];onRemove:(id:string)=>void;onFile:(file:File)=>unknown;disabled?:boolean;configuratorUrl:string}){
 return <SettingsSection title="Car views" id="swap-views-title">
  <div className="editor-row editor-swap-views-head"><span className="ds-label">{views.length} / 8 car views</span></div>
  <DropZone name="car picture" label="Drop, paste or upload a picture of the car" hint={views.length>=8?'You have eight car views. Remove one to add another.':'PNG, JPEG or WebP · up to 40 MB. You crop it next.'} onFile={onFile} disabled={disabled||views.length>=8}/>
  {views.length?<ol className="editor-swap-refs" aria-label="Car views">{views.map((v,i)=><li key={v.id} className="editor-swap-ref">
    {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    <img crossOrigin="anonymous" src={'/api/assets/'+v.id} alt={'Car reference '+(i+1)}/>
    <span className="ds-truncate" title={v.label}>{i+1}. {v.label}</span>
    <IconButton label={'Remove car reference '+(i+1)} size="sm" kind="secondary" disabled={disabled} onClick={()=>onRemove(v.id)}><X aria-hidden="true"/></IconButton>
   </li>)}</ol>
   :<p className="ds-help">Capture a clean front three-quarter view first. Add side and rear angles if the ad shows them. Two to four angles work best.</p>}
  <p className="ds-help">The car views define the exact model, colour and trim. The swap follows the reference ad’s movement and setting.</p>
  <a className="ds-link editor-swap-open" href={configuratorUrl} target="_blank" rel="noreferrer">Open the configurator in a tab <ExternalLink aria-hidden="true"/></a>
 </SettingsSection>;
}

/** Quality, on the old two resolutions. The cost comes from the provider's
 *  quote for the ad's length, so no fixed price is shown per choice. */
export function SwapQuality({value,onChange,disabled}:{value:Quality;onChange:(q:Quality)=>void;disabled?:boolean}){
 const name='swap-quality'+React.useId().replace(/[^a-zA-Z0-9]/g,'');
 return <SettingsSection title="Quality" id="swap-quality-title">
  <RadioGroup legend="Quality" className="editor-quality">
   <Radio name={name} checked={value==='standard'} disabled={disabled} onChange={()=>onChange('standard')} label={<span className="editor-quality-label">Standard<span className="ds-muted">480p</span></span>} help="A lower-cost test."/>
   <Radio name={name} checked={value==='high'} disabled={disabled} onChange={()=>onChange('high')} label={<span className="editor-quality-label">High detail<span className="ds-muted">720p</span></span>} help="Sharper; for the final."/>
  </RadioGroup>
 </SettingsSection>;
}

/** Who provides the AI, for companies without their own keys (NmesisProvides, on the design system). */
function SwapProvides(){
 const o=useCredits(),left=o?.meter?.left;
 return <div className="editor-swap-note"><Coins aria-hidden="true"/><span><b>Nmesis provides the AI for your plan.</b>
  <span className="ds-help">{o?.unlimited?'This is Nmesis’s own workspace: actions here are recorded and not counted against a client.':typeof left==='number'?`Your company has ${creditsLabel(left)} left this month. `:''}{o&&!o.unlimited&&o.usage&&<Link className="ds-link" href="/usage">Usage</Link>}</span>
  {o?.ignoredKeys&&<span className="ds-help">{o.ignoredKeys}</span>}</span></div>;
}

/** The video connection, under Advanced (staff, companies with their own keys). */
export function SwapConnectionSection({connection,w,keyValue,onKey,onSave,disabled}:{connection:SwapConnection|null;w:(t:string)=>string;keyValue:string;onKey:(v:string)=>void;onSave:()=>void;disabled?:boolean}){
 return <>
  {connection&&!connection.ownKeys?<SwapProvides/>
   :!connection?.connected?<div className="editor-swap-note"><LockKeyhole aria-hidden="true"/><span>
     <b>{connection?.sponsored?'Your company’s own key':w('Connect your Higgsfield key (optional)')}</b>
     <span className="ds-help">{connection?.sponsored?w('Your company’s owner can connect its own Higgsfield developer key. Until then, Nmesis provides the AI and your company spends credits.'):w('Your plan includes your own keys. Paste your Higgsfield developer credential once to render on your account (0 credits); without it, Nmesis provides the AI and your company spends credits.')}</span>
    </span></div>
   :<p className="ds-help editor-swap-connected"><LockKeyhole aria-hidden="true"/>{w('Your company’s Higgsfield key is connected · renders cost 0 credits')}</p>}
  {!(connection&&!connection.ownKeys)&&!connection?.connected&&!connection?.sponsored&&<>
   <Field label={w('Higgsfield API credential')}><Input type="password" autoComplete="off" value={keyValue} onChange={e=>onKey(e.target.value)}/></Field>
   <div className="editor-row"><Button size="sm" disabled={disabled||keyValue.trim().length<20} onClick={onSave}>Save video connection</Button></div>
  </>}
 </>;
}

/** The cost, once estimated: the most it can cost, the approval and Refresh
 *  estimate. Before the estimate, Generate's note says how it is worked out. */
export function SwapCostSection({quote,label,showNames,creditsLeft,approved,onApprove,onRefresh,overBudget,disabled}:{
 quote:boolean;label:string;showNames:boolean;creditsLeft?:number;approved:boolean;onApprove:(v:boolean)=>void;onRefresh:()=>void;overBudget:boolean;disabled?:boolean}){
 if(!quote)return null;
 return <SettingsSection title="Cost" id="swap-cost-title">
  <>
   <p className="editor-swap-estimate"><span className="ds-label">Maximum cost at the current rate</span><b>{label}</b></p>
   <p className="ds-help">{showNames?'From Higgsfield’s current rate and the rounded-up video length.':'From the current rate and the rounded-up video length.'} It is checked again before submission; a higher amount needs new approval.{typeof creditsLeft==='number'?` Your company has ${creditsLabel(creditsLeft)} left this month.`:''}</p>
   <Checkbox checked={approved} disabled={disabled} onChange={e=>onApprove(e.target.checked)} label="I approve up to these credits for this ad and car."/>
   <div className="editor-row"><Button size="sm" kind="quiet" disabled={disabled} onClick={onRefresh}>Refresh estimate</Button></div>
   {overBudget&&<p className="ds-error"><AlertTriangle aria-hidden="true"/>Not enough credits left this month for this swap. Ask Nmesis to add a pack.</p>}
  </>
 </SettingsSection>;
}

type Box={x:number;y:number;w:number;h:number};
const point=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};

/** Frame the car: drag to crop out configurator controls, or use the whole picture. */
export function SwapCropDialog({src,onClose,onAdd}:{src:string;onClose:()=>void;onAdd:(file:File,original:Blob)=>void}){
 const [box,setBox]=React.useState<Box|null>(null),[problem,onError]=React.useState('');
 const image=React.useRef<HTMLImageElement>(null),drag=React.useRef<{x:number;y:number}|null>(null);
 async function save(){
  const img=image.current;if(!img||!img.naturalWidth)return;
  onError('');const b=box||{x:0,y:0,w:1,h:1};
  if(b.w<.1||b.h<.1){onError('Choose a larger area around the car.');return}
  const c=document.createElement('canvas'),w=img.naturalWidth*b.w,h=img.naturalHeight*b.h;
  c.width=Math.round(w);c.height=Math.round(h);
  const g=c.getContext('2d');if(!g){onError('The cropped image could not be saved.');return}
  g.drawImage(img,img.naturalWidth*b.x,img.naturalHeight*b.y,w,h,0,0,c.width,c.height);
  const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',0.91));
  if(!blob){onError('The cropped image could not be saved.');return}
  let original:Blob;
  try{original=await (await fetch(src)).blob()}catch{original=blob}
  onAdd(new File([blob],'car-view.jpg',{type:'image/jpeg'}),original);
 }
 return <Dialog open wide onClose={onClose} title="Frame the car" footer={<><Button onClick={()=>setBox(null)}>Use full image</Button><Button kind="primary" icon={<Check aria-hidden="true"/>} onClick={()=>void save()}>Add car view</Button></>}>
  <p className="ds-help">Drag to crop out configurator controls. Keep the full car visible.</p>
  {problem&&<p className="ds-error" role="alert"><AlertTriangle aria-hidden="true"/>{problem}</p>}
  <div className="editor-swap-crop" onPointerDown={e=>{drag.current=point(e);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;const p=point(e),s=drag.current;setBox({x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)})}} onPointerUp={()=>{drag.current=null}}>
   {/* eslint-disable-next-line @next/next/no-img-element -- a local capture, not a page image */}
   <img crossOrigin="anonymous" ref={image} src={src} alt="Capture to crop" draggable={false}/>
   {box&&<div className="editor-swap-crop-box" style={{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'}}/>}
  </div>
 </Dialog>;
}
