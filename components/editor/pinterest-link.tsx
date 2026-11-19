'use client';
import * as React from 'react';
import {Lock} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Input} from '@/components/ds/field';
import {AskNmesis,PLAN_ENDED_CHIP,hasFeature,planEnded,useAccount} from '@/components/studio-account';
import {upsellWords} from '@/lib/ds/words';

// A Pinterest link with its own Add button, for a tool's reference list
// (components/editor/reference-list.tsx; Car lineup's inspiration). The help
// line asks the mood. When the plan has no Pinterest import (studio.pinterest),
// the field and its button are disabled and one line says which plan has it.
// Styles: app/inputs.css (.editor-pin-*).
export function PinterestLink({value,onChange,onAdd,busy,error,disabled,status,help}:{
 value:string;onChange:(value:string)=>void;onAdd:()=>void;
 busy?:boolean;error?:React.ReactNode;disabled?:boolean;
 /** While the link is read ("Finding the largest Pinterest image…"). */status?:React.ReactNode;
 /** The question under the link ("What’s the mood? …"). */help:React.ReactNode;
}){
 const account=useAccount();const allowed=hasFeature(account,'studio.pinterest');
 const auto=React.useId(),field=`pin${auto.replace(/[^a-zA-Z0-9]/g,'')}`,helpId=`${field}-help`,errorId=`${field}-error`;
 const off=!allowed||!!disabled;
 return <div className="ds-field">
  <label className="ds-label" htmlFor={field}>Paste a Pinterest link</label>
  <div className="editor-pin-link">
   <Input id={field} type="url" inputMode="url" value={value} disabled={off} placeholder="https://www.pinterest.com/pin/…"
    aria-describedby={error&&allowed?errorId:helpId} aria-invalid={error&&allowed?true:undefined}
    onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!off&&value.trim()&&!busy){e.preventDefault();onAdd()}}}/>
   <Button size="sm" busy={busy} disabled={off||!value.trim()} onClick={onAdd}>Add link</Button>
  </div>
  {!allowed&&account
   ?<p className="editor-pin-upsell" id={helpId}><Lock aria-hidden="true"/>{planEnded(account)?PLAN_ENDED_CHIP:upsellWords(account.upsell['studio.pinterest'])}<span aria-hidden="true">·</span><AskNmesis feature="studio.pinterest" ended={planEnded(account)}/></p>
   :error?<p className="ds-error" id={errorId} role="alert">{error}</p>
   :<p className="ds-help" id={helpId}>{help}</p>}
  {allowed&&status&&<p className="ds-help" role="status">{status}</p>}
 </div>;
}
