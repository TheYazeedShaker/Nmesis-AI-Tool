'use client';
import * as React from 'react';
import {CloudCheck,CloudOff,Eye,LoaderCircle,RotateCw} from 'lucide-react';
import {SAVE_WORDS,type SaveStatus as Status} from '@/lib/editor/autosave';

// The save status in the canvas bar, always visible (docs/editor-rules.md,
// rule 9): "Saving…", "Saved", "Offline, changes kept" or "Couldn't save,
// retry" (then the words are the Retry button). A person who can't change the
// design reads "View only" instead. Spoken politely when it changes.
export function SaveStatus({status,detail,viewOnly,onRetry}:{status:Status;detail?:string;viewOnly?:string|false;onRetry:()=>void}){
 if(viewOnly)return <span className="canvas-save" data-save-status="view" role="status"><Eye aria-hidden="true"/><span>{viewOnly}</span></span>;
 const words=SAVE_WORDS[status];
 if(status==='error')return <button type="button" className="canvas-save canvas-save-error" data-save-status="error" onClick={onRetry} title={detail?`${detail} Press to try again.`:'Press to try again.'}>
  <RotateCw aria-hidden="true"/><span>{words}</span>
 </button>;
 const Icon=status==='saving'?LoaderCircle:status==='offline'?CloudOff:CloudCheck;
 const title=status==='offline'?'Your changes are kept on this device and saved when you’re back online.':status==='saved'?'Your changes are saved as a working draft. Save makes a new version of the picture.':undefined;
 return <span className="canvas-save" data-save-status={status} role="status" aria-live="polite" title={title}>
  <Icon aria-hidden="true" className={status==='saving'?'ds-spin-icon':undefined}/><span>{words}</span>
 </span>;
}
