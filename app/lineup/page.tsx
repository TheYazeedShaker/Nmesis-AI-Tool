'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AlertTriangle,Columns2,Download,Loader2,MoreHorizontal,RefreshCw,RotateCcw,Scissors,Share2,Wand2,X} from 'lucide-react';
import {addReference,referenceLimit,removeReference,trayItems,useReferenceTray,type TrayItem} from '@/lib/reference-tray';
import {resolveTrayReference} from '@/lib/reference-resolve';
import {NEED_INSPIRATION,hasInspiration,lineupInspiration,lineupMoodId} from '@/lib/lineup-reference';
import {addAsReference,openPanel} from '@/components/shell/shell-state';
import {SharePanel} from '@/components/share/share-panel';
import {useBackoffPoll} from '@/lib/use-backoff-poll';
import {AccountNotices,PlanGate,hasFeature,providerNames,useAccount} from '@/components/studio-account';
import {studioFetch} from '@/lib/studio-fetch';
import {importPinterestReference} from '@/lib/pinterest-client';
import {uploadReference} from '@/lib/reference-upload';
import {clipboardImage} from '@/lib/clipboard-image';
import {fetchDownloadImage,imageFilename} from '@/lib/image-download';
import {AreaEditor} from '@/components/area-editor';
import {CONFIGURATORS,type Configurator} from '@/lib/configurators';
import {useConfiguratorPresets,isDemoConfigurator} from '@/lib/configurator-presets';
import {MAX_LINEUP_CARS,arrangeCars,parseLineup,lineupCapacity,type Lineup,type LineupCar} from '@/lib/lineup';
import {OPENAI_IMAGE_MODEL,OPENAI_IMAGE_MODELS,higgsImageModel,HIGGSFIELD_IMAGE_MODELS,type ImageProvider} from '@/lib/image-models';
import {plainProviderText} from '@/lib/provider-words';
import {visualQualityLabel} from '@/lib/visual-labels';
import {credits as creditWords} from '@/lib/ds/words';
import {openaiImageCost} from '@/lib/credits/words';
import type {Visual} from '@/lib/studio';
import {costLabel,refreshCredits,useCredits} from '@/components/credits';
import {Button,IconButton} from '@/components/ds/button';
import {Banner} from '@/components/ds/shell';
import {Dialog} from '@/components/ds/dialog';
import {State} from '@/components/ds/feedback';
import {Menu,MenuItem} from '@/components/ds/menu';
import {useToast} from '@/components/ds/toast';
import {OpenInEditor} from '@/components/canvas/open-in-editor';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {EDITOR_TOOLS,EditorScreen,type GenerateBlocker} from '@/components/editor/editor-screen';
import {CostBadge,CostLine,PromptSettings,SaveToProject,SettingsSection,VersionHistory,type Version} from '@/components/editor/parts';
import {Fold} from '@/components/ds/layout';
import {useProject} from '@/components/editor/use-project';
import {ReferenceList} from '@/components/editor/reference-list';
import {PinterestLink} from '@/components/editor/pinterest-link';
import {LineupCarDialog} from '@/components/editor/lineup-capture';
import {LineupCars,LineupEngine,LineupImg,LineupLayout,LineupPlacement,LineupQuality,LineupReferenceSwitch,LineupRefineDialog,LineupSavedDialog,asset,lineupBillingNote,lineupCredits} from '@/components/editor/lineup-parts';
import './editor-lineup.css';

// Line-up: several cars in one picture, in the one editor (Phase 3 group 2).
// The canvas shows the placement guide or the version picked under it; one
// settings panel holds the cars, layout, inspiration, prompt, quality and
// engine; Refine a car, Area edit and Download act on the version shown.

