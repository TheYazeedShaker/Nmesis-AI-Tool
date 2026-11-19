'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AlertCircle,Download,Plus,RefreshCw,Upload,X} from 'lucide-react';
import {useBackoffPoll} from '@/lib/use-backoff-poll';
import {useUndoableRemoval} from '@/components/undo-removal';
import {TrashControls} from '@/components/trash-controls';
import {useConfirm} from '@/components/ds/dialog';
import {Button,IconButton,buttonClass} from '@/components/ds/button';
import {Loading,SkeletonPanel,State} from '@/components/ds/feedback';
import {Checkbox,Field,Input,Radio,RadioGroup,Select,Switch,Textarea} from '@/components/ds/field';
import {DropZone} from '@/components/ds/drop-zone';
import {useToast} from '@/components/ds/toast';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {Advanced,EditorScreen,EDITOR_TOOLS,type GenerateBlocker} from '@/components/editor/editor-screen';
import {CostBadge,SaveToProject,SettingsSection,VersionHistory} from '@/components/editor/parts';
import {useProject} from '@/components/editor/use-project';
import {FILM_STATUS,FILM_WORKING,FilmConnectionDialog,FilmExportDialog,FilmNameField,FilmQualitySettings,QUALITY_MODEL,filmVersions,hasQuality,qualityOf,type FilmShape,type VideoConnection} from '@/components/editor/films-parts';
import {AccountNotices,PlanGate,providerNames,useAccount} from '@/components/studio-account';
import {KEY_VISUAL_HREF} from '@/components/studio-topbar';
import {filmModelLabel,plainProviderText} from '@/lib/provider-words';
import {studioFetch} from '@/lib/studio-fetch';
import {FILM_MODELS,MOTIONS,SEEDANCE_IMAGE_MODEL,SEEDANCE_REFERENCE_MODEL,VIDEO_MODEL,filmDuration,filmModelInfo,type Film,type FilmDraft} from '@/lib/films';
import {refreshCredits,useCredits,costLabel} from '@/components/credits';
import {creditsLabel} from '@/lib/credits/words';
import {OWN_KEY} from '@/lib/ds/words';
import './editor-films.css';

// Film in the one editor (Phase 3 group 2): the film or its starting frame in
// the middle, every film as a version under it, one settings panel with the
// estimate and Generate, Save to project and the film's own actions in the
// canvas bar. A film is estimated first (free), approved, then rendered.

// The studio's own API. Rendering asks the provider for a fresh price, so the
// answer may take a while; past this the person is told and can try again.
const API_TIMEOUT_MS=180_000,UPLOAD_TIMEOUT_MS=180_000;
const timeoutWords=(e:unknown)=>e instanceof Error&&e.name==='TimeoutError'?new Error('The studio took too long to answer. Check the film’s status before trying again.'):e;
async function api<T=Record<string,unknown>>(url:string,method='GET',body?:unknown):Promise<T>{
 try{
  const r=await studioFetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(API_TIMEOUT_MS)});
  const d=await r.json().catch(()=>({})) as {error?:string};
  if(!r.ok)throw new Error(d.error||'The studio could not complete that request.');
  return d as T;
 }catch(e){throw timeoutWords(e)}
}
type Films={films:Film[]};type OneFilm={film:Film};
const active=(f:Film)=>['queued','in_progress','archiving'].includes(f.status);
const WORKFLOWS:{id:FilmDraft['mode'];label:string;help:string}[]=[
 {id:'launch',label:'Launch film',help:'15 seconds · three directed shots'},
 {id:'animate',label:'Animate image',help:'5 seconds · image is the first frame'},
 {id:'reference',label:'Create from car reference',help:'5 seconds · text directs a new scene'},
];

