'use client';
import {useUndoableRemoval} from '@/components/undo-removal';
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GEMINI_IMAGE_MODELS,type GoogleConnectionStatus} from '@/lib/image-models';
import {NmesisProvides} from '@/components/credits';
export function GoogleConnection({open,onOpenChange,status,onUpdate}:{open:boolean;onOpenChange:(open:boolean)=>void;status:GoogleConnectionStatus|null;onUpdate:()=>Promise<void>}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  function changeOpen(value:boolean){if(busy)return;setKey('');setError('');setNotice('');onOpenChange(value)}
  const removeLater=useUndoableRemoval();
  async function save(remove=false){
    // Removing waits for Undo (components/undo-removal.tsx); the dialog closes so the toast can be reached.
    if(remove){onOpenChange(false);removeLater({message:w('Your Google key will be removed.'),url:'/api/google/connection',removed:onUpdate});return}
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/google/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},...remove?{}:{body:JSON.stringify({key:key.trim()})}});
      const data=await response.json() as {error?:string;notice?:string};if(!response.ok)throw new Error(data.error||w('Could not update your Google connection.'));
      setNotice(remove?w('Google key removed.'):data.notice||'Connection updated.');await onUpdate();
    }catch(e){setError(e instanceof Error?e.message:w('Could not connect to Google.'))}finally{setKey('');setBusy(false)}
  }
  // Without studio.own_keys there are no key fields: Nmesis provides the AI.
  if(status&&!status.ownKeys)return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="connection-dialog"><DialogTitle>{w('Nano Banana')}</DialogTitle><DialogDescription>{w('Nano Banana Pro and Nano Banana 2.1 use the AI Nmesis provides. Each image shows its cost in credits before it starts.')}</DialogDescription><NmesisProvides provider="google"/></DialogContent></Dialog>;
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="connection-dialog"><DialogTitle>{w('Google AI Studio connection')}</DialogTitle><DialogDescription>Your plan includes your own provider keys. With your Google key connected, Nano Banana is billed to your Google project and costs 0 credits; without it, Nmesis provides the AI and your company spends credits.</DialogDescription>
    {status?.sponsored?<p className="helper">Your company’s owner manages this connection. No API key is needed from you.</p>:<><ol className="helper"><li>Open <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">{w('Google AI Studio ↗')}</a> and create an API key.</li><li>Enable billing for that key’s project.</li><li>Paste the key below. Verification does not generate an image.</li></ol>
    <form onSubmit={e=>{e.preventDefault();void save()}}><label className="field-label" htmlFor="google-api-key">{status?.connected?w('Replace Google API key'):w('Google API key')}</label><input id="google-api-key" type="password" className="text-input" placeholder="Paste your Google AI Studio key" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} disabled={busy} aria-describedby="google-key-note"/><p id="google-key-note" className="helper">Encrypted on the server for your signed-in account. Never saved in browser storage or shown again.</p><button className="generate" disabled={busy||!key.trim()||!status?.keySetup}>{busy?'Checking connection…':w('Verify & save Google key')}</button></form></>}
    {status?.connected&&<div className="helper">{GEMINI_IMAGE_MODELS.map(m=><p key={m.id}>{m.label}: {status.models.includes(m.id)?'Available':'Not available to this key'}</p>)}</div>}
    {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="key-notice" role="status">{notice}</p>}
    <p className="helper">{w('Model access checks do not confirm available billing credit on your Google project.')}</p>
    {status?.connected&&!status.sponsored&&<button className="remove-key" disabled={busy} onClick={()=>void save(true)}>{w('Remove Google key')}</button>}
  </DialogContent></Dialog>;
}
