'use client';
import * as React from 'react';
import {Copy,Download,Link2} from 'lucide-react';
import {Dialog} from '@/components/ds/dialog';
import {Button} from '@/components/ds/button';
import {Field,Input,Radio,RadioGroup,Select,Switch} from '@/components/ds/field';
import {Loading,SkeletonRow,State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {fetchDownloadImage,imageFilename} from '@/lib/image-download';
import type {Access,ShareLink,SharePerson,ShareState} from '@/lib/shares';

// Share, like a simple share panel: who has access, who in the company sees
// it (its creator or an owner chooses), the signed-in link, a public view link
// that expires, and a download in another format or size. The server decides
// everything (app/api/shares, lib/shares.ts); this only shows it and asks.

export type ShareItem={kind:'visual';id:string;title:string;src:string;mine:boolean};
const ACCESS:{value:Access;label:string;help:string}[]=[
 {value:'private',label:'Only me',help:'Only you can find and open it.'},
 {value:'view',label:'Company can view',help:'Everyone in your company can find and open it.'},
 {value:'edit',label:'Company can edit',help:'Everyone can open it; owners and creators can also organise it.'},
];
const DAYS=[1,7,30] as const;
const SIZES=[{value:'original',label:'Original'},{value:'2048',label:'2048 px on the long edge'},{value:'1080',label:'1080 px on the long edge'}] as const;
type Size=typeof SIZES[number]['value'];
type Format='png'|'jpg';
const longDate=(ms:number)=>new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const ROLE:Record<string,string>={owner:'Owner',creator:'Creator',viewer:'Viewer'};

function canWords(p:SharePerson,access:Access){
 if(p.maker)return 'Made this';
 if(p.count)return access==='private'?'No access':access==='edit'?'Can view · creators can edit':'Can view';
 return p.canEdit?'Can edit':p.canView?'Can view':'No access';
}

async function readAnswer<T>(response:Response,fallback:string):Promise<T>{
 const body=await response.json().catch(()=>null) as (T&{error?:unknown})|null;
 if(!response.ok||!body)throw new Error(body&&typeof body.error==='string'?body.error:fallback);
 return body;
}

// A picture in the browser: decoded from the downloaded file (no tainted canvas), redrawn at the chosen size.
async function decode(blob:Blob):Promise<{source:CanvasImageSource;width:number;height:number;close:()=>void}>{
 if(typeof createImageBitmap==='function'){const b=await createImageBitmap(blob);return {source:b,width:b.width,height:b.height,close:()=>b.close()}}
 const url=URL.createObjectURL(blob),img=new Image();img.crossOrigin='anonymous';img.src=url;
 try{await img.decode()}catch(e){URL.revokeObjectURL(url);throw e}
 return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>URL.revokeObjectURL(url)};
}
async function convert(blob:Blob,format:Format,size:Size):Promise<Blob>{
 const type=format==='jpg'?'image/jpeg':'image/png';
 if(size==='original'&&blob.type===type)return blob;
 const pic=await decode(blob);
 try{
  const edge=size==='original'?Infinity:Number(size),scale=Math.min(1,edge/Math.max(pic.width,pic.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(pic.width*scale));canvas.height=Math.max(1,Math.round(pic.height*scale));
  const draw=canvas.getContext('2d');if(!draw)throw new Error('This browser can’t convert the picture. Choose Original and PNG.');
  // A JPG has no transparency: transparent parts become white, not black.
  if(format==='jpg'){draw.fillStyle='white';draw.fillRect(0,0,canvas.width,canvas.height)}
  draw.imageSmoothingQuality='high';draw.drawImage(pic.source,0,0,canvas.width,canvas.height);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The picture couldn’t be converted. Try again.')),type,0.92));
 }finally{pic.close()}
}
function save(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.appendChild(a);
 try{a.click()}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000)}
}

