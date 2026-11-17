'use client';
import {useUndoableRemoval} from '@/components/undo-removal';
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {useId,useRef,useState} from 'react';
import {AlertCircle,KeyRound,Trash2} from 'lucide-react';
import {Dialog,useConfirm} from '@/components/ds/dialog';
import {Button} from '@/components/ds/button';
import {Field,Input} from '@/components/ds/field';
import {Badge} from '@/components/ds/feedback';
import {GEMINI_IMAGE_MODELS,type GoogleConnectionStatus} from '@/lib/image-models';
import {NmesisProvides} from '@/components/credits';
// Item 7b: a design-system Dialog (native <dialog>, top layer), so it opens over
// Line-up's area-edit dialog and the phone settings sheet. The wrapper keeps
// Escape here from also closing a dialog it sits inside (React passes `cancel`
// up the tree).
// A dialog inside another: its Escape (cancel) stops here.
const ownCancel={onCancel:(e:React.SyntheticEvent)=>e.stopPropagation()};
export function GoogleConnection({open,onOpenChange,status,onUpdate}:{open:boolean;onOpenChange:(open:boolean)=>void;status:GoogleConnectionStatus|null;onUpdate:()=>Promise<void>}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const host=useRef<HTMLDivElement>(null),describe=useId().replace(/[^a-zA-Z0-9]/g,'')+'-d';
  function changeOpen(value:boolean){if(busy)return;setKey('');setError('');setNotice('');onOpenChange(value)}
  const removeLater=useUndoableRemoval(),ask=useConfirm();
  async function save(remove=false){
    // Removing waits for Undo (components/undo-removal.tsx); the dialog closes so the toast can be reached.
    // Inside another open dialog (Line-up's area edit) the toast stays out of reach: there, ask first.
    if(remove){if(host.current?.closest('dialog[open]')&&!await ask({title:w('Remove your Google key?'),body:<p>{w('The saved Google key is removed from your account. You can add a key again at any time.')}</p>,verb:'Remove key',danger:true}))return;onOpenChange(false);removeLater({message:w('Your Google key will be removed.'),url:'/api/google/connection',removed:onUpdate});return}
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/google/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),...remove?{}:{body:JSON.stringify({key:key.trim()})}});
      const data=await response.json() as {error?:string;notice?:string};if(!response.ok)throw new Error(data.error||w('Could not update your Google connection.'));
      setNotice(remove?w('Google key removed.'):data.notice||'Connection updated.');await onUpdate();
    }catch(e){setError(e instanceof Error?(e.name==='TimeoutError'?'Checking the key took too long. Try again.':e.message):w('Could not connect to Google.'))}finally{setKey('');setBusy(false)}
  }
  const title=(words:string)=><span className="tp-dialog-title"><KeyRound aria-hidden="true"/>{words}</span>;
  // Without studio.own_keys there are no key fields: Nmesis provides the AI.
  if(status&&!status.ownKeys)return <div ref={host} className="ds-contents" {...ownCancel}><Dialog open={open} onClose={()=>changeOpen(false)} title={title(w('Nano Banana'))} describedBy={describe} className="tp-dialog">
    <div className="ds-stack"><p id={describe} className="ds-help">{w('Nano Banana Pro and Nano Banana 2.1 use the AI Nmesis provides. Each image shows its cost in credits before it starts.')}</p><NmesisProvides provider="google"/></div>
  </Dialog></div>;
  return <div ref={host} className="ds-contents" {...ownCancel}><Dialog open={open} onClose={()=>changeOpen(false)} title={title(w('Google AI Studio connection'))} describedBy={describe} className="tp-dialog">
    <div className="ds-stack">
    <p id={describe} className="ds-help">Your plan includes your own provider keys. With your Google key connected, Nano Banana is billed to your Google project and costs 0 credits; without it, Nmesis provides the AI and your company spends credits.</p>
    {status?.sponsored?<p className="ds-help">Your company’s owner manages this connection. No API key is needed from you.</p>:<><ol className="tp-steps ds-help"><li>Open <a className="ds-link" href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">{w('Google AI Studio ↗')}<span className="ds-sr-only"> (opens in a new tab)</span></a> and create an API key.</li><li>Enable billing for that key’s project.</li><li>Paste the key below. Verification does not generate an image.</li></ol>
    <form className="tp-form" onSubmit={e=>{e.preventDefault();void save()}}>
     <Field id="google-api-key" label={status?.connected?w('Replace Google API key'):w('Google API key')} help="Encrypted on the server for your signed-in account. Never saved in browser storage or shown again."><Input type="password" placeholder="Paste your Google AI Studio key" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} disabled={busy}/></Field>
     <Button kind="primary" type="submit" busy={busy} disabled={busy||!key.trim()||!status?.keySetup}>{busy?'Checking connection…':w('Verify & save Google key')}</Button>
    </form></>}
    {status?.connected&&<ul className="tp-models" aria-label="Models this key can use">{GEMINI_IMAGE_MODELS.map(m=><li key={m.id}><span>{m.label}</span><Badge kind={status.models.includes(m.id)?'ok':'quiet'}>{status.models.includes(m.id)?'Available':'Not available to this key'}</Badge></li>)}</ul>}
    {error&&<p className="ds-error" role="alert"><AlertCircle aria-hidden="true"/>{error}</p>}{notice&&<p className="tp-notice" role="status">{notice}</p>}
    <p className="ds-help">{w('Model access checks do not confirm available billing credit on your Google project.')}</p>
    {status?.connected&&!status.sponsored&&<div><Button kind="danger-quiet" size="sm" icon={<Trash2 aria-hidden="true"/>} disabled={busy} onClick={()=>void save(true)}>{w('Remove Google key')}</Button></div>}
    </div>
  </Dialog></div>;
}
