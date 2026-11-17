'use client';
import * as React from 'react';
import {KeyRound} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge} from '@/components/ds/feedback';
import {Section} from '@/components/ds/layout';
import {ConnectionSettings,type ConnectionStatus} from '@/components/connection-settings';
import {GoogleConnection} from '@/components/google-connection';
import {FilmConnectionDialog,type VideoConnection} from '@/components/editor/films-parts';
import {useUndoableRemoval} from '@/components/undo-removal';
import type {GoogleConnectionStatus} from '@/lib/image-models';
import {api} from './api';

// Company settings → Own keys, for companies whose plan includes their own
// provider keys (studio.own_keys). The connection dialogs are the tools' own;
// they moved here from the tools' "More actions" menus. With a key connected,
// that provider's work is billed to the company's account and costs 0 credits.
type Which='openai'|'google'|'video'|null;
export function OwnKeysSection(){
 const [status,setStatus]=React.useState<ConnectionStatus|null>(null),[google,setGoogle]=React.useState<GoogleConnectionStatus|null>(null),[video,setVideo]=React.useState<VideoConnection|null>(null);
 const [open,setOpen]=React.useState<Which>(null),[problem,setProblem]=React.useState(''),[saving,setSaving]=React.useState(false),[videoError,setVideoError]=React.useState('');
 const removeLater=useUndoableRemoval();
 const loadStatus=React.useCallback(async()=>{try{setStatus(await api<ConnectionStatus>('/api/status'))}catch(e){setProblem(e instanceof Error?e.message:'The connections could not be loaded.')}},[]);
 const loadGoogle=React.useCallback(async()=>{try{setGoogle(await api<GoogleConnectionStatus>('/api/google/connection'))}catch(e){setProblem(e instanceof Error?e.message:'The connections could not be loaded.')}},[]);
 const loadVideo=React.useCallback(async()=>{try{setVideo(await api<VideoConnection>('/api/video-connection'))}catch(e){setProblem(e instanceof Error?e.message:'The connections could not be loaded.')}},[]);
 React.useEffect(()=>{
  let live=true;
  void Promise.allSettled([api<ConnectionStatus>('/api/status'),api<GoogleConnectionStatus>('/api/google/connection'),api<VideoConnection>('/api/video-connection')]).then(([s,g,v])=>{
   if(!live)return;
   if(s.status==='fulfilled')setStatus(s.value);if(g.status==='fulfilled')setGoogle(g.value);if(v.status==='fulfilled')setVideo(v.value);
   const failed=[s,g,v].find(r=>r.status==='rejected');if(failed)setProblem(failed.reason instanceof Error?failed.reason.message:'The connections could not be loaded.');
  });
  return()=>{live=false};
 },[]);
 async function saveVideo(key:string){
  setSaving(true);setVideoError('');
  try{setVideo(await api<VideoConnection>('/api/video-connection','POST',{key}));setOpen(null);return true}
  catch(e){setVideoError(e instanceof Error?e.message:'The key could not be saved.');return false}
  finally{setSaving(false)}
 }
 function removeVideo(){setOpen(null);removeLater({message:'Your video connection will be removed.',url:'/api/video-connection',removed:()=>loadVideo()})}
 const rows:{key:Exclude<Which,null>;name:string;what:string;connected:boolean|null}[]=[
  {key:'openai',name:'OpenAI',what:'Key visuals, line-ups, area edits and smart references',connected:status?!!status.personalKey:null},
  {key:'google',name:'Google AI Studio',what:'Nano Banana images and image analysis',connected:google?google.connected:null},
  {key:'video',name:'Higgsfield',what:'Films, car swaps and Higgsfield images',connected:video?video.connected:null},
 ];
 return <Section title="Own keys">
  <p className="settings-line">Your plan includes your own provider keys. With a key connected, that work is billed to your own account and costs 0 credits; without it, Nmesis provides the AI and your company spends credits.</p>
  {problem&&<p className="ds-error" role="alert">{problem}</p>}
  <ul className="keys-list">
   {rows.map(r=><li key={r.key} className="keys-row">
    <span className="keys-name"><b>{r.name}</b><span className="settings-line">{r.what}</span></span>
    <span className="ds-row">
     {r.connected===null?<Badge>Checking…</Badge>:<Badge kind={r.connected?'ok':'quiet'}>{r.connected?'Your key is connected':'Nmesis provides it'}</Badge>}
     <Button size="sm" icon={<KeyRound aria-hidden="true"/>} onClick={()=>{setVideoError('');setOpen(r.key)}}>Manage<span className="ds-sr-only"> {r.name}</span></Button>
    </span>
   </li>)}
  </ul>
  <ConnectionSettings open={open==='openai'} onOpenChange={v=>setOpen(v?'openai':null)} status={status} onUpdate={loadStatus}/>
  <GoogleConnection open={open==='google'} onOpenChange={v=>setOpen(v?'google':null)} status={google} onUpdate={loadGoogle}/>
  <FilmConnectionDialog open={open==='video'} onClose={()=>setOpen(null)} connection={video} words={t=>t} busy={saving} saving={saving} error={videoError} onSave={saveVideo} onRemove={removeVideo}/>
 </Section>;
}
