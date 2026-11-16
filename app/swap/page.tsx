'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check,Download,Film,Plus,RefreshCw,Upload} from 'lucide-react';
import {useBackoffPoll} from '@/lib/use-backoff-poll';
import {TrashControls} from '@/components/trash-controls';
import {AccountNotices,PlanGate,providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {studioFetch} from '@/lib/studio-fetch';
import {readReference,uploadReference} from '@/lib/reference-upload';
import {CONFIGURATORS,type Configurator} from '@/lib/configurators';
import {useConfiguratorPresets,isDemoConfigurator,mergePresets} from '@/lib/configurator-presets';
import {snapshotStream,highResolutionDisplayOptions,captureSharedTab} from '@/lib/live-capture';
import {type Swap} from '@/lib/swaps';
import {costLabel,refreshCredits,useCredits} from '@/components/credits';
import {creditsLabel} from '@/lib/credits/words';
import {Button,buttonClass} from '@/components/ds/button';
import {State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {EDITOR_TOOLS,EditorScreen} from '@/components/editor/editor-screen';
import {CarSettings,ConfiguratorStage,CostBadge,PromptSettings,QUALITY_LABEL,SaveToProject,VersionHistory} from '@/components/editor/parts';
import {iframeConfigurator} from '@/components/editor/iframe-configurator';
import type {ConfiguratorAdapter,ConfiguratorOptions} from '@/components/editor/configurator';
import {useProject} from '@/components/editor/use-project';
import {SwapAdSection,SwapAlert,SwapCarViews,SwapConnectionSection,SwapCostSection,SwapCropDialog,SwapQuality,busySwap,pendingSwap,qualityOf,resolutionOf,statusWords,swapVersions,type CarView,type SwapConnection,type SwapResolution} from '@/components/editor/swap-parts';
import './editor-swap.css';

// Swap, in the one editor (Phase 3 group 2): the reference ad, the configurator
// and the result in the canvas, the swaps as versions under it, one settings
// panel, and Get cost estimate → approve → Replace car in video as Generate.
// The configurator is reached only through its adapter.

type Stage='ad'|'car'|'result';
// Today's adapter (the iframe) has no options to list and its colour, trim and
// view are chosen inside the configurator; the remote-control adapter will
// bring getOptions() and controlsInEditor true.
const NO_OPTIONS:ConfiguratorOptions={colours:[],trims:[],views:[],frames:0},IFRAME_CONTROLS_IN_EDITOR=false;
async function api<T=Record<string,unknown>>(url:string,method='GET',body?:unknown):Promise<T>{const r=await studioFetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json() as T&{error?:string};if(!r.ok)throw new Error(d.error||'The studio could not complete this request.');return d}
async function uploadImage(file:File,original?:Blob){return (await uploadReference(file,original)).id}
function durationOf(file:File){return new Promise<{seconds:number;width:number;height:number}>((resolve,reject)=>{const url=URL.createObjectURL(file),v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>{const seconds=v.duration,width=v.videoWidth,height=v.videoHeight;URL.revokeObjectURL(url);resolve({seconds,width,height})};v.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('This MP4 could not be previewed.'))};v.src=url})}
// Said just before the browser asks to share this tab, and only then.
const SHARE_NOTICE='Your browser will ask to share this tab once, so the Studio can take the picture. Choose this tab and Share.';
function dataUrlOf(blob:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('The captured view could not be read.'));r.readAsDataURL(blob)})}

export default function Page(){return <PlanGate feature="studio.swap"><CarSwap/></PlanGate>}

