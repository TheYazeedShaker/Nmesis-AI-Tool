'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,LoaderCircle,ExternalLink} from 'lucide-react';
import {fetchDownloadImage,imageFilename} from '@/lib/image-download';

export function ImageDownload({src,name='nmesis-image',label='Download image',className='primary'}:{src:string;name?:string;label?:string;className?:string}){
 const [busy,setBusy]=useState(false),[requested,setRequested]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function download(){
  if(controller.current)return;const active=new AbortController();controller.current=active;setBusy(true);setError('');setRequested(false);
  try{
   const blob=await fetchDownloadImage(src,active.signal);if(active.signal.aborted)return;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=imageFilename(name,blob.type);a.hidden=true;document.body.appendChild(a);
   try{a.click();setRequested(true)}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  }catch(e){if(!active.signal.aborted)setError(e instanceof Error?e.message:'Download interrupted. Try again or open the original.')}
  finally{controller.current=null;if(!active.signal.aborted)setBusy(false)}
 }
 return <div className="image-download"><button type="button" className={className} onClick={()=>void download()} disabled={busy} aria-busy={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {busy?'Preparing download…':label}</button>{(requested||error)&&<div className="image-download-help">{error?<span role="alert">{error}</span>:<span role="status">Download requested. If no file appears, open the original and save it.</span>}<a href={src} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open original</a></div>}</div>;
}
