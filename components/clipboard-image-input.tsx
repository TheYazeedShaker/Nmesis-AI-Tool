'use client';
import {useRef,useState,type ClipboardEvent} from 'react';
import {ClipboardPaste,Upload} from 'lucide-react';
import {clipboardImage,readClipboardImage,validateClipboardImage} from '@/lib/clipboard-image';
export function ClipboardImageInput({label,onImage,disabled=false,compact=false,onUpload}:{compact?:boolean;onUpload?:()=>void;label:string;onImage:(file:File)=>void|Promise<void>;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),zone=useRef<HTMLDivElement>(null);
 async function accept(file:File){await onImage(validateClipboardImage(file));}
 async function paste(event:ClipboardEvent<HTMLDivElement>){
  const file=clipboardImage(event.clipboardData);if(!file)return;
  event.preventDefault();event.stopPropagation();if(disabled||lock.current)return;
  lock.current=true;setBusy(true);setMessage('');
  try{await accept(file)}catch(e){setMessage((e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 async function read(){
  if(disabled||lock.current)return;zone.current?.focus();
  if(!navigator.clipboard?.read){setMessage('Click this box and press ⌘V on Mac or Ctrl+V on Windows to paste your screenshot.');return;}
  lock.current=true;setBusy(true);setMessage('');
  try{await accept(await readClipboardImage(navigator.clipboard))}catch(e){setMessage((e as Error).name==='NotAllowedError'?'Clipboard access was not allowed. Click this box and press ⌘V or Ctrl+V instead.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 return <div ref={zone} className={'clipboard-image-input'+(compact?' compact-paste':'')} role="group" aria-label={'Paste '+label} tabIndex={disabled?-1:0} onPaste={paste} aria-disabled={disabled||busy}>
  <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void read()}><ClipboardPaste size={16}/>{busy?'Adding image…':compact?'Paste image':'Paste '+label}</button>
  {onUpload&&<button type="button" className="secondary" disabled={disabled||busy} onClick={onUpload}><Upload size={16}/>Upload image</button>}<span>{compact?'⌘V / Ctrl+V':'Copy a screenshot, then click here and press ⌘V / Ctrl+V.'}</span>
  {message&&<p role="status">{message}</p>}
 </div>;
}