function CarSwap(){
 const router=useRouter(),toast=useToast(),project=useProject();
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const creditInfo=useCredits();const creditsLeft=creditInfo&&!creditInfo.unlimited&&creditInfo.billing.higgsfield==='credits'?creditInfo.meter?.left:undefined;
 const [items,setItems]=useState<Configurator[]>(CONFIGURATORS),[config,setConfig]=useState<Configurator>(CONFIGURATORS[0]),[source,setSource]=useState<{id:string;name:string;duration:number}|null>(null),[refs,setRefs]=useState<CarView[]>([]),[notes,setNotes]=useState(''),[resolution,setResolution]=useState<SwapResolution>('720p'),[swaps,setSwaps]=useState<Swap[]>([]),[selected,setSelected]=useState(''),[connection,setConnection]=useState<SwapConnection|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[approved,setApproved]=useState(false),[cropImage,setCropImage]=useState(''),[uploadLabel,setUploadLabel]=useState(''),[captureOpen,setCaptureOpen]=useState(false),[stage,setStage]=useState<Stage>('ad');
 useConfiguratorPresets(list=>{setItems(mergePresets(list));setConfig(c=>isDemoConfigurator(c)?list[0]:c)});
 const frame=useRef<HTMLIFrameElement>(null),adInput=useRef<HTMLInputElement>(null),imageInput=useRef<HTMLInputElement>(null),action=useRef(false),captureHandle=useRef(''),adapter=useRef<ConfiguratorAdapter|null>(null);const active=swaps.find(s=>s.id===selected)||null;
 const notify=useCallback((message:string)=>toast.toast({message,kind:'ok'}),[toast]);
 const setJob=useCallback((swap:Swap)=>setSwaps(prev=>[swap,...prev.filter(s=>s.id!==swap.id)].sort((a,b)=>b.createdAt-a.createdAt)),[]);
 const loadConnection=useCallback(async()=>{const d=await api<SwapConnection>('/api/video-connection');setConnection(d)},[]);
 // The configurator, only through its adapter (a new one for each car's page).
 useEffect(()=>{const a=iframeConfigurator(()=>frame.current,()=>config.url);adapter.current=a;return()=>{a.dispose();if(adapter.current===a)adapter.current=null}},[config.url]);
 useEffect(()=>{captureHandle.current=crypto.randomUUID();const media=navigator.mediaDevices as MediaDevices&{setCaptureHandleConfig?:(v:unknown)=>void};try{media?.setCaptureHandleConfig?.({handle:captureHandle.current,exposeOrigin:true,permittedOrigins:[location.origin]})}catch{captureHandle.current=''}},[]);
 useEffect(()=>{let mounted=true;const known=CONFIGURATORS;void Promise.all([api<{swaps:Swap[]}>('/api/swaps'),api<SwapConnection>('/api/video-connection')]).then(([a,c])=>{if(!mounted)return;setSwaps(a.swaps);setConnection(c);const id=new URLSearchParams(location.search).get('id');const saved=a.swaps.find(s=>s.id===id);if(saved){setSelected(saved.id);setStage('result');setSource({id:saved.data.sourceId,name:'Saved reference ad',duration:saved.data.sourceDuration});setRefs(saved.data.imageIds.map((id,i)=>({id,label:'Car view '+(i+1)})));setNotes(saved.data.notes);setResolution(saved.data.resolution);const vehicle=known.find(x=>x.url===saved.data.configurator)||{id:crypto.randomUUID(),name:saved.data.vehicle,url:saved.data.configurator};setConfig(vehicle);if(!known.some(x=>x.url===vehicle.url))setItems(p=>p.some(x=>x.url===vehicle.url)?p:[...p,vehicle])}}).catch(e=>{if(mounted)setError(e.message)});return()=>{mounted=false}},[]);
 useBackoffPoll(async()=>{if(action.current)return 'same';const job=swaps.find(pendingSwap);if(!job)return 'idle';action.current=true;try{const d=await api<{swap:Swap}>(`/api/swaps/${job.id}/refresh`,'POST');setJob(d.swap);return d.swap.status!==job.status?'changed':'same'}catch(e){setError((e as Error).message);return 'same'}finally{action.current=false}},{base:12000,max:60000,enabled:swaps.some(pendingSwap)});
 const editable=!active||['draft','quoted'].includes(active.status);
 // A draft or an estimate no longer matches once the settings change, so it is
 // let go (it is never approved for other settings); a submitted or finished
 // version stays on screen and Generate starts a new version from the settings.
 function changed(){if(active&&editable)setSelected('');setApproved(false)}
 function selectConfig(c:Configurator){if(busy)return;setConfig(c);setRefs([]);setSelected('');setError('')}
 function chooseJob(s:Swap){setSelected(s.id);setStage('result');setSource({id:s.data.sourceId,name:'Saved reference ad',duration:s.data.sourceDuration});setRefs(s.data.imageIds.map((id,i)=>({id,label:'Car view '+(i+1)})));setNotes(s.data.notes);setResolution(s.data.resolution);const vehicle=items.find(x=>x.url===s.data.configurator)||{id:crypto.randomUUID(),name:s.data.vehicle,url:s.data.configurator};setConfig(vehicle);if(!items.some(x=>x.url===vehicle.url))setItems(prev=>[...prev,vehicle]);setApproved(false);history.replaceState(null,'','/swap?id='+s.id)}
 function reset(){setSelected('');setSource(null);setRefs([]);setNotes('');setApproved(false);history.replaceState(null,'','/swap')}
 async function run(label:string,fn:()=>Promise<void>){if(action.current)return;action.current=true;setBusy(label);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy('');action.current=false}}
 async function uploadAd(file?:File){if(!file)return;await run('ad',async()=>{if(!file.name.toLowerCase().endsWith('.mp4')||(file.type&&file.type!=='video/mp4'&&file.type!=='application/octet-stream')||file.size>48_000_000)throw new Error('Choose an MP4 under 48 MB.');const {seconds,width,height}=await durationOf(file);if(!Number.isFinite(seconds)||seconds<4||seconds>30)throw new Error('Use a reference ad between 4 and 30 seconds.');if(width*height<409600)throw new Error(w(`This ad is ${width}×${height}. Higgsfield needs at least 409,600 pixels per frame. Try a higher-resolution original, such as 720×1280 portrait video.`));const form=new FormData();form.set('video',file);const r=await studioFetch('/api/swap-source',{method:'POST',body:form});const d=await r.json() as {id:string;duration:number;error?:string};if(!r.ok)throw new Error(d.error||'The ad could not be uploaded.');setSource({id:d.id,name:file.name,duration:d.duration});setSelected('');setApproved(false);setStage('car');notify('Reference ad saved privately. Now capture the car you want in it.')})}
 async function addImage(file:File,original:Blob,label='Car view'){await run('image',async()=>{if(refs.length>=8)throw new Error('Use up to eight car views.');const id=await uploadImage(file,original);setRefs(prev=>[...prev,{id,label}]);changed();notify('Car view added. Change the configurator angle and capture another view if you like.')})}
 async function screenCapture(){setCaptureOpen(false);setError('');let stream:MediaStream|undefined;try{if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('This browser cannot capture tabs. Upload a screenshot instead.');toast.toast({message:SHARE_NOTICE});stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());const image=await captureSharedTab(stream,frame.current,captureHandle.current);setCropImage(image);setUploadLabel('Captured car view');}catch(e){setError((e as Error).name==='NotAllowedError'?'Tab sharing was canceled.':(e as Error).message)}finally{stream?.getTracks().forEach(t=>t.stop())}}
 async function capture(){
  if(busy)return;if(refs.length>=8){setError('Use up to eight car views.');return}
  setBusy('capture');setError('');
  try{
   // The configurator's own picture first; when it sends none, the screen-capture fallback.
   const shot=adapter.current?await adapter.current.capture().catch(()=>null):null;
   if(shot){setCropImage(await dataUrlOf(shot.blob));setUploadLabel(shot.state.view||'Configurator view');notify('Current configurator frame captured. Crop out the interface if needed.')}
   else if(navigator.mediaDevices?.getDisplayMedia&&'setCaptureHandleConfig' in navigator.mediaDevices){let stream:MediaStream|undefined;toast.toast({message:SHARE_NOTICE});try{stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());const captured=await snapshotStream(stream,frame.current,captureHandle.current);setCropImage(captured);setUploadLabel('Configurator view');notify('Current view captured. Crop out any remaining controls if needed.')}finally{stream?.getTracks().forEach(t=>t.stop())}}
   else setCaptureOpen(true);
  }catch(e){setCaptureOpen(true);if((e as Error).name!=='NotAllowedError')setError((e as Error).message)}finally{setBusy('')}
 }
 // A picture of the car to crop; the drop zone shows its own problems.
 async function readScreenshot(file:File){const src=await readReference(file);setCropImage(src);setUploadLabel(file.name);setCaptureOpen(false)}
 async function uploadScreenshot(file?:File){if(!file)return;try{await readScreenshot(file)}catch(e){setError((e as Error).message)}}
 async function prepare(){await run('quote',async()=>{if(!source||!refs.length)throw new Error('Upload an ad and add at least one car view.');if(!connection?.connected&&!connection?.available)throw new Error('Car swap isn’t available in your Studio right now. Ask Nmesis.');let job=active;if(!job||job.status!=='draft'){const d=await api<{swap:Swap}>('/api/swaps','POST',{title:`${config.name} · car swap`,vehicle:config.name,configurator:config.url,sourceId:source.id,sourceDuration:source.duration,imageIds:refs.map(r=>r.id),notes,resolution});job=d.swap;setJob(job);setSelected(job.id);history.replaceState(null,'','/swap?id='+job.id)}const q=await api<{swap:Swap}>(`/api/swaps/${job.id}/quote`,'POST');setJob(q.swap);setApproved(false);await loadConnection()})}
 async function act(name:string,target:Swap|null=active){if(!target)return;await run(name,async()=>{const d=await api<{swap:Swap}>(`/api/swaps/${target.id}/${name}`,'POST',name==='render'?{approvedEstimate:target.credits,approvedRevision:target.revision}:undefined);setJob(d.swap);if(name==='render'){refreshCredits();setStage('result')}setApproved(false);await loadConnection()})}
 async function saveKey(){await run('connection',async()=>{await api('/api/video-connection','POST',{key});setKey('');await loadConnection();notify(w('Higgsfield connected. Your key is stored privately and is never shown to collaborators.'))})}
 const show=active?.data;const overBudget=!!active&&typeof creditsLeft==='number'&&active.credits>creditsLeft;
 const quote=active?.status==='quoted'?active:null,quoted=!!quote,available=!!(connection?.connected||connection?.available);
 const versions=swapVersions(swaps);
 const working=versions.filter(v=>v.status==='working'),cancellable=working.length>0&&working.every(v=>swaps.find(s=>s.id===v.id)?.status==='queued');
 const adId=source?.id||show?.sourceId,adSeconds=source?.duration||show?.sourceDuration;
 const recovering=!!active&&['unknown','submitting'].includes(active.status);
 const price=(n:number)=>costLabel(creditInfo,n,'higgsfield')||creditsLabel(n);

 const bar=<>
  <span className="editor-swap-title ds-truncate" title={active?.data.title}>{active?.data.title||'New car swap'}</span>
  <div className="ds-segmented editor-stage-switch" role="group" aria-label="Show">
   <button type="button" aria-pressed={stage==='ad'} onClick={()=>setStage('ad')}>{adId&&<Check aria-hidden="true"/>}Reference ad{adId&&<span className="ds-sr-only">, done</span>}</button>
   <button type="button" aria-pressed={stage==='car'} onClick={()=>setStage('car')}>{refs.length>0&&<Check aria-hidden="true"/>}Your car{refs.length>0&&<span className="ds-sr-only">, done</span>}</button>
   <button type="button" aria-pressed={stage==='result'} onClick={()=>setStage('result')}>{active?.status==='ready'&&<Check aria-hidden="true"/>}Result{active?.status==='ready'&&<span className="ds-sr-only">, done</span>}</button>
  </div>
  <SaveToProject folders={project.folders} folderId={active?project.folderOf('swap',active.id):null} disabled={!active||!project.ready} onSave={f=>{if(active)void project.save('swap',active.id,f)}}/>
  <span className="editor-bar-actions">
   {active?.videoUrl&&<a className={buttonClass({kind:'quiet',size:'sm'})} href={active.videoUrl+'?download=1'} download><Download aria-hidden="true"/>Download MP4</a>}
   {active&&['queued','in_progress','archiving','unknown','submitting'].includes(active.status)&&<Button size="sm" kind="quiet" icon={<RefreshCw aria-hidden="true"/>} disabled={!!busy} busy={busy==='recover'||busy==='refresh'} onClick={()=>void act(recovering?'recover':'refresh')}>{recovering?<>Recover original request <span className="ds-btn-meta">· up to {price(active.credits)}</span></>:'Refresh status'}</Button>}
   {active?.status==='queued'&&<Button size="sm" kind="quiet" disabled={!!busy} busy={busy==='cancel'} onClick={()=>void act('cancel')}>Cancel queued swap</Button>}
   {active&&['failed','nsfw'].includes(active.status)&&<Button size="sm" kind="quiet" disabled={!!busy} onClick={()=>void run('diagnostic',async()=>{const d=await api<{reason:string}>(`/api/swaps/${active.id}/diagnostic`);setJob({...active,error:d.reason})})}>{showNames?'Show Higgsfield reason':'Show the reason'}</Button>}
   <Button size="sm" kind="quiet" icon={<Plus aria-hidden="true"/>} onClick={()=>{reset();setStage('ad')}}>New swap</Button>
   <TrashControls kind="swaps" item={active?{id:active.id,title:active.data.title,busy:busySwap(active)}:null} onDeleted={id=>{setSwaps(v=>v.filter(s=>s.id!==id));if(id===selected)reset()}} onRestored={()=>void api<{swaps:Swap[]}>('/api/swaps').then(d=>setSwaps(d.swaps))}/>
  </span>
 </>;

 const stageNode=<div className="editor-swap-stage">
  <SwapAlert error={error} onDismiss={()=>setError('')}/>
  <div className="editor-swap-pane" hidden={stage!=='ad'}>
   {adId?<figure className="editor-result"><video className="editor-swap-video" controls playsInline src={'/api/swap-source/'+adId}/>
     <figcaption><span>{source?.name||'Saved reference ad'}{typeof adSeconds==='number'?` · ${adSeconds.toFixed(1)} sec`:''}</span><Button size="sm" kind="quiet" disabled={!!busy} onClick={()=>adInput.current?.click()}>Change ad</Button></figcaption></figure>
    :<State kind="empty" icon={<Upload/>} title="Choose your reference ad" actions={<Button busy={busy==='ad'} disabled={!!busy&&busy!=='ad'} icon={<Upload aria-hidden="true"/>} onClick={()=>adInput.current?.click()}>Choose ad</Button>}>MP4 · 4–30 seconds · at least 409,600 pixels per frame. The ad guides the camera move, timing and scene.</State>}
  </div>
  <div className="editor-swap-pane" hidden={stage!=='car'}>
   <div className="editor-swap-car">
    <ConfiguratorStage frame={0} frames={0} onFrame={()=>undefined} onCapture={()=>void capture()} capturing={busy==='capture'}>
     <iframe ref={frame} key={config.url} title={config.name+' configurator'} src={config.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen/>
     <span className="editor-live"><span aria-hidden="true"/>Live configurator</span>
    </ConfiguratorStage>
    <p className="ds-help">Set the colour, trim and angle in the configurator, then press Use this view. {refs.length} / 8 car views.</p>
    {captureOpen&&<div className="editor-swap-fallback" role="status"><p>This configurator does not expose a direct image. Capture its tab or upload a screenshot.</p>
     <div className="editor-row"><Button size="sm" onClick={()=>void screenCapture()}>Capture browser tab</Button><Button size="sm" onClick={()=>imageInput.current?.click()}>Upload screenshot</Button><a className={buttonClass({kind:'quiet',size:'sm'})} href={config.url} target="_blank" rel="noreferrer">Open configurator</a></div></div>}
   </div>
  </div>
  <div className="editor-swap-pane" hidden={stage!=='result'}>
   {active?<div className="editor-swap-result">
     {active.videoUrl?<figure className="editor-result"><video className="editor-swap-video" controls playsInline src={active.videoUrl}/>
       <figcaption><span>{active.data.title} · {QUALITY_LABEL[qualityOf(active.data.resolution)]}</span>{active.status==='ready'&&<CostBadge credits={active.credits} used/>}</figcaption></figure>
      :<State kind="empty" icon={pendingSwap(active)?<RefreshCw className="spin"/>:<Film/>} title={statusWords(active.status)}>{pendingSwap(active)?'You can leave and come back. The project stays in your studio.':'Your reference ad and car views are saved.'}</State>}
     {recovering?<p className="ds-error">{w('The first response was lost. Recovery reuses the original request key, so Higgsfield cannot create a duplicate. If the first attempt never started, this may start your approved render.')}</p>:active.error&&<p className="ds-error">{w(active.error)}</p>}
     {pendingSwap(active)&&<p className="ds-help">Return within seven days so the studio can archive the finished video.</p>}
    </div>
    :<State kind="empty" icon={<Film/>} title="Your car swap appears here">Choose a reference ad, add views of your car, then get the cost estimate.</State>}
  </div>
 </div>;

 const settings=<>
  <SwapAdSection name={adId?source?.name||'Saved reference ad':undefined} seconds={adSeconds} busy={busy==='ad'} disabled={!!busy&&busy!=='ad'} onFile={file=>uploadAd(file)}/>
  <CarSettings cars={items.map(x=>x.name)} car={config.name} onCar={name=>{const c=items.find(x=>x.name===name);if(c)selectConfig(c)}} options={NO_OPTIONS} state={{}} onColour={id=>void adapter.current?.setColour(id).catch((e:Error)=>setError(e.message))} onTrim={id=>void adapter.current?.setTrim(id).catch((e:Error)=>setError(e.message))} onView={id=>void adapter.current?.setView(id).catch((e:Error)=>setError(e.message))} controlsInEditor={IFRAME_CONTROLS_IN_EDITOR} idPrefix="swap-car"/>
  <SwapCarViews views={refs} disabled={!!busy} configuratorUrl={config.url} onFile={readScreenshot} onRemove={id=>{setRefs(prev=>prev.filter(x=>x.id!==id));changed()}}/>
  <PromptSettings label="Anything to keep?" value={notes} max={700} inspiration={false} placeholder="Keep the wet-road reflections; preserve the final overhead shot…" onChange={v=>{setNotes(v);changed()}}/>
  <SwapQuality value={qualityOf(resolution)} disabled={!!busy} onChange={q=>{setResolution(resolutionOf(q));changed()}}/>
  <SwapConnectionSection connection={connection} w={w} keyValue={key} onKey={setKey} onSave={()=>void saveKey()} disabled={!!busy}/>
  <SwapCostSection quote={quoted} label={active?price(active.credits):''} showNames={showNames} creditsLeft={typeof creditsLeft==='number'?creditsLeft:undefined} approved={approved} onApprove={setApproved} onRefresh={()=>void act('quote')} overBudget={overBudget} disabled={!!busy}/>
 </>;

 const note=quoted?(overBudget?'Not enough credits left this month for this swap.':approved&&quote?`Up to ${price(quote.credits)}, approved.`:'Approve the estimate under Cost first.')
  :busy==='quote'?'Uploading references & estimating…'
  :connection&&!available?'Car swap isn’t available in your Studio right now. Ask Nmesis.'
  :!source?'Choose a reference ad first.':!refs.length?'Add at least one view of your car.'
  :active&&!editable?'Starts a new version from these settings. You see the cost before it starts.':'You see the cost, and approve it, before the swap starts.';

 return <WorkspaceFrame current="swap" bleed notices={<AccountNotices variant="ds"/>}>
  <EditorScreen tool="swap" onTool={t=>{if(t!=='swap')router.push(EDITOR_TOOLS.find(x=>x.id===t)?.href||'/swap')}} bar={bar} stage={stageNode}
   history={<VersionHistory versions={versions} current={selected||null} onPick={id=>{const s=swaps.find(x=>x.id===id);if(s)chooseJob(s)}} onCancel={cancellable?id=>void act('cancel',swaps.find(s=>s.id===id)||null):undefined}/>}
   settings={settings}
   cost={quote?quote.credits:null} verb={quoted?'Replace car in video':'Get cost estimate'} busy={busy==='quote'||busy==='render'}
   disabled={quoted?!!busy||!approved||overBudget:!!busy||!source||!refs.length||!available}
   onGenerate={()=>void(quoted?act('render'):prepare())} note={note}/>
  <input hidden ref={adInput} type="file" accept="video/mp4,.mp4" aria-label="Reference ad" onChange={e=>{void uploadAd(e.target.files?.[0]);e.target.value=''}}/>
  <input hidden ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Car view image" onChange={e=>{void uploadScreenshot(e.target.files?.[0]);e.target.value=''}}/>
  {cropImage&&<SwapCropDialog src={cropImage} onClose={()=>setCropImage('')} onAdd={(file,original)=>{setCropImage('');void addImage(file,original,uploadLabel)}}/>}
 </WorkspaceFrame>;
}
