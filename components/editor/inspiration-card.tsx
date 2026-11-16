'use client';
import * as React from 'react';
import {Lock} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Input} from '@/components/ds/field';
import {DropZone} from '@/components/ds/drop-zone';
import {AskNmesis,PLAN_ENDED_CHIP,hasFeature,planEnded,useAccount} from '@/components/studio-account';
import {upsellWords} from '@/lib/ds/words';
import {SettingsSection} from './parts';

// Inspiration, as one card in the settings panel (Key visual and Line-up):
// one line of help, the reference picture (the design-system drop zone), then
// the Pinterest link with its own button. The mood question is the link's help
// line. When the plan has no Pinterest import (studio.pinterest), the field and
// its button are disabled and one line says which plan has it. Styles:
// app/inputs.css (.editor-insp-*).

export type InspirationPicture={
 value:string|null;name?:React.ReactNode;alt?:string;
 onFile:(file:File)=>unknown;onRemove?:()=>void;
 error?:React.ReactNode;busy?:boolean|string;disabled?:boolean;
 /** Under the thumbnail: a link to the original, a Retry button. */extra?:React.ReactNode;
};
export type InspirationLink={
 value:string;onChange:(value:string)=>void;onAdd:()=>void;
 busy?:boolean;error?:React.ReactNode;disabled?:boolean;
 /** While the link is read ("Finding the largest Pinterest image…"). */status?:React.ReactNode;
};

export function InspirationCard({id,help,mood,picture,link,children}:{
 id:string;help:React.ReactNode;
 /** The question under the link ("What’s the mood? …"). */mood:React.ReactNode;
 picture:InspirationPicture;link:InspirationLink;children?:React.ReactNode;
}){
 const account=useAccount();const allowed=hasFeature(account,'studio.pinterest');
 const auto=React.useId(),field=`insp${auto.replace(/[^a-zA-Z0-9]/g,'')}`,helpId=`${field}-help`,errorId=`${field}-error`;
 const off=!allowed||!!link.disabled;
 return <SettingsSection title="Inspiration" id={id}>
  <div className="editor-insp">
   <p className="ds-help">{help}</p>
   <DropZone name="reference picture" label="Drop, paste or upload a reference picture" hint="PNG, JPEG or WebP · up to 40 MB"
    value={picture.value} valueName={picture.name} valueAlt={picture.alt||'Your inspiration reference'}
    onFile={picture.onFile} onRemove={picture.onRemove} error={picture.error} busy={picture.busy} disabled={picture.disabled}>{picture.extra}</DropZone>
   <p className="editor-insp-or" aria-hidden="true">or</p>
   <div className="ds-field">
    <label className="ds-label" htmlFor={field}>Paste a Pinterest link</label>
    <div className="editor-insp-link">
     <Input id={field} type="url" inputMode="url" value={link.value} disabled={off} placeholder="https://www.pinterest.com/pin/…"
      aria-describedby={link.error&&allowed?errorId:helpId} aria-invalid={link.error&&allowed?true:undefined}
      onChange={e=>link.onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!off&&link.value.trim()&&!link.busy){e.preventDefault();link.onAdd()}}}/>
     <Button size="sm" busy={link.busy} disabled={off||!link.value.trim()} onClick={link.onAdd}>Add link</Button>
    </div>
    {!allowed&&account
     ?<p className="editor-insp-upsell" id={helpId}><Lock aria-hidden="true"/>{planEnded(account)?PLAN_ENDED_CHIP:upsellWords(account.upsell['studio.pinterest'])}<span aria-hidden="true">·</span><AskNmesis feature="studio.pinterest" ended={planEnded(account)}/></p>
     :link.error?<p className="ds-error" id={errorId} role="alert">{link.error}</p>
     :<p className="ds-help" id={helpId}>{mood}</p>}
    {allowed&&link.status&&<p className="ds-help" role="status">{link.status}</p>}
   </div>
   {children}
  </div>
 </SettingsSection>;
}