export function SharePanel({open,onClose,item}:{open:boolean;onClose:()=>void;item:ShareItem}){
 const {toast}=useToast();
 const key=`${item.kind}:${item.id}`,base=`/api/shares/${item.kind}/${encodeURIComponent(item.id)}`;
 const [got,setGot]=React.useState<{key:string;state?:ShareState;error?:string}|null>(null);
 const [attempt,setAttempt]=React.useState(0);
 const [busy,setBusy]=React.useState<'access'|'link'|'download'|null>(null);
 const [made,setMade]=React.useState<{key:string;url:string;expiresAt:number}|null>(null);
 const [days,setDays]=React.useState<number>(7);
 const [format,setFormat]=React.useState<Format>('png');
 const [size,setSize]=React.useState<Size>('original');
 const [downloadError,setDownloadError]=React.useState('');

 React.useEffect(()=>{
  if(!open)return;
  const stop=new AbortController();
  fetch(base,{cache:'no-store',signal:stop.signal})
   .then(r=>readAnswer<ShareState>(r,'Sharing couldn’t be loaded. Try again.'))
   .then(state=>setGot({key,state}))
   .catch(e=>{if(!stop.signal.aborted)setGot({key,error:e instanceof Error?e.message:'Sharing couldn’t be loaded. Try again.'})});
  return ()=>stop.abort();
 },[open,base,key,attempt]);

 const state=got?.key===key?got.state:undefined,error=got?.key===key?got.error:undefined;
 const update=(next:Partial<ShareState>)=>setGot(g=>g&&g.key===key&&g.state?{key,state:{...g.state,...next}}:g);
 const link:ShareLink|null=state?.link??null,on=!!link?.on;
 const url=made&&made.key===key&&on&&made.expiresAt===link?.expiresAt?made.url:null;
 const signedIn=typeof location==='undefined'?'':`${location.origin}/library?open=${encodeURIComponent(key)}`;

 // The toast confirms; the button says it too, because a modal dialog keeps the page (and its toasts) behind it.
 const [copied,setCopied]=React.useState<'signed-in'|'public'|null>(null);
 const copiedTimer=React.useRef<number|undefined>(undefined);
 React.useEffect(()=>()=>window.clearTimeout(copiedTimer.current),[]);
 async function copy(text:string,which:'signed-in'|'public'){
  try{
   await navigator.clipboard.writeText(text);toast({message:'Link copied',kind:'ok'});
   setCopied(which);window.clearTimeout(copiedTimer.current);copiedTimer.current=window.setTimeout(()=>setCopied(null),2500);
  }catch{toast({message:'The link couldn’t be copied. Select it and copy it yourself.',kind:'bad'})}
 }
 async function changeAccess(access:Access){
  if(!state||access===state.access||busy)return;
  setBusy('access');
  try{
   const next=await readAnswer<ShareState>(await fetch(base,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({access})}),'Access couldn’t be changed. Try again.');
   setGot({key,state:next});toast({message:`Access: ${ACCESS.find(a=>a.value===next.access)?.label}`,kind:'ok'});
  }catch(e){toast({message:e instanceof Error?e.message:'Access couldn’t be changed. Try again.',kind:'bad'})}
  finally{setBusy(null)}
 }
 async function makeLink(forDays:number){
  setBusy('link');
  try{
   const out=await readAnswer<{url:string;expiresAt:number}>(await fetch(base+'/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:forDays})}),'The link couldn’t be made. Try again.');
   setMade({key,url:out.url,expiresAt:out.expiresAt});update({link:{on:true,expiresAt:out.expiresAt}});
   toast({message:on?'New link made. The previous one no longer works.':'Public view link is on',kind:'ok'});
  }catch(e){toast({message:e instanceof Error?e.message:'The link couldn’t be made. Try again.',kind:'bad'})}
  finally{setBusy(null)}
 }
 async function turnOff(){
  setBusy('link');
  try{
   await readAnswer(await fetch(base+'/link',{method:'DELETE'}),'The link couldn’t be turned off. Try again.');
   setMade(null);update({link:null});toast({message:'Public view link is off',kind:'ok'});
  }catch(e){toast({message:e instanceof Error?e.message:'The link couldn’t be turned off. Try again.',kind:'bad'})}
  finally{setBusy(null)}
 }
 async function download(){
  if(busy==='download')return;
  setBusy('download');setDownloadError('');
  try{
   const blob=await fetchDownloadImage(item.src);
   const out=await convert(blob,format,size);
   save(out,imageFilename(size==='original'?item.title:`${item.title}-${size}`,out.type));
  }catch(e){setDownloadError(e instanceof Error?e.message:'The download didn’t finish. Try again.')}
  finally{setBusy(null)}
 }

 const accessWord=ACCESS.find(a=>a.value===state?.access);
 return <Dialog open={open} onClose={onClose} title={<span className="share-title" title={item.title}>Share “{item.title}”</span>} className="share-panel">
  {error
   ?<State kind="error" title="Sharing couldn’t be loaded" actions={<Button onClick={()=>{setGot(null);setAttempt(n=>n+1)}}>Try again</Button>}>{error}</State>
   :!state
    ?<Loading label="Loading who can see it"><SkeletonRow/><SkeletonRow/><SkeletonRow/></Loading>
    :<>
     <section className="share-section" aria-labelledby="share-people">
      <h3 className="share-heading" id="share-people">People with access</h3>
      {state.people
       ?<ul className="share-people">{state.people.map(p=><li key={p.key} className="share-person">
         <span className="ds-avatar" aria-hidden="true">{p.count?'+':(p.label[0]||'?').toUpperCase()}</span>
         <span className="share-person-who">
          <span className="share-person-name ds-truncate" title={p.label}>{p.label}{p.you&&<span className="share-you"> (you)</span>}</span>
          {p.role&&<span className="share-person-role">{ROLE[p.role]}</span>}
         </span>
         <span className="share-person-can">{canWords(p,state.access)}</span>
        </li>)}</ul>
       :<p className="share-note">The company’s people couldn’t be loaded. Who can see it is still set below.</p>}
     </section>

     <section className="share-section" aria-labelledby="share-access">
      <h3 className="share-heading" id="share-access">Access</h3>
      {state.canManage
       ?<RadioGroup legend={<span className="ds-sr-only">Who in your company can see it</span>} className="share-access">
         {ACCESS.map(a=><Radio key={a.value} name={`share-access-${item.id}`} value={a.value} label={a.label} help={a.help} checked={state.access===a.value} disabled={busy==='access'} onChange={()=>void changeAccess(a.value)}/>)}
        </RadioGroup>
       :<p className="share-note"><strong className="share-strong">{accessWord?.label}</strong>. {accessWord?.help} Only the person who made it, or an owner of your company, can change this.</p>}
     </section>

     <section className="share-section" aria-labelledby="share-copy">
      <h3 className="share-heading" id="share-copy">Copy link</h3>
      <div className="ds-row">
       <Button icon={<Link2 aria-hidden="true"/>} onClick={()=>void copy(signedIn,'signed-in')}>{copied==='signed-in'?'Copied':'Copy link'}</Button>
      </div>
      <p className="share-note">Only people in your company who are signed in can open it.{state.access==='private'?' It is set to Only me, so only you can.':''}</p>
     </section>

     <section className="share-section" aria-labelledby="share-public">
      <h3 className="share-heading" id="share-public">Public view link</h3>
      {state.canManage
       ?<>
        <Switch label="Anyone with the link can view it" checked={on} disabled={busy==='link'} onChange={()=>void (on?turnOff():makeLink(days))}/>
        <Field label="Link works for">
         <Select value={String(days)} disabled={busy==='link'} onChange={e=>{const d=Number(e.target.value);setDays(d);if(on)void makeLink(d)}}>
          {DAYS.map(d=><option key={d} value={d}>{d===1?'1 day':`${d} days`}</option>)}
         </Select>
        </Field>
        {on&&link&&(url
         ?<div className="share-link-row">
           <Input className="share-link-input" readOnly value={url} aria-label="Public view link" onFocus={e=>e.currentTarget.select()}/>
           <Button icon={<Copy aria-hidden="true"/>} onClick={()=>void copy(url,'public')}>{copied==='public'?'Copied':'Copy'}</Button>
          </div>
         :<div className="share-link-row">
           <p className="share-note">The address is shown once, when the link is made.</p>
           <Button size="sm" busy={busy==='link'} onClick={()=>void makeLink(days)}>Make a new link</Button>
          </div>)}
        <p className="share-note">{on&&link
         ?`Anyone with the link can view it until ${longDate(link.expiresAt)}. Turn it off at any time.`
         :link&&!link.on?`The last link expired on ${longDate(link.expiresAt)}.`:'Off. Turn it on to make a link anyone can open, for 1, 7 or 30 days.'}</p>
       </>
       :<p className="share-note">{on&&link?`On: anyone with the link can view it until ${longDate(link.expiresAt)}.`:'Off.'} Only the person who made it, or an owner of your company, can change this.</p>}
     </section>

     <section className="share-section" aria-labelledby="share-download">
      <h3 className="share-heading" id="share-download">Download</h3>
      <div className="share-download">
       <Field label="Format"><Select value={format} onChange={e=>setFormat(e.target.value==='jpg'?'jpg':'png')}><option value="png">PNG</option><option value="jpg">JPG</option></Select></Field>
       <Field label="Size"><Select value={size} onChange={e=>setSize(SIZES.find(s=>s.value===e.target.value)?.value||'original')}>{SIZES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
       <Button kind="primary" icon={<Download aria-hidden="true"/>} busy={busy==='download'} onClick={()=>void download()}>Download</Button>
      </div>
      {downloadError&&<p className="ds-error" role="alert">{downloadError}</p>}
     </section>
     <p className="ds-sr-only" role="status">{copied?'Link copied':''}</p>
    </>}
 </Dialog>;
}
