'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GEMINI_IMAGE_MODELS,type GoogleConnectionStatus} from '@/lib/image-models';
export function GoogleConnection({open,onOpenChange,status,onUpdate}:{open:boolean;onOpenChange:(open:boolean)=>void;status:GoogleConnectionStatus|null;onUpdate:()=>Promise<void>}){
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  function changeOpen(value:boolean){if(busy)return;setKey('');setError('');setNotice('');onOpenChange(value)}
  async function save(remove=false){
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/google/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},...remove?{}:{body:JSON.stringify({key:key.trim()})}});
      const data=await response.json() as {error?:string;notice?:string};if(!response.ok)throw new Error(data.error||'Could not update your Google connection.');
      setNotice(remove?'Google key removed.':data.notice||'Connection updated.');await onUpdate();
    }catch(e){setError(e instanceof Error?e.message:'Could not connect to Google.')}finally{setKey('');setBusy(false)}
  }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="connection-dialog"><DialogTitle>Google AI Studio connection</DialogTitle><DialogDescription>Connect Nano Banana Pro and Nano Banana 2.1. Generations are billed directly to your Google project.</DialogDescription>
    <ol className="helper"><li>Open <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer">Google AI Studio ↗</a> and create an API key.</li><li>Enable billing for that key’s project.</li><li>Paste the key below. Verification does not generate an image.</li></ol>
    <form onSubmit={e=>{e.preventDefault();void save()}}><label className="field-label" htmlFor="google-api-key">{status?.connected?'Replace Google API key':'Google API key'}</label><input id="google-api-key" type="password" className="text-input" placeholder="Paste your Google AI Studio key" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} disabled={busy} aria-describedby="google-key-note"/><p id="google-key-note" className="helper">Encrypted on the server for your signed-in account. Never saved in browser storage or shown again.</p><button className="generate" disabled={busy||!key.trim()||!status?.keySetup}>{busy?'Checking connection…':'Verify & save Google key'}</button></form>
    {status?.connected&&<div className="helper">{GEMINI_IMAGE_MODELS.map(m=><p key={m.id}>{m.label}: {status.models.includes(m.id)?'Available':'Not available to this key'}</p>)}</div>}
    {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="key-notice" role="status">{notice}</p>}
    <p className="helper">Google charges are separate from your Higgsfield daily budget. Model access checks do not confirm available billing credit.</p>
    {status?.connected&&<button className="remove-key" disabled={busy} onClick={()=>void save(true)}>Remove Google key</button>}
  </DialogContent></Dialog>;
}
