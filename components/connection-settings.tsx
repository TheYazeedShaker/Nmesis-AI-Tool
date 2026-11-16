"use client";
import {useUndoableRemoval} from '@/components/undo-removal';
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {useId,useRef,useState} from 'react';
import {AlertCircle,KeyRound,ShieldCheck,Trash2} from 'lucide-react';
import {Dialog,useConfirm} from '@/components/ds/dialog';
import {Button} from '@/components/ds/button';
import {Field,Input} from '@/components/ds/field';
import {NmesisProvides} from '@/components/credits';
export type ConnectionStatus={generation:boolean;storage:boolean;personalKey?:boolean;keySetup?:boolean;signedOut?:boolean;sponsored?:boolean;sponsorPending?:boolean;ownKeys?:boolean;nmesis?:boolean};
// Item 7b: a design-system Dialog (native <dialog>, top layer), so it opens over
// another open dialog or the phone settings sheet. The wrapper keeps Escape here
// from also closing a dialog it sits inside (React passes `cancel` up the tree).
// A dialog inside another: its Escape (cancel) stops here.
const ownCancel={onCancel:(e:React.SyntheticEvent)=>e.stopPropagation()};
export function ConnectionSettings({open,onOpenChange,status,onUpdate}:{open:boolean;onOpenChange:(value:boolean)=>void;status:ConnectionStatus|null;onUpdate:()=>Promise<void>}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const [key,setKey]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const host=useRef<HTMLDivElement>(null),describe=useId().replace(/[^a-zA-Z0-9]/g,'')+'-d';
 async function check(){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/connection',{cache:'no-store',signal:AbortSignal.timeout(30000)});const d=await r.json() as {error?:string;notice:string};if(!r.ok)throw new Error(d.error||'Access check failed.');setNotice(d.notice)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function changeOpen(value:boolean){if(busy)return;setKey('');setError('');setNotice('');onOpenChange(value)}
 const removeLater=useUndoableRemoval(),ask=useConfirm();
 async function submit(remove=false){
  // Removing waits for Undo (components/undo-removal.tsx); the dialog closes so the toast can be reached.
  // Inside another open dialog the toast stays out of reach: there, ask first.
  if(remove){if(host.current?.closest('dialog[open]')&&!await ask({title:w('Remove your saved OpenAI key?'),body:<p>The saved key is removed from your account. You can add a key again at any time.</p>,verb:'Remove key',danger:true}))return;onOpenChange(false);removeLater({message:w('Your saved OpenAI key will be removed.'),url:'/api/connection',removed:onUpdate});return}
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),...(remove?{}:{body:JSON.stringify({key:key.trim()})})});
   const data=await response.json() as {error?:string;notice?:string};if(!response.ok)throw new Error(data.error||'The connection could not be updated.');
   setNotice(remove?'Your saved key has been removed.':data.notice||'Connection updated.');await onUpdate();
  }catch(e){setError(e instanceof Error?(e.name==='TimeoutError'?'Checking the key took too long. Try again.':e.message):'Connection failed. Please try again.')}finally{setKey('');setBusy(false)}
 }
 const title=(words:string)=><span className="tp-dialog-title"><KeyRound aria-hidden="true"/>{words}</span>;
 // Without studio.own_keys there are no key fields: Nmesis provides the AI.
 if(status&&!status.ownKeys)return <div ref={host} className="ds-contents" {...ownCancel}><Dialog open={open} onClose={()=>changeOpen(false)} title={title('AI connection')} describedBy={describe} className="tp-dialog">
  <div className="ds-stack"><p id={describe} className="ds-help">Key visuals, area edits and smart references use the AI Nmesis provides. Each action shows its cost in credits before it starts.</p><NmesisProvides provider="openai"/></div>
 </Dialog></div>;
 return <div ref={host} className="ds-contents" {...ownCancel}><Dialog open={open} onClose={()=>changeOpen(false)} title={title(w('OpenAI connection'))} describedBy={describe} className="tp-dialog">
 <div className="ds-stack">
 <p id={describe} className="ds-help">{status?.sponsored?"Your company’s owner manages the company’s own OpenAI key. Without it, Nmesis provides the AI and your company spends credits.":"Your plan includes your own provider keys. With your OpenAI key connected, generation is billed to that account and costs 0 credits; without it, Nmesis provides the AI and your company spends credits."}</p>
 <div className="tp-key-status"><ShieldCheck aria-hidden="true"/><span>{status?.sponsored?(status.generation?'Connected through your company':'Waiting for your company’s owner'):status?.personalKey?'Your key is connected':status?.generation?'Studio connection is active':'Add your API key'}<small>{status?.sponsored?'You do not need to enter an API key.':status?.personalKey?'The saved key is never displayed again.':'Your key stays private to your signed-in account.'}</small></span></div>
 {!status?.sponsored&&<form className="tp-form" onSubmit={e=>{e.preventDefault();void submit()}}>
  <Field id="openai-key" label={status?.personalKey?'Replace your API key':w('OpenAI API key')} help="Encrypted before saving. Used by the studio server to contact OpenAI; never included in images, exports or browser storage."><Input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste your API key here" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} disabled={busy||status?.signedOut}/></Field>
  <Button kind="primary" type="submit" busy={busy} icon={<ShieldCheck aria-hidden="true"/>} disabled={busy||!key.trim()||!status?.keySetup||status?.signedOut}>{busy?'Updating connection…':'Verify & save key'}</Button>
 </form>}
 <div><Button disabled={busy||!status?.generation} onClick={()=>void check()}>{busy?'Checking connection…':'Check image access (no charge)'}</Button></div>
 {error&&<p className="ds-error" role="alert"><AlertCircle aria-hidden="true"/>{error}</p>}{notice&&<p className="tp-notice" role="status">{notice}</p>}
 {!status?.sponsored&&(notice||status?.personalKey)&&<p className="ds-help">{w('Verifying a key can’t see your OpenAI credit balance. If the account has no credit left, a generation stops at once with that message and nothing is charged here.')}</p>}
 {status?.sponsored?(status.sponsorPending&&<p className="ds-help">{w('Ask your company’s owner to connect OpenAI here. If your plan does not include your own keys, ask Nmesis.')}</p>):status?.signedOut?<p className="ds-help">Sign in to the studio before adding your key.</p>:!status?.keySetup&&<p className="ds-help">Secure key storage is not ready. Please check again after the studio is published.</p>}
 {!status?.sponsored&&<div className="tp-links ds-row"><a className="ds-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">{w('Get an OpenAI API key ↗')}<span className="ds-sr-only"> (opens in a new tab)</span></a>{status?.personalKey&&<Button kind="danger-quiet" size="sm" icon={<Trash2 aria-hidden="true"/>} onClick={()=>void submit(true)} disabled={busy}>Remove saved key</Button>}</div>}
 </div>
 </Dialog></div>;
}
