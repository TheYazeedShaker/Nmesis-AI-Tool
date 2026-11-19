'use client';
import * as React from 'react';
import {ImagePlus,Upload,X} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {DropZone} from '@/components/ds/drop-zone';
import {Select,Switch} from '@/components/ds/field';
import {ReferenceCredit} from '@/components/references/references-panel';
import type {TrayItem} from '@/lib/reference-tray';
import {SettingsRow,SettingsSection} from './parts';

// The one reference list of the settings panel, for every tool that reads the
// reference tray (lib/reference-tray.ts): Key visual's References (up to six)
// and Car lineup's Inspiration (one: referenceLimit('lineup')). The pictures
// with their credits and a remove button, or the drop zone while there are
// none; "Add references" opens the References panel, Upload adds a file. With
// a limit of one, a new picture replaces the one there (the shell's
// addAsReference) and the words say "inspiration". Smart pick (Key visual)
// picks photos of the chosen car when none were added by hand; a tool's own
// controls (Car lineup's Pinterest link and strict switch) go in `children`.
// Styles: app/editor.css (.editor-ref-*, .editor-smart-*).
export const PICK_COUNTS=[1,2,3,4] as const;

export type SmartPick={
 on:boolean;onChange:(on:boolean)=>void;
 /** How many photos it adds (PICK_COUNTS). */count:number;onCount:(n:number)=>void;
 /** What Smart pick can do here: picking, done, or why it can't. */state:{kind:'ready'|'picking'|'none'|'unavailable'};
};

export type ReferenceListProps={
 /** The section title's id. */id:string;title:string;
 /** One line under the title: what the pictures are for. */help?:React.ReactNode;
 items:readonly TrayItem[];
 /** How many the tool uses (referenceLimit): 1 makes it one inspiration that a new picture replaces. */limit:number;
 /** Opens the References panel. */onAdd:()=>void;
 /** A file chosen, dropped or pasted; may return a promise (the drop zone waits for it). */onFile:(file:File)=>unknown;
 onRemove:(key:string)=>void;
 /** An upload in progress ("Uploading…"), or ''. */busy?:string;error?:React.ReactNode;disabled?:boolean;
 smart?:SmartPick;
 /** The tool's own controls, under the list. */children?:React.ReactNode;
};

export function ReferenceList({id,title,help,items,limit,onAdd,onFile,onRemove,busy,error,disabled,smart,children}:ReferenceListProps){
 const file=React.useRef<HTMLInputElement>(null),auto=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const one=limit===1,shown=items.slice(0,limit),full=!one&&shown.length>=limit;
 const label=(r:TrayItem,i:number)=>r.picked?'Picked for you':one?'Your inspiration':i===0?'Main reference':`Reference ${i+1}`;
 return <SettingsSection title={title} id={id}>
  {help&&<p className="ds-help">{help}</p>}
  {shown.length===0
   ?<DropZone name={one?'inspiration picture':'reference picture'} label={one?'Drop, paste or upload your inspiration':'Drop, paste or upload a picture'} hint="PNG, JPEG or WebP · up to 40 MB" onFile={onFile} disabled={disabled||!!busy}/>
   :<ul className="editor-ref-list" data-single={one||undefined} aria-label={one?'Your inspiration':'Your references'}>{shown.map((r,i)=><li key={r.key} className="editor-ref">
    <span className="editor-ref-thumb">
     {/* eslint-disable-next-line @next/next/no-img-element -- a provider's hotlinked photo or a private picture on a signed link */}
     <img src={r.thumb||r.src} alt={r.name} loading="lazy" decoding="async"/>
     <button type="button" className="ds-btn icon sm editor-ref-remove" aria-label={one?'Remove the inspiration':`Remove reference ${i+1}`} disabled={disabled} onClick={()=>onRemove(r.key)}><X aria-hidden="true"/></button>
    </span>
    <span className="editor-ref-meta"><span className="ds-truncate">{label(r,i)}</span>{r.credit&&<ReferenceCredit credit={r.credit}/>}</span>
   </li>)}</ul>}
  {busy&&<p className="ds-help" role="status">{busy}</p>}
  {error&&<p className="ds-error" role="alert">{error}</p>}
  <div className="editor-row">
   <Button size="sm" icon={<ImagePlus aria-hidden="true"/>} disabled={disabled||full} onClick={onAdd}>{one?'Find a photo in References':'Add references'}</Button>
   {shown.length>0&&<Button size="sm" kind="quiet" icon={<Upload aria-hidden="true"/>} disabled={disabled||!!busy||full} onClick={()=>file.current?.click()}>Upload</Button>}
   {!one&&<span className="ds-muted editor-ref-count">{shown.length} / {limit}</span>}
  </div>
  {one&&shown.length>0&&<p className="ds-help">One inspiration at a time: a new picture replaces this one.</p>}
  <input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label={one?'Upload an inspiration picture':'Upload a reference picture'} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value=''}}/>
  {smart&&<SmartPickRow smart={smart} id={`${auto}-smart`} disabled={disabled}/>}
  {children}
 </SettingsSection>;
}

/** Smart pick as one row of the settings grid: its name in the label column; the switch and how many beside it. */
function SmartPickRow({smart,id,disabled}:{smart:SmartPick;id:string;disabled?:boolean}){
 const {on,onChange,count,onCount,state}=smart,available=state.kind!=='unavailable';
 const help=!available?'The photo library isn’t set up yet, so add your own references.'
  :state.kind==='picking'?'Picking photos of your car…'
  :state.kind==='none'?'No photos of this car were found. Add your own references.'
  :`Picks ${count===1?'a photo':`${count} photos`} of your car when you haven’t added any.`;
 return <SettingsRow label="Smart pick" htmlFor={id}>
  <span className="editor-smart-controls">
   <Switch id={id} label={null} checked={on&&available} disabled={disabled||!available} aria-describedby={`${id}-help`} onChange={e=>onChange(e.target.checked)}/>
   {on&&available&&<label className="editor-smart-count"><span className="ds-sr-only">How many photos Smart pick adds</span>
    <Select value={String(count)} disabled={disabled} onChange={e=>onCount(Number(e.target.value))}>{PICK_COUNTS.map(n=><option key={n} value={n}>{n} {n===1?'photo':'photos'}</option>)}</Select></label>}
  </span>
  <p className="ds-help" id={`${id}-help`}>{help}</p>
 </SettingsRow>;
}
