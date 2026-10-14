"use client";
import {useState} from 'react';
import {KeyRound,LoaderCircle,ShieldCheck,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export type ConnectionStatus={generation:boolean;storage:boolean;personalKey?:boolean;keySetup?:boolean;signedOut?:boolean;sponsored?:boolean;sponsorPending?:boolean;sharingWith?:string[]};
export function ConnectionSettings({open,onOpenChange,status,onUpdate}:{open:boolean;onOpenChange:(value:boolean)=>void;status:ConnectionStatus|null;onUpdate:()=>Promise<void>}){
 const [key,setKey]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 function changeOpen(value:boolean){if(busy)return;setKey('');setError('');setNotice('');onOpenChange(value)}
 async function submit(remove=false){
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/connection',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},...(remove?{}:{body:JSON.stringify({key:key.trim()})})});
   const data:any=await response.json();if(!response.ok)throw new Error(data.error||'The connection could not be updated.');
   setNotice(remove?'Your saved key has been removed.':data.notice);await onUpdate();
  }catch(e){setError(e instanceof Error?e.message:'Connection failed. Please try again.')}finally{setKey('');setBusy(false)}
 }
 return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="connection-dialog"><DialogTitle><span className="connection-title"><KeyRound size={21}/>OpenAI connection</span></DialogTitle><DialogDescription>{status?.sponsored?"Your studio owner provides the OpenAI connection. Image generation is billed to their account.":"Connect your OpenAI account to create key visuals. Generation is billed to that account."}</DialogDescription>
 <div className="key-status"><ShieldCheck size={19}/><span>{status?.sponsored?(status.generation?'Connected through the studio owner':'Waiting for the studio owner'):status?.personalKey?'Your key is connected':status?.generation?'Studio connection is active':'Add your API key'}<small>{status?.sponsored?'You do not need to enter an API key.':status?.personalKey?'The saved key is never displayed again.':'Your key stays private to your signed-in account.'}</small></span></div>
 {status?.sharingWith?.length? <p className="key-notice">Your saved connection is enabled for {status.sharingWith.join(', ')}. Their generations are billed to your OpenAI account. They cannot view or change your key.</p>:null}
 {!status?.sponsored&&<form onSubmit={e=>{e.preventDefault();void submit()}}>
 <label className="field-label" htmlFor="openai-key">{status?.personalKey?'Replace your API key':'OpenAI API key'}</label>
 <input id="openai-key" className="text-input" type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste your API key here" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} disabled={busy||status?.signedOut} aria-describedby="key-storage-note"/>
 <p id="key-storage-note" className="helper key-storage-note">Encrypted before saving. Used by the studio server to contact OpenAI; never included in images, exports or browser storage.</p>
 <button className="generate" type="submit" disabled={busy||!key.trim()||!status?.keySetup||status?.signedOut}>{busy?<LoaderCircle size={17} className="spin"/>:<ShieldCheck size={17}/>} {busy?'Updating connection…':'Verify & save key'}</button>
 </form>}
 {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="key-notice" role="status">{notice}</p>}
 {status?.sponsored?(status.sponsorPending&&<p className="helper">Ask the studio owner to open this studio once while signed in. Your connection will activate automatically.</p>):status?.signedOut?<p className="helper">Sign in to the studio before adding your key.</p>:!status?.keySetup&&<p className="helper">Secure key storage is not ready. Please check again after the studio is published.</p>}
 {!status?.sponsored&&<div className="connection-links"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an OpenAI API key ↗</a>{status?.personalKey&&<button className="remove-key" onClick={()=>void submit(true)} disabled={busy}><Trash2 size={14}/>Remove saved key</button>}</div>}
 </DialogContent></Dialog>
}
