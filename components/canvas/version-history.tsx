'use client';
import * as React from 'react';
import {Dialog} from '@/components/ds/dialog';
import {Button} from '@/components/ds/button';
import {Loading,State} from '@/components/ds/feedback';
import {dateTime} from '@/lib/ds/words';
import {studioFetch} from '@/lib/studio-fetch';

// Version history (GET /api/edits/<picture>/versions): every version saved
// from this design, newest first, with when, who and Restore. Restoring makes a
// new version from that one (POST /api/edits/<version>/restore) and puts it on
// the canvas as one change (undo takes it back); no version is ever deleted or
// changed. Before migration 0012 the list says it isn't available yet.
export type Version={id:string;title:string;createdAt:number;mine:boolean;kind:'save'|'restore'|'copy'};
const KIND:Record<Version['kind'],string>={save:'Saved',restore:'Restored',copy:'Copy made'};

export function VersionHistory({open,pictureId,onClose,onRestore,busy}:{open:boolean;pictureId:string;onClose:()=>void;onRestore:(v:Version)=>void;busy:string|null}){
 type Shown={kind:'loading'}|{kind:'ready';ready:boolean;versions:Version[]}|{kind:'error'};
 const [attempt,setAttempt]=React.useState(0),key=`${pictureId}#${attempt}#${open}`;
 // Each opening (and Try again) loads afresh: an answer for an earlier one is not shown.
 const [got,setState]=React.useState<{key:string;shown:Shown}>({key:'',shown:{kind:'loading'}});
 const state:Shown=got.key===key?got.shown:{kind:'loading'};
 React.useEffect(()=>{
  if(!open)return;let live=true;
  studioFetch(`/api/edits/${pictureId}/versions`,{signal:AbortSignal.timeout(15_000)})
   .then(async r=>{const d=await r.json().catch(()=>({})) as {ready?:boolean;versions?:Version[]};if(!r.ok)throw new Error('versions '+r.status);if(live)setState({key,shown:{kind:'ready',ready:d.ready!==false,versions:Array.isArray(d.versions)?d.versions:[]}})})
   .catch((e:unknown)=>{console.warn('[editor] version history did not load',{reason:e instanceof Error?e.message:'unknown'});if(live)setState({key,shown:{kind:'error'}})});
  return()=>{live=false};
 },[open,pictureId,key]);
 return <Dialog open={open} onClose={onClose} title="Version history" variant="drawer">
  {state.kind==='loading'?<Loading label="Loading the versions"><div className="canvas-versions-skeleton"/></Loading>
   :state.kind==='error'?<State kind="error" title="The versions didn’t load" actions={<Button onClick={()=>setAttempt(n=>n+1)}>Try again</Button>}>Check your connection and try again.</State>
   :!state.ready?<State kind="empty" title="Version history isn’t on yet">It turns on after the next Studio update. Save still makes a new version each time.</State>
   :!state.versions.length?<State kind="empty" title="No versions yet">Each time you press Save, a new version appears here. Your changes in between are kept as a draft.</State>
   :<ol className="canvas-versions">{state.versions.map(v=><li key={v.id} className="canvas-version">
     <span className="canvas-version-words">
      <strong>{dateTime(v.createdAt)}</strong>
      <span className="ds-help">{KIND[v.kind]} · {v.mine?'You':'A teammate'}</span>
     </span>
     <Button size="sm" busy={busy===v.id} disabled={!!busy&&busy!==v.id} onClick={()=>onRestore(v)} aria-label={`Restore the version from ${dateTime(v.createdAt)}`}>Restore</Button>
    </li>)}</ol>}
  <p className="ds-help">Restoring makes a new version. No version is ever deleted.</p>
 </Dialog>;
}