const DEFAULT_BRIEF='A premium automotive lineup. Follow the inspiration lighting and environment, with natural shared reflections, believable relative vehicle sizes and grounded contact shadows.';
type Reply={visual:Visual;visuals:Visual[];warning?:string;generation?:unknown;ownKeys?:boolean};
async function api(url:string,body?:unknown):Promise<Reply>{const r=await studioFetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const d=await r.json().catch(()=>({error:'The connection was interrupted. Refresh saved lineups before trying again.'})) as Partial<Reply>&{error?:string};if(!r.ok)throw new Error(d.error||'Request failed.');return d as Reply}
/** A picture already in the Studio's storage (a saved setup's inspiration) as the lineup's reference. */
const savedInspiration=(id:string,name?:unknown):TrayItem=>({key:'asset:'+id,src:asset(id),name:typeof name==='string'&&name?name:'Saved inspiration',provider:'upload',assetId:id});
function newCar(config=CONFIGURATORS[0]):LineupCar{return{id:crypto.randomUUID(),name:config.name,configurator:config.url,finish:'',views:[],x:50,y:72,scale:35}}
const lineupWaiting=(v:Visual)=>!!v.lineup&&v.provider==='higgsfield'&&['queued','in_progress','archiving'].includes(v.jobStatus||'');
const STAGE:Record<string,string>={queued:'Waiting to start',in_progress:'Rendering',archiving:'Saving'};
function when(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([],{day:'numeric',month:'short'})}
const modelFor=(v:Visual)=>v.provider==='higgsfield'?v.model||HIGGSFIELD_IMAGE_MODELS[0].id:(OPENAI_IMAGE_MODELS.find(m=>m.id===v.model)?.id||OPENAI_IMAGE_MODEL);