export default function Page(){return <PlanGate feature="studio.film"><FilmStudio/></PlanGate>}
function FilmStudio(){const router=useRouter(),showNames=providerNames(useAccount()),project=useProject(),{toast}=useToast();
 // Before unsaved changes are lost (in place of confirm()): the safe answer, Keep editing, has focus.
 const removeLater=useUndoableRemoval(),ask=useConfirm(),discardChanges=()=>ask({title:'Discard your changes?',body:'This film has changes that are not saved yet. Opening another one discards them.',verb:'Discard changes',cancel:'Keep editing',danger:true});const w=(text:string)=>showNames?text:plainProviderText(text);
 const notify=(message:string)=>toast({message,kind:'ok'});
 const [films,setFilms]=useState<Film[]>([]),[selected,setSelected]=useState(''),[draft,setDraft]=useState<FilmDraft|null>(null),[dirty,setDirty]=useState(false),[connection,setConnection]=useState<VideoConnection|null>(null),[settings,setSettings]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true),[approved,setApproved]=useState(false),[shape,setShape]=useState<FilmShape>('landscape'),[exporting,setExporting]=useState<number|null>(null),[exportOpen,setExportOpen]=useState(false);
 const uploadInput=useRef<HTMLInputElement|null>(null);
 const exportController=useRef<AbortController|null>(null),actionRef=useRef(false),currentId=useRef('');const film=films.find(f=>f.id===selected);
 useEffect(()=>{currentId.current=selected},[selected]);
 const refreshConnection=useCallback(async()=>{const c=await api<VideoConnection>('/api/video-connection');setConnection(c)},[setConnection]);
 const updateFilm=useCallback((f:Film)=>{setFilms(prev=>[f,...prev.filter(x=>x.id!==f.id)].sort((a,b)=>b.createdAt-a.createdAt))},[]);
 useEffect(()=>{let mounted=true;const query=new URLSearchParams(location.search);void Promise.all([api<Films>('/api/films'),api<VideoConnection>('/api/video-connection')]).then(([d,c])=>{if(!mounted)return;if(query.get('settings')==='budget')setSettings(true);setFilms(d.films);setConnection(c);const id=query.get('id');const first=d.films.find(f=>f.id===id)||d.films[0];if(id&&!d.films.some(f=>f.id===id)){void api<OneFilm>('/api/films/'+id).then(v=>{if(mounted){updateFilm(v.film);setSelected(v.film.id);setDraft(v.film.data)}}).catch((e:Error)=>{if(mounted)setError(e.message)})}if(first){setSelected(first.id);setDraft(first.data)}}).catch((e:Error)=>{if(mounted)setError(e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false;exportController.current?.abort()}},[updateFilm]);
 useBackoffPoll(async()=>{if(actionRef.current)return 'same';const pending=films.filter(active).sort((a,b)=>a.revision-b.revision)[0];if(!pending)return 'idle';actionRef.current=true;try{const d=await api<OneFilm>(`/api/films/${pending.id}/refresh`,'POST');updateFilm(d.film);return d.film.status!==pending.status?'changed':'same'}catch(e){setError((e as Error).message);return 'same'}finally{actionRef.current=false}},{base:12000,max:60000,enabled:films.some(active)});
 async function choose(f:Film){if(busy||exporting!==null)return;if(dirty&&!await discardChanges())return;setSelected(f.id);setDraft(f.data);setDirty(false);setApproved(false);setError('');history.replaceState(null,'','/films?id='+f.id)}
 function edit(update:Partial<FilmDraft>){setDraft(d=>d?{...d,...update}:d);setDirty(true);setApproved(false)}
 async function run(label:string,fn:()=>Promise<void>){if(actionRef.current)return;actionRef.current=true;setBusy(label);setError('');try{await fn()}catch(e){setError((e as Error).message);if(currentId.current)try{const d=await api<OneFilm>('/api/films/'+currentId.current);updateFilm(d.film)}catch(again){console.warn('The film could not be reloaded after an error.',(again as Error).name)}}finally{actionRef.current=false;setBusy('')}}
 async function save(){if(!film||!draft)return;const d=await api<OneFilm>('/api/films/'+film.id,'PATCH',draft);updateFilm(d.film);setDraft(d.film.data);setDirty(false);setApproved(false)}
 async function action(name:string,target:Film|undefined=film){if(!target)return;if(name==='render')setApproved(false);await run(name,async()=>{if(name==='quote'&&dirty)await save();const d=await api<OneFilm>(`/api/films/${target.id}/${name}`,'POST',name==='render'?{approvedEstimate:target.credits,approvedRevision:target.revision}:undefined);updateFilm(d.film);setApproved(false);refreshCredits();await refreshConnection()})}
 async function duplicate(){if(!film||!draft)return;await run('new',async()=>{const d=await api<OneFilm>('/api/films','POST',{sourceId:draft.sourceId,title:draft.title.replace(/ · (launch film|image animation|reference film)$/,''),vehicle:draft.vehicle});const patched=await api<OneFilm>('/api/films/'+d.film.id,'PATCH',draft);updateFilm(patched.film);setSelected(patched.film.id);setDraft(patched.film.data);setDirty(false);setApproved(false);history.replaceState(null,'','/films?id='+patched.film.id)})}
 async function uploadFrame(file:File){await run('upload',async()=>{if(dirty&&!await discardChanges())return;const form=new FormData();form.set('image',file);let response:Response;try{response=await studioFetch('/api/assets',{method:'POST',body:form,signal:AbortSignal.timeout(UPLOAD_TIMEOUT_MS)})}catch(e){throw timeoutWords(e)}const asset=await response.json().catch(()=>({})) as {id?:string;error?:string};if(!response.ok||!asset.id)throw new Error(asset.error||'The image could not be uploaded.');const title=file.name.replace(/\.[^.]+$/,'').slice(0,70);const created=await api<OneFilm>('/api/films','POST',{sourceId:asset.id,title,vehicle:'Selected vehicle'});const patched=await api<OneFilm>('/api/films/'+created.film.id,'PATCH',{...created.film.data,mode:'animate',sound:false});updateFilm(patched.film);setSelected(patched.film.id);setDraft(patched.film.data);setDirty(false);setApproved(false);history.replaceState(null,'','/films?id='+patched.film.id)})}
 async function makeExport(){if(!film?.videoUrl||!draft)return;setError('');setExporting(0);const controller=new AbortController();exportController.current=controller;try{const {exportFilm}=await import('@/lib/film-export');await exportFilm(film.videoUrl,shape,draft.brand,draft.tagline,setExporting,controller.signal);notify('Your branded film has downloaded.')}catch(e){if((e as Error).name!=='AbortError')setError((e as Error).message)}finally{setExporting(null);exportController.current=null}}
 async function saveKey(key:string){let saved=false;await run('key',async()=>{const c=await api<VideoConnection>('/api/video-connection','POST',{key});setConnection(c);setSettings(false);saved=true;notify('Video key saved securely. Get a film estimate to verify access.')});return saved}
 function removeConnection(){setSettings(false);removeLater({message:'Your video connection will be removed.',url:'/api/video-connection',removed:async()=>{setConnection(await api<VideoConnection>('/api/video-connection'));notify('Video connection removed.')}})}
 const creditInfo=useCredits();const creditsLeft=creditInfo&&!creditInfo.unlimited&&creditInfo.billing.higgsfield==='credits'?creditInfo.meter?.left:undefined;const videoReady=!!(connection?.connected||connection?.available);
 const editable=!!film&&['draft','quoted'].includes(film.status);const isBusy=!!busy;const overBudget=!!film&&typeof creditsLeft==='number'&&film.credits>creditsLeft;const selectedModel=draft?filmModelInfo(draft):FILM_MODELS[0];
 const quoted=!!film&&film.status==='quoted'&&!dirty,price=film&&quoted?costLabel(creditInfo,film.credits,'higgsfield')||creditsLabel(film.credits):null;
 const modelName=(m:{id:string;label:string})=>showNames?m.label:filmModelLabel(m.id);
 function chooseWorkflow(mode:FilmDraft['mode']){const model=mode==='launch'?(selectedModel.launch?selectedModel.id:VIDEO_MODEL):mode==='reference'?(selectedModel.reference?selectedModel.id:SEEDANCE_REFERENCE_MODEL):(selectedModel.reference?SEEDANCE_IMAGE_MODEL:selectedModel.id);const label=mode==='launch'?'launch film':mode==='animate'?'image animation':'reference film';const title=draft?.title.replace(/ · (launch film|image animation|reference film)$/,` · ${label}`);edit({mode,model,vehicleMotion:mode==='animate'?draft?.vehicleMotion:'stationary',...(title?{title}:{})})}
 function chooseModel(id:string){const m=FILM_MODELS.find(x=>x.id===id);if(m&&draft)edit({model:m.id,sound:m.sound?draft.sound:false})}

 // Generate: an estimate first (free), then the approved render with its cost on the button; a rendered film starts a new version.
 const working=!!film&&FILM_WORKING.includes(film.status),recovering=!!film&&['unknown','submitting'].includes(film.status);
 let verb='Get film estimate',cost:number|null=null,generateBusy=false,generateDisabled=true,onGenerate=()=>{};
 if(film&&draft){
  if(!editable){verb='Create another version';generateBusy=busy==='new';generateDisabled=(isBusy&&!generateBusy)||exporting!==null;onGenerate=()=>void duplicate()}
  else if(quoted){verb='Generate film';cost=film.credits;generateBusy=busy==='render';generateDisabled=(isBusy&&!generateBusy)||!approved||overBudget;onGenerate=()=>void action('render')}
  else{verb='Get film estimate';generateBusy=busy==='quote';generateDisabled=isBusy&&!generateBusy;onGenerate=()=>void action('quote')}
 }
 // Why Generate cannot run here: no video set up (the account and credits are checked by the editor).
 const blocked:GenerateBlocker|null=editable&&connection&&!videoReady?(connection.ownKeys&&!connection.sponsored
  ?{title:w('Connect your video key to make films'),body:'Your company uses its own keys.',action:<Button size="sm" onClick={()=>setSettings(true)}>Connect</Button>}
  :{title:'Video isn’t set up for your Studio yet',body:'Ask Nmesis to set it up.'}):null;
 const note=typeof creditsLeft==='number'?<>{creditsLabel(creditsLeft)} left this month{overBudget&&film?.status==='quoted'?' · not enough for this film. Ask Nmesis to add a pack.':''}</>:' '/* the line stays reserved while credits load or are not counted: nothing under Generate moves */;

 // Versions: every film, newest first. Cancel shows only when every film being made can still be cancelled (queued); otherwise it is on the open film.
 const versions=filmVersions(films),makingNow=films.filter(f=>FILM_WORKING.includes(f.status)),cancelInHistory=makingNow.length>0&&makingNow.every(f=>f.status==='queued');

 const bar=<>
  {film&&draft?<FilmNameField value={draft.title} onChange={title=>edit({title})} disabled={!editable||isBusy}/>:<span className="ds-label">Film</span>}
  {film&&<SaveToProject folders={project.folders} folderId={project.folderOf('film',film.id)} onSave={folderId=>void project.save('film',film.id,folderId)} disabled={!project.ready}/>}
  <span className="editor-bar-actions">
   {film?.videoUrl&&<Button size="sm" kind="quiet" icon={<Download aria-hidden="true"/>} onClick={()=>setExportOpen(true)}>{exporting!==null?`Exporting ${exporting}%`:'Branded film'}</Button>}
   {film?.videoUrl&&exporting===null&&<a className={buttonClass({kind:'quiet',size:'sm'})} href={film.videoUrl+'?download=1'} download><Download aria-hidden="true"/>Original MP4</a>}
   <TrashControls kind="films" item={film?{id:film.id,title:film.data.title,busy:['queued','in_progress','submitting','unknown','archiving'].includes(film.status)}:null} onDeleted={id=>{setFilms(v=>v.filter(f=>f.id!==id));if(id===selected){setSelected('');setDraft(null);setDirty(false);history.replaceState(null,'','/films')}}} onRestored={()=>void api<Films>('/api/films').then(d=>setFilms(d.films),(e:Error)=>setError(e.message))}/>
  </span>
 </>;

 const startButtons=(primary:boolean)=><>
  <Button size={primary?'md':'sm'} icon={<Upload aria-hidden="true"/>} busy={busy==='upload'} disabled={(isBusy&&busy!=='upload')||loading||exporting!==null} onClick={()=>uploadInput.current?.click()}>Upload starting frame</Button>
  <a className={buttonClass({kind:primary?'primary':'quiet',size:primary?'md':'sm'})} href={KEY_VISUAL_HREF}><Plus aria-hidden="true"/>Choose a key visual</a>
 </>;
 const errorLine=error&&<div className="ds-row" role="alert"><p className="ds-error"><AlertCircle aria-hidden="true"/>{error}</p><IconButton label="Dismiss error" size="sm" onClick={()=>setError('')}><X aria-hidden="true"/></IconButton></div>;
 const stage=<div className="editor-result">
  {errorLine}
  {loading?<Loading label="Opening your film studio…"><SkeletonPanel/></Loading>
  :!film||!draft?<State kind="empty" title="Start with a visual you love." actions={startButtons(true)}>Open a key visual and choose Create launch film, or upload a starting frame. Then choose whether it becomes the first frame or a car reference.</State>
  :<>
   <figure className="editor-films-figure">
    <div className="editor-films-frame">
     {film.videoUrl?<video key={film.id} className="editor-films-media" controls playsInline src={film.videoUrl} poster={'/api/assets/'+draft.sourceId}/>:<>
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
      <img className="editor-films-media" crossOrigin="anonymous" src={'/api/assets/'+draft.sourceId} alt={draft.mode==='reference'?'Approved vehicle reference for the text-directed video':'Approved visual used as the video starting frame'}/>
      <span className="editor-live">{active(film)&&<span aria-hidden="true"/>}{active(film)?FILM_STATUS[film.status]:draft.mode==='reference'?'Car reference':'Approved key visual'}</span>
     </>}
    </div>
    <figcaption><span>{FILM_STATUS[film.status]||film.status} · {filmDuration(draft)} seconds · {draft.sound?'With sound':'Silent'} · {modelName(selectedModel)}</span>{film.status==='ready'&&<CostBadge credits={film.credits} used/>}</figcaption>
   </figure>
   {working&&<div className="editor-films-job">
    <p>{recovering?w('The first response was lost. Recovery reuses the original request key, so Higgsfield cannot create a duplicate. If the first attempt never started, this may start your approved render.'):active(film)?'Your approved visual is becoming a film. Rendering continues if you close this tab.':'Rendering continues if you close this tab.'}</p>
    <p className="ds-muted">Return within seven days so the studio can save the finished film to your library.</p>
    <span className="editor-row">
     <Button size="sm" icon={<RefreshCw aria-hidden="true"/>} busy={busy==='recover'||busy==='refresh'} disabled={isBusy&&busy!=='recover'&&busy!=='refresh'} onClick={()=>void action(recovering?'recover':'refresh')}>{recovering?'Recover original request':'Refresh status'}</Button>
     {film.status==='queued'&&<Button size="sm" kind="quiet" busy={busy==='cancel'} disabled={isBusy&&busy!=='cancel'} onClick={()=>void action('cancel')}>Cancel queued film</Button>}
    </span>
   </div>}
   {film.error&&!recovering&&<p className="ds-error"><AlertCircle aria-hidden="true"/>{film.error}</p>}
   <p className="ds-help">{draft.mode==='reference'?'The image guides the car design; your text directs the scene.':'The car stays the reference. Movement stays restrained.'} Review badges, wheels, proportions and reflections before sharing. AI can still alter details.</p>
  </>}
 </div>;

 const reference=draft?.mode==='reference',shotCount=draft?.mode==='launch'?3:1;
 const settingsPanel=<>
  <SettingsSection title="Starting frame" id="film-frame-title">
   <DropZone name="starting frame" label="Drop, paste or upload a picture to start a film from" hint="PNG, JPEG or WebP · up to 40 MB. A new picture starts a new film."
    value={film&&draft?'/api/assets/'+draft.sourceId:null} valueName={draft?.vehicle} valueMeta={reference?'Car reference':'Starting frame'}
    onFile={file=>uploadFrame(file)} busy={busy==='upload'?'Uploading your starting frame…':false} disabled={(isBusy&&busy!=='upload')||loading||exporting!==null}/>
   <div className="editor-row"><a className={buttonClass({kind:'quiet',size:'sm'})} href={KEY_VISUAL_HREF}><Plus aria-hidden="true"/>Choose a key visual</a></div>
  </SettingsSection>
  {film&&draft&&<fieldset className="editor-films-fieldset" disabled={!editable||isBusy}>
   <legend className="ds-sr-only">Direct the film</legend>
   <SettingsSection title="Workflow" id="film-workflow-title">
    <RadioGroup legend="Choose a workflow">{WORKFLOWS.map(m=><Radio key={m.id} name="film-workflow" checked={draft.mode===m.id} onChange={()=>chooseWorkflow(m.id)} label={m.label} help={m.help}/>)}</RadioGroup>
   </SettingsSection>
   <SettingsSection title="Prompt" id="film-prompt-title">
    {reference?<Field label="Describe your video" help="Describe the action, camera, location and lighting. The car image guides its appearance; it does not have to be the opening frame." count={{value:(draft.creativePrompt||'').length,max:2000}}>
      <Textarea value={draft.creativePrompt||''} maxLength={2000} rows={5} placeholder="The car moves through a rain-soaked city at blue hour. Low tracking camera, soft reflections on the road, calm premium mood…" onChange={e=>edit({creativePrompt:e.target.value})}/>
     </Field>
    :<>
     <RadioGroup legend="Motion direction">{Object.entries(MOTIONS).map(([k,m])=><Radio key={k} name="film-motion" checked={draft.style===k} onChange={()=>edit({style:k as FilmDraft['style'],shots:m.shots.map(s=>({...s}))})} label={m.name} help={m.description}/>)}</RadioGroup>
     {draft.shots.slice(0,shotCount).map((shot,i)=><div key={i} className="ds-stack">
      <Field label={`Shot ${i+1} title`}><Input value={shot.title} maxLength={60} onChange={e=>edit({shots:draft.shots.map((s,n)=>n===i?{...s,title:e.target.value}:s)})}/></Field>
      <Field label={`Shot ${i+1} direction · ${i*5}–${(i+1)*5} s`} count={{value:shot.direction.length,max:700}}><Textarea value={shot.direction} maxLength={700} rows={4} onChange={e=>edit({shots:draft.shots.map((s,n)=>n===i?{...s,direction:e.target.value}:s)})}/></Field>
     </div>)}
    </>}
    {editable&&<span className="editor-row"><Button size="sm" busy={busy==='save'} disabled={!dirty||(isBusy&&busy!=='save')} onClick={()=>void run('save',async()=>{await save();notify(reference?'Direction saved.':'Storyboard saved.')})}>{dirty?(reference?'Save direction':'Save storyboard'):(reference?'Direction saved':'Storyboard saved')}</Button></span>}
   </SettingsSection>
   <SettingsSection title="Film" id="film-film-title">
    <div className="ds-field"><span className="ds-label">Length</span><p className="ds-help">{filmDuration(draft)} seconds{draft.mode==='launch'?', three shots of 5 seconds':''}. The workflow sets it.</p></div>
    {draft.mode==='animate'&&<><Switch label="Allow driving" checked={draft.vehicleMotion==='driving'} onChange={e=>edit({vehicleMotion:e.target.checked?'driving':'stationary'})}/><p className="ds-help">Follow the driving action in your shot direction.</p></>}
    {selectedModel.sound?<><Switch label="Cinematic sound" checked={draft.sound} onChange={e=>edit({sound:e.target.checked})}/><p className="ds-help">Ambient sound and instrumental direction.</p></>:<p className="ds-help">This model creates a silent video.</p>}
   </SettingsSection>
   {hasQuality(draft.mode)&&<FilmQualitySettings value={qualityOf(draft.model)} onChange={q=>chooseModel(QUALITY_MODEL[q])} price={price}/>}
  </fieldset>}
  {film&&draft&&quoted&&<SettingsSection title="Estimate" id="film-estimate-title">
   <p><span className="editor-films-price">{price}</span> <span className="ds-muted">for this film</span></p>
   <p className="ds-help">{connection?.connected?OWN_KEY:w('Reserved when it starts, charged once Higgsfield accepts it')}. Price checked again before submission. A higher price requires your approval again.</p>
   <Checkbox label="I approve this source image, storyboard and estimated cost." checked={approved} onChange={e=>setApproved(e.target.checked)}/>
   <span className="editor-row"><Button size="sm" kind="quiet" icon={<RefreshCw aria-hidden="true"/>} busy={busy==='quote'} disabled={isBusy&&busy!=='quote'} onClick={()=>void action('quote')}>Refresh estimate</Button></span>
  </SettingsSection>}
  <Advanced name="film" summary={film&&draft?'Model and video connection':'Video connection'}>
   {film&&draft&&<Field label="Model" help={<>{selectedModel.description}. {draft.mode==='launch'?w('Three-shot films use Kling 3.0 with a separate direction for each shot.'):reference?w('Seedance uses your image as a car reference. Your text describes the shot and setting.'):w('The image anchors the first frame. Kling, Seedance and PixVerse are available.')} The price is checked for your selection before rendering.</>}>
     <Select value={selectedModel.id} disabled={!editable||isBusy} onChange={e=>chooseModel(e.target.value)}>{FILM_MODELS.filter(m=>reference?m.reference:draft.mode==='launch'?m.launch:!m.reference).map(m=><option key={m.id} value={m.id}>{modelName(m)}{m.sound?'':' · Silent'}</option>)}</Select>
    </Field>}
   <span className="editor-row"><Button size="sm" kind="quiet" onClick={()=>setSettings(true)}>{connection?.sponsored?'Company video connection':'Video connection'}</Button></span>
  </Advanced>
 </>;

 return <WorkspaceFrame current="films" bleed notices={<AccountNotices variant="ds"/>}>
  <EditorScreen tool="films" onTool={t=>{const href=EDITOR_TOOLS.find(x=>x.id===t)?.href;if(href&&t!=='films')router.push(href)}}
   bar={bar} stage={stage}
   history={<VersionHistory versions={versions} current={selected||null} onPick={id=>{const f=films.find(x=>x.id===id);if(f)void choose(f)}} onCancel={cancelInHistory?id=>void action('cancel',films.find(f=>f.id===id)):undefined}/>}
   loading={loading} settings={settingsPanel} cost={cost} verb={verb} busy={generateBusy} disabled={generateDisabled} blocked={blocked} payer="higgsfield" onGenerate={onGenerate} note={note}/>
  <input ref={uploadInput} className="editor-films-hidden" type="file" hidden tabIndex={-1} aria-hidden="true" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void uploadFrame(file)}}/>
  {film?.videoUrl&&draft&&<FilmExportDialog open={exportOpen} onClose={()=>setExportOpen(false)} videoUrl={film.videoUrl} brand={draft.brand} tagline={draft.tagline} onBrand={brand=>setDraft({...draft,brand})} onTagline={tagline=>setDraft({...draft,tagline})} shape={shape} onShape={setShape} exporting={exporting} onExport={()=>void makeExport()} onCancel={()=>exportController.current?.abort()}/>}
  <FilmConnectionDialog open={settings} onClose={()=>setSettings(false)} connection={connection} words={w} busy={isBusy} saving={busy==='key'} error={settings?error:''} onSave={saveKey} onRemove={removeConnection}/>
 </WorkspaceFrame>;
}
