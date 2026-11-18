'use client';
import * as React from 'react';
import {ImagePlus,Upload,X} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {DropZone} from '@/components/ds/drop-zone';
import {Select,Switch} from '@/components/ds/field';
import {ReferenceCredit} from '@/components/references/references-panel';
import {TRAY_LIMIT,type TrayItem} from '@/lib/reference-tray';
import {SettingsSection} from './parts';

// References in the settings panel: the pictures that set the look (the
// place, the light, the framing). Added from the References panel (photos),
// Uploads, or dropped here; each can be removed. Smart pick (on by default)
// picks photos of the chosen car for you when you have added none, as many as
// you say. With several references, each visual takes the next one.
export const PICK_COUNTS=[1,2,3,4] as const;

export function ReferencesSettings({items,onAdd,onFile,onRemove,busy,error,smart,onSmart,count,onCount,smartState,disabled}:{
 items:TrayItem[];onAdd:()=>void;onFile:(file:File)=>void;onRemove:(key:string)=>void;
 /** An upload in progress ("Uploading…"), or ''. */busy?:string;error?:string;
 smart:boolean;onSmart:(on:boolean)=>void;count:number;onCount:(n:number)=>void;
 /** What Smart pick can do here: picking, done, or why it can't. */smartState:{kind:'ready'|'picking'|'none'|'unavailable'};
 disabled?:boolean;
}){
 const file=React.useRef<HTMLInputElement>(null),id=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const smartHelp=smartState.kind==='unavailable'?'The photo library isn’t set up yet, so add your own references.'
  :smartState.kind==='picking'?'Picking photos of your car…'
  :smartState.kind==='none'?'No photos of this car were found. Add your own references.'
  :`Picks ${count===1?'a photo':`${count} photos`} of your car when you haven’t added any.`;
 return <SettingsSection title="References" id="kv-references-title">
  {items.length===0
   ?<DropZone name="reference picture" label="Drop, paste or upload a picture" hint="Shows the look you want: the place, the light, the framing." onFile={onFile} disabled={disabled||!!busy}/>
   :<ul className="editor-refs" aria-label="Your references">{items.map((r,i)=><li key={r.key} className="editor-ref">
    <span className="editor-ref-thumb">
     {/* eslint-disable-next-line @next/next/no-img-element -- a provider's hotlinked photo or a private picture on a signed link */}
     <img src={r.thumb||r.src} alt={r.name} loading="lazy" decoding="async"/>
     <button type="button" className="ds-btn icon sm editor-ref-remove" aria-label={`Remove reference ${i+1}`} disabled={disabled} onClick={()=>onRemove(r.key)}><X aria-hidden="true"/></button>
    </span>
    <span className="editor-ref-meta"><span className="ds-truncate">{r.picked?'Picked for you':i===0?'Main reference':`Reference ${i+1}`}</span>{r.credit&&<ReferenceCredit credit={r.credit}/>}</span>
   </li>)}</ul>}
  {busy&&<p className="ds-help" role="status">{busy}</p>}
  {error&&<p className="ds-error" role="alert">{error}</p>}
  <div className="editor-row">
   <Button size="sm" icon={<ImagePlus aria-hidden="true"/>} disabled={disabled||items.length>=TRAY_LIMIT} aria-controls="studio-panel" onClick={onAdd}>Add references</Button>
   {items.length>0&&<Button size="sm" kind="quiet" icon={<Upload aria-hidden="true"/>} disabled={disabled||!!busy||items.length>=TRAY_LIMIT} onClick={()=>file.current?.click()}>Upload</Button>}
   <span className="ds-muted editor-ref-count">{items.length} / {TRAY_LIMIT}</span>
  </div>
  <input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload a reference picture" onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value=''}}/>
  <div className="editor-smart-pick">
   <Switch label="Smart pick" checked={smart&&smartState.kind!=='unavailable'} disabled={disabled||smartState.kind==='unavailable'} aria-describedby={`${id}-smart`} onChange={e=>onSmart(e.target.checked)}/>
   {smart&&smartState.kind!=='unavailable'&&<label className="editor-smart-count"><span className="ds-sr-only">How many photos Smart pick adds</span>
    <Select value={String(count)} disabled={disabled} onChange={e=>onCount(Number(e.target.value))}>{PICK_COUNTS.map(n=><option key={n} value={n}>{n} {n===1?'photo':'photos'}</option>)}</Select></label>}
  </div>
  <p className="ds-help" id={`${id}-smart`}>{smartHelp}</p>
 </SettingsSection>;
}