export default function Page(){return <PlanGate feature="studio.lineups"><LineupStudio/></PlanGate>}
function LineupStudio(){
 const router=useRouter(),toast=useToast(),account=useAccount(),o=useCredits(),project=useProject();
 const names=providerNames(account),say=(t:string)=>names?t:plainProviderText(t);
 const [cars,setCars]=useState<LineupCar[]>([]),[layout,setLayout]=useState<Lineup['layout']>('inspiration'),[heroId,setHeroId]=useState(''),[strictReference,setStrictReference]=useState(false),[refineStrict,setRefineStrict]=useState(false),[compare,setCompare]=useState(false),[expert,setExpert]=useState(false),[captureId,setCaptureId]=useState(''),[libraryId,setLibraryId]=useState('');
 // Cars still on the placeholder (no views yet) move to the deployment's presets once they load.
 const presets=useConfiguratorPresets(list=>{if(!isDemoConfigurator(list[0]))setCars(p=>p.map((c,i)=>!c.views.length&&isDemoConfigurator({url:c.configurator})?{...c,name:(list[i<2?i:0]||list[0]).name,configurator:(list[i<2?i:0]||list[0]).url}:c))});
 const [shareOpen,setShareOpen]=useState(false);
 // The inspiration is the reference tray's first item (lib/lineup-reference.ts): the
 // References panel, an upload, a brand logo or a Pinterest link all put it there.
 const tray=useReferenceTray();const inspiration=lineupInspiration(tray);
 const [pin,setPin]=useState(''),[pinAdded,setPinAdded]=useState(''),[brief,setBrief]=useState(''),[provider,setProvider]=useState<ImageProvider>('openai'),[model,setModel]=useState<string>(OPENAI_IMAGE_MODEL),[size,setSize]=useState('2048x1152');
 const [visuals,setVisuals]=useState<Visual[]>([]),[currentId,setCurrentId]=useState<string|null>(null),[view,setView]=useState<'setup'|'result'>('setup'),[refineCar,setRefineCar]=useState(''),[refinement,setRefinement]=useState(''),[refineOpen,setRefineOpen]=useState(false),[areaOpen,setAreaOpen]=useState(false),[connected,setConnected]=useState(false),[status,setStatus]=useState<{known:boolean;ownKeys:boolean}>({known:false,ownKeys:false}),[ready,setReady]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[downloading,setDownloading]=useState(false);
 const [moodError,setMoodError]=useState(''),[pinError,setPinError]=useState('');
 const working=useRef(false),pollIndex=useRef(0),download=useRef<AbortController|null>(null);
 const tell=useCallback((message:string)=>toast.toast({message:names?message:plainProviderText(message),kind:'ok'}),[toast,names]);
 const put=useCallback((v:Visual)=>setVisuals(p=>[v,...p.filter(x=>x.id!==v.id)]),[]);
 const refresh=useCallback(async()=>{const d=await api('/api/visuals');setVisuals(d.visuals);if(d.warning)setError(d.warning);return d.visuals},[]);
 /** Show one version in the canvas; a finished line-up also sets refinement and the engine it was made with. */
 const pick=useCallback((v:Visual)=>{setCurrentId(v.id);setView('result');setCompare(false);if(v.status!=='ready')return;setAreaOpen(false);setRefinement('');if(v.lineup){setRefineStrict(v.lineup.strictReference===true);setRefineCar(v.lineup.heroId)}setProvider(v.provider||'openai');setModel(modelFor(v));setSize(v.size||'2048x1152')},[setAreaOpen,setRefinement,setRefineCar]);
 useEffect(()=>{try{const d=JSON.parse(localStorage.getItem('nmesis-lineup-v1')||'null');if(d?.cars?.length>=2&&d.cars.length<=MAX_LINEUP_CARS&&d.cars.every((c:LineupCar)=>c.id&&Array.isArray(c.views))){setCars(d.cars);setLayout(d.layout||'inspiration');setStrictReference(d.strictReference===true);setHeroId(d.heroId||d.cars[0].id);setPin(d.pin||'');setPinAdded(d.pin||'');if(typeof d.mood?.id==='string'&&!trayItems().length)addReference(savedInspiration(d.mood.id,d.mood.name),{replace:true});setBrief(d.brief||'')}else{const initial=[newCar(),newCar(CONFIGURATORS[1])];setCars(arrangeCars(initial,'inspiration',initial[0].id));setHeroId(initial[0].id)}}catch{const initial=[newCar(),newCar(CONFIGURATORS[1])];setCars(arrangeCars(initial,'inspiration',initial[0].id));setHeroId(initial[0].id)}setReady(true);
  // A link to one line-up (/lineup?visual=…) opens it once the versions load.
  void refresh().then(list=>{const id=new URLSearchParams(location.search).get('visual');const v=id?list.find(x=>x.id===id&&x.lineup):undefined;if(v){pick(v);window.history.replaceState(null,'','/lineup')}},e=>setError((e as Error).message));
  void api('/api/status').then(d=>{setConnected(!!d.generation);setStatus({known:true,ownKeys:!!d.ownKeys})},()=>{setConnected(false);setStatus({known:true,ownKeys:false})});},[refresh,pick]);
 useEffect(()=>{if(ready)try{localStorage.setItem('nmesis-lineup-v1',JSON.stringify({cars,layout,heroId,pin,brief,strictReference}))}catch{/* storage full or blocked: the draft stays in this tab only */}},[cars,layout,heroId,pin,brief,strictReference,ready]);
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[busy]);
 useEffect(()=>()=>download.current?.abort(),[]);
 useBackoffPoll(async()=>{if(working.current)return 'same';const pending=visuals.filter(lineupWaiting);if(!pending.length)return 'idle';const v=pending[pollIndex.current++%pending.length];working.current=true;try{const d=await api(`/api/image-jobs/${v.id}/refresh`,{});put(d.visual);return d.visual.jobStatus!==v.jobStatus?'changed':'same'}catch(e){setError((e as Error).message);return 'same'}finally{working.current=false}},{base:9000,max:45000,enabled:visuals.some(lineupWaiting)});
 async function run(label:string,fn:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(label);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{working.current=false;setBusy('')}}
 function update(id:string,patch:Partial<LineupCar>){setCars(p=>p.map(c=>c.id===id?{...c,...patch}:c))}
 function chooseLayout(value:Lineup['layout']){setLayout(value);setCars(arrangeCars(cars,value,heroId))}
 function chooseHero(id:string){setHeroId(id);if(layout==='hero')setCars(arrangeCars(cars,layout,id))}
 function moveCar(i:number,by:-1|1){const j=i+by;if(j<0||j>=cars.length)return;const next=[...cars];[next[i],next[j]]=[next[j],next[i]];setCars(arrangeCars(next,layout,heroId))}
 function removeCar(id:string){if(cars.length<=2)return;const next=cars.filter(c=>c.id!==id),hero=heroId===id?next[0].id:heroId;setHeroId(hero);setCars(arrangeCars(next,layout,hero))}
 function addCar(){if(cars.length>=MAX_LINEUP_CARS)return;setCars(arrangeCars([...cars,newCar(presets[0])],layout,heroId))}
 // Every way in goes through the shell's one action: in Car lineup it makes the picture the inspiration.
 async function importPin(){const d=await importPinterestReference(pin);addAsReference({key:'pinterest:'+d.id,src:asset(d.id),name:d.name||'Pinterest inspiration',provider:'pinterest',assetId:d.id});setPinAdded(pin);tell('Inspiration added. Its vehicles will be replaced by your lineup.');return d.id as string}
 async function uploadMood(file:File){const d=await uploadReference(file);setPin('');setPinAdded('');addAsReference({key:'upload:'+d.id,src:asset(d.id),name:file.name||'Your upload',provider:'upload',assetId:d.id})}
 // The inspiration card says its own problems: under the picture, or under the link.
 function addMood(file:File,label='Uploading inspiration…'){setMoodError('');return run(label,async()=>{try{await uploadMood(file)}catch(e){setMoodError(say((e as Error).message))}})}
 function addPin(){setPinError('');void run('Loading inspiration…',async()=>{try{await importPin()}catch(e){setPinError(say((e as Error).message))}})}
 let issue='';try{const l=parseLineup({cars,layout,heroId,strictReference})!;lineupCapacity(l,provider==='higgsfield'?higgsImageModel(model).maxImages:16)}catch(e){issue=(e as Error).message}
 async function generate(parent?:Visual){await run(parent?'Refining your selected car…':'Creating your car lineup…',async()=>{
  const lineup=parseLineup(parent?{...parent.lineup,targetCarId:refineCar,strictReference:refineStrict}:{cars,layout,heroId,strictReference})!;lineupCapacity(lineup,provider==='higgsfield'?higgsImageModel(model).maxImages:16,!!parent);
  const moodId=await lineupMoodId({parentMoodId:parent?.moodId,tray:trayItems(),pin,pinAdded,importPin,resolve:resolveTrayReference});
  const id=crypto.randomUUID(),body={id,lineup,sourceId:lineup.cars[0].views[0].id,moodId,brief:parent?.brief||brief||DEFAULT_BRIEF,vehicle:lineup.cars.map(c=>c.name).join(' + '),title:parent?parent.title.replace(/ · refined$/,'')+' · refined':lineup.cars.map(c=>c.name).join(' + ').slice(0,88)+' · lineup',pin:parent?.pin||pin,size,provider,model,parentId:parent?.id,refinement:parent?(refinement||'Restore the locked reference shot.'):undefined,generate:true};
  const pending:Visual={...body,src:'/api/assets/'+id,status:'pending',createdAt:new Date().toISOString()};put(pending);setCurrentId(id);setView('result');
  try{const d=await api(provider==='higgsfield'?'/api/image-jobs':'/api/generate',body);put(d.visual);if(d.visual.status==='ready')pick(d.visual);else tell('Your lineup is rendering. Progress is saved and updates automatically.')}
  catch(e){await refresh().catch(()=>null/* the request's own error is the one to show */);throw e}
  finally{refreshCredits()}
 })}
 function checkOriginal(v:Visual){void run('Checking original request…',async()=>{const action=['unknown','submitting'].includes(v.jobStatus||'')?'recover':['draft','quoted'].includes(v.jobStatus||'')?'generate':'refresh';put((await api(`/api/image-jobs/${v.id}/${action}`,{})).visual)})}
 function reuse(v:Visual){const l=v.lineup;if(!l)return;setCars(l.cars);setHeroId(l.heroId);setLayout(l.layout);setStrictReference(l.strictReference===true);if(v.moodId)addAsReference(savedInspiration(v.moodId));setPin(v.pin||'');setPinAdded(v.pin||'');setBrief(v.brief||'');setView('setup')}
 async function save(v:Visual){
  if(download.current)return;const c=new AbortController();download.current=c;setDownloading(true);
  const original={label:'Open original',run:()=>{window.open(v.src,'_blank','noopener,noreferrer')}};
  try{const blob=await fetchDownloadImage(v.src,c.signal);if(c.signal.aborted)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=imageFilename(v.title,blob.type);a.hidden=true;document.body.appendChild(a);try{a.click();toast.toast({message:'Download requested. If no file appears, open the original and save it.',kind:'ok',action:original})}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}}
  catch(e){if(!c.signal.aborted)toast.toast({message:e instanceof Error?e.message:'Download interrupted. Try again or open the original.',kind:'bad',action:original})}
  finally{download.current=null;if(!c.signal.aborted)setDownloading(false)}
 }

 // What the canvas and the history show.
 const placed=new Set<string>(),versionsOf:Visual[]=[];
 for(const v of [...visuals].reverse())if(v.lineup||(v.areaEdit&&placed.has(v.areaEdit.parentId))){placed.add(v.id);versionsOf.unshift(v)}
 const versions:Version[]=versionsOf.map((v,i)=>({id:v.id,n:versionsOf.length-i,src:v.status==='ready'?v.src:undefined,quality:visualQualityLabel(v)==='High detail'?'high':'standard',used:typeof v.credits==='number'?v.credits:null,provider:v.provider||'openai',at:when(v.createdAt),status:v.status==='ready'?'ready':v.status==='failed'?'failed':'working',stage:v.status==='pending'?STAGE[v.jobStatus||'']||'Creating your lineup':undefined,label:v.areaEdit?`Version ${versionsOf.length-i} · area edit`:undefined}));
 const shown=visuals.find(v=>v.id===currentId),selected=shown?.status==='ready'?shown:null,showResult=view==='result'&&!!shown;
 const savedMap=new Map<string,LineupCar>();
 for(const v of visuals){if(v.status!=='ready'||!v.sourceId)continue;const refs:LineupCar[]=v.lineup?.cars||[{id:v.id,name:v.vehicle||v.title,configurator:v.configurator||presets[0]?.url||'',finish:v.finish||'',views:[{id:v.sourceId,label:v.angle||'Saved captured view'}],x:50,y:72,scale:35}];for(const c of refs)if(!savedMap.has(c.views[0].id))savedMap.set(c.views[0].id,c)}
 const editCar=cars.find(c=>c.id===captureId),editConfig:Configurator|undefined=editCar?presets.find(c=>c.url===editCar.configurator)||{id:editCar.id,name:editCar.name,url:editCar.configurator}:undefined;
 const cost=lineupCredits(o,provider,model,size),billing=lineupBillingNote(o,provider,model,size,names);
 const areaCost=costLabel(o,openaiImageCost('2048x1152'),'openai'),canArea=hasFeature(account,'studio.area_edit');
 const engineWords=(v:Visual)=>names?(v.provider==='higgsfield'?'Higgsfield':'ChatGPT'):visualQualityLabel(v);
 const title=showResult&&shown?shown.title:'Car line-up';

 const bar=<>
  <h1 className="editor-lineup-title ds-truncate" title={title}>{title}</h1>
  {shown&&<div className="ds-segmented editor-stage-switch" role="group" aria-label="Show"><button type="button" aria-pressed={!showResult} onClick={()=>setView('setup')}>Placement</button><button type="button" aria-pressed={showResult} onClick={()=>setView('result')}>Result</button></div>}
  {selected&&showResult&&<SaveToProject folders={project.folders} folderId={project.folderOf('visual',selected.id)} disabled={!project.ready} onSave={f=>void project.save('visual',selected.id,f)}/>}
  <span className="editor-bar-actions">
   {selected&&showResult&&<>
    {selected.lineup&&<Button size="sm" kind="quiet" icon={<Wand2 aria-hidden="true"/>} disabled={!!busy} onClick={()=>setRefineOpen(true)}>Refine a car{cost!==null&&<span className="ds-btn-meta">· {creditWords(cost)}</span>}</Button>}
    {canArea&&<Button size="sm" kind="quiet" icon={<Scissors aria-hidden="true"/>} disabled={!!busy} onClick={()=>setAreaOpen(true)}>Area edit{areaCost&&<span className="ds-btn-meta">· {areaCost}</span>}</Button>}
    <IconButton label="Download" size="sm" busy={downloading} onClick={()=>void save(selected)}><Download aria-hidden="true"/></IconButton>
    {selected.status==='ready'&&<Button size="sm" kind="primary" icon={<Share2 aria-hidden="true"/>} onClick={()=>setShareOpen(true)}>Share</Button>}
   </>}
   <Menu label="More for this line-up" trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
    {selected&&showResult&&selected.moodId&&<MenuItem icon={<Columns2/>} onSelect={()=>setCompare(c=>!c)}>{compare?'Show generated lineup':'Compare with reference'}</MenuItem>}
    {selected?.lineup&&<MenuItem icon={<RotateCcw/>} disabled={!!busy} onSelect={()=>reuse(selected)}>Reuse this setup</MenuItem>}
    <MenuItem icon={<RefreshCw/>} disabled={!!busy} onSelect={()=>void run('Refreshing lineups…',async()=>{await refresh()})}>Refresh versions</MenuItem>
   </Menu>
  </span>
 </>;

 const stage=!showResult||!shown?<LineupPlacement cars={cars} heroId={heroId} strict={strictReference} moodId={inspiration?.assetId}/>
  :selected?<figure className="editor-result">
    {compare&&selected.moodId?<LineupImg src={asset(selected.moodId)} alt="Original inspiration"/>:<OpenInEditor visualId={selected.id} title={selected.title}><LineupImg src={selected.src} alt={selected.title}/></OpenInEditor>}
    <figcaption><span>{compare?'Original inspiration':[selected.width&&selected.height?`${selected.width} × ${selected.height}`:'',selected.lineup?.strictReference?'Reference locked':'',selected.lineup?`${selected.lineup.cars.length} cars`:'',engineWords(selected),'check each car against its references'].filter(Boolean).join(' · ')}</span><CostBadge credits={typeof selected.credits==='number'?selected.credits:null} used provider={selected.provider||'openai'}/></figcaption>
   </figure>
  :<State kind={shown.status==='failed'?'error':'empty'} icon={shown.status==='failed'?undefined:<Loader2 className="ds-spin-icon"/>} title={shown.status==='failed'?'Could not finish':'Creating your lineup…'}
    actions={shown.provider==='higgsfield'?<Button size="sm" disabled={!!busy} onClick={()=>checkOriginal(shown)}>Check original request</Button>:undefined}>{say(shown.error||'Aligning cars, light and atmosphere.')}</State>;

 // The settings, one column, for someone new: the cars, the inspiration, Quality,
 // what it will use; the layout, your words and the engine under Advanced (closed).
 const settings=<fieldset className="editor-lineup-fields" disabled={!!busy}>
  <LineupCars cars={cars} heroId={heroId} strict={strictReference} ready={ready} onEdit={setCaptureId} onSaved={setLibraryId} onHero={chooseHero} onMove={moveCar} onRemove={removeCar} onAdd={addCar}/>
  <div className="ds-contents" onPaste={e=>{const file=clipboardImage(e.clipboardData);if(file){e.preventDefault();if(!busy)void addMood(file,'Adding inspiration…')}}}>
  <ReferenceList id="lineup-inspiration-title" title="Inspiration" limit={referenceLimit('lineup')} help="Its cars are replaced by yours: the picture sets the staging, light and atmosphere."
   items={inspiration?[inspiration]:[]} onAdd={()=>openPanel('references')} onFile={file=>addMood(file)} onRemove={key=>{removeReference(key);setPin('');setPinAdded('');setMoodError('')}}
   busy={busy==='Uploading inspiration…'||busy==='Adding inspiration…'?busy:''} error={moodError||undefined} disabled={!!busy}>
   <PinterestLink value={pin} onChange={v=>{setPin(v);setPinError('')}} onAdd={addPin} busy={busy==='Loading inspiration…'} error={pinError||undefined} disabled={!!busy&&busy!=='Loading inspiration…'}
    help={<><b>What’s the mood?</b> A line-up picture for the staging, or a place for the light.</>}/>
   <LineupReferenceSwitch active={strictReference} onChange={active=>{setStrictReference(active);if(active)setLayout('inspiration')}}/>
  </ReferenceList>
  </div>
  <LineupQuality o={o} provider={provider} model={model} size={size} onSize={setSize} names={names}/>
  <CostLine cost={cost} own={billing||null}/>
  <Fold name="lineup-advanced" title="Advanced" summary={['Layout',brief.trim()?'your words':'your idea',names?'image generator, model and size':''].filter(Boolean).join(' · ')} className="editor-advanced">
   <div className="ds-stack">
    <LineupLayout cars={cars} layout={layout} strict={strictReference} expert={expert} onLayout={chooseLayout} onExpert={setExpert} onPlace={update}/>
    <PromptSettings label="Anything else? (optional)" value={brief} onChange={setBrief} max={2000} inspiration={false} placeholder="A mountain overlook at sunset. Keep every car visible, with warm light from the right…"/>
    {names&&<SettingsSection title="Image generator" id="lineup-engine-title"><LineupEngine names={names} provider={provider} model={model} size={size}
     onProvider={p=>{setProvider(p);setModel(p==='openai'?OPENAI_IMAGE_MODEL:HIGGSFIELD_IMAGE_MODELS[0].id);setSize('2048x1152')}}
     onModel={m=>{setModel(m);if(provider==='higgsfield'&&!higgsImageModel(m).max4k&&size==='3840x2160')setSize('2048x1152')}} onSize={setSize}/></SettingsSection>}
   </div>
  </Fold>
 </fieldset>;

 const jobs=busy||error?<div className="ds-stack">
  {busy&&<article className="ds-job" data-state="running" aria-label={busy}><div className="ds-job-head"><Loader2 aria-hidden="true" className="ds-spin-icon"/><h3 className="ds-job-title">{busy}</h3></div><p className="ds-job-stage" role="status">Keep this tab open; saved results appear in your versions.</p></article>}
  {error&&<Banner kind="bad" icon={<AlertTriangle/>}><span className="ds-row editor-message"><span>{say(error)}</span><IconButton label="Dismiss error" size="sm" onClick={()=>setError('')}><X aria-hidden="true"/></IconButton></span></Banner>}
 </div>:undefined;
 // Why Generate cannot run here (the account and credits are checked by the editor).
 const blocked:GenerateBlocker|null=status.known&&provider==='openai'&&!connected?(status.ownKeys?{title:say('Connect your OpenAI key to generate'),body:'Your company uses its own keys. An owner connects it in Company settings, under Own keys.'}:{title:'AI generation isn’t set up for your Studio yet',body:'Ask Nmesis to set it up.'}):null;
 const note=issue?say(issue):!hasInspiration(tray,pin)?NEED_INSPIRATION:[billing,'Creates one paid image. Original references and earlier versions stay saved.'].filter(Boolean).join(' ');

 return <WorkspaceFrame current="lineup" bleed notices={<AccountNotices variant="ds"/>}>
  <EditorScreen tool="lineup" loading={!status.known} onTool={t=>{if(t!=='lineup')router.push(EDITOR_TOOLS.find(x=>x.id===t)?.href||'/')}}
   bar={bar} stage={stage} history={<VersionHistory versions={versions} current={showResult?currentId:null} onPick={id=>{const v=visuals.find(x=>x.id===id);if(v)pick(v)}}/>}
   jobs={jobs} settings={settings} cost={cost} busy={!!busy} blocked={blocked} payer={provider} disabled={!ready||!status.known||!!issue||!hasInspiration(tray,pin)} onGenerate={()=>void generate()} note={note}/>
  {selected&&selected.status==='ready'&&<SharePanel open={shareOpen} onClose={()=>setShareOpen(false)} item={{kind:'visual',id:selected.id,title:selected.title,src:selected.src,mine:selected.mine!==false}}/>}
  {editCar&&editConfig&&<LineupCarDialog key={editCar.id} car={editCar} index={cars.indexOf(editCar)} config={editConfig} onPatch={patch=>update(editCar.id,patch)} onClose={()=>setCaptureId('')}/>}
  {libraryId&&<LineupSavedDialog saved={Array.from(savedMap.values())} cars={cars} targetId={libraryId} onClose={()=>setLibraryId('')} onPick={c=>{update(libraryId,{name:c.name,configurator:c.configurator,finish:c.finish,views:c.views.slice(0,2)});setLibraryId('')}}/>}
  {refineOpen&&selected?.lineup&&<LineupRefineDialog visual={selected} strict={refineStrict} onStrict={setRefineStrict} carId={refineCar} onCar={setRefineCar} text={refinement} onText={setRefinement} cost={cost} note={billing} onClose={()=>setRefineOpen(false)} onRefine={()=>{setRefineOpen(false);void generate(selected)}}/>}
  {areaOpen&&selected&&<Dialog open wide title="Edit an exact area" onClose={()=>{if(!busy)setAreaOpen(false)}}>
   <AreaEditor key={selected.id} visual={selected} connected={connected} onBusy={b=>{working.current=b;setBusy(b?'Editing selected area…':'')}} onSaved={v=>{put(v);pick(v);setAreaOpen(false)}}/>
  </Dialog>}
 </WorkspaceFrame>;
}
