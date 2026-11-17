'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArchiveRestore,Check,Download,MoreHorizontal,Plus,Save,Trash2,X} from 'lucide-react';
import {useBackoffPoll} from '@/lib/use-backoff-poll';
import {TrashControls} from '@/components/trash-controls';
import {AccountNotices,PlanGate,providerNames,useAccount} from '@/components/studio-account';
import {studioFetch} from '@/lib/studio-fetch';
import {importPinterestReference} from '@/lib/pinterest-client';
import {CONFIGURATORS,type Configurator} from '@/lib/configurators';
import {useConfiguratorPresets,isDemoConfigurator} from '@/lib/configurator-presets';
import {boardVehicle} from '@/lib/story-vehicle';
import {VIDEO_MODEL,type Film} from '@/lib/films';
import type {Storyboard,BoardShot,CarView} from '@/lib/storyboards';
import {costLabel,refreshCredits,useCredits} from '@/components/credits';
import {creditsLabel} from '@/lib/credits/words';
import type {CreditOverview} from '@/lib/credits/usage';
import type {CreditProvider} from '@/lib/credits/pricing';
import {plural} from '@/lib/ds/words';
import {Button,IconButton} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {Banner} from '@/components/ds/shell';
import {useToast} from '@/components/ds/toast';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {EDITOR_TOOLS,EditorScreen} from '@/components/editor/editor-screen';
import {NameField,SaveToProject,VersionHistory,type Version} from '@/components/editor/parts';
import {useProject} from '@/components/editor/use-project';
import {StoryCar,type SavedVisual} from '@/components/editor/storyboard-car';
import {FilmCut,ShotBoard,filmPending as pending} from '@/components/editor/storyboard-board';
import {StorySettings,qualityOf} from '@/components/editor/storyboard-settings';
import './editor-storyboard.css';

// Story (storyboards) in the one editor (Phase 3 group 2): the car, the shots
// and the film's cut in the canvas (Car / Shots / Film), the saved stories as
// the version history under it, one settings panel, and Generate as the next
// step with its credit cost: plan the shots, make the images, price the clips,
// render them, assemble the film. Every paid step is approved first.
// Generate is the one primary action; the canvas bar keeps the name, the stage
// switch and Save to project, and the rest (Save changes, New story, Download,
// Deleted) sits under "More actions" so the bar stays on one line at 1024–1440.

type Saved={board:Storyboard;film?:Film};
type Approval={kind:'plan'|'images'|'video';shotId?:string};
type Next={verb:string;cost:number|null;disabled?:boolean;run:()=>void;note:string};
async function api<T=Saved>(url:string,method='GET',body?:unknown):Promise<T>{const r=await studioFetch(url,{method,signal:AbortSignal.timeout(330_000),...body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'The studio could not complete this request.');return d}
const money=(n:number)=>creditsLabel(n);
const blank=():Storyboard=>({id:'',revision:0,title:'A new perspective',vehicle:CONFIGURATORS[0].name,configurator:CONFIGURATORS[0].url,views:[],idea:'',direction:'',moodId:'',pin:'',shots:[],model:VIDEO_MODEL,brand:'',tagline:'',updatedAt:0});
/** Credits before an action, as a number for Generate (0 on the company's own key; null when not known). */
const priceOf=(o:CreditOverview|null,n:number|undefined,provider:CreditProvider)=>!o||typeof n!=='number'?null:o.billing[provider]==='own key'?0:n;
const STEPS=['Car','Shots','Film'];
/** The finished film, saved as a file (a signed link the server marks for download). */
function downloadFilm(url:string){const a=document.createElement('a');a.href=url+'&download=1';a.download='';a.click()}
const when=(ms:number)=>{if(!ms)return 'Not saved';const d=new Date(ms);return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([], {day:'numeric',month:'short'})};

export default function Page(){return <PlanGate feature="studio.storyboards"><StoryStudio/></PlanGate>}
function StoryStudio(){const showNames=providerNames(useAccount());
 const router=useRouter(),toast=useToast(),project=useProject();
 const creditInfo=useCredits();const textCredits=costLabel(creditInfo,'openai.text','openai'),imageCredits=(n:number)=>costLabel(creditInfo,typeof creditInfo?.prices['openai.image.1k']==='number'?creditInfo.prices['openai.image.1k']*n:undefined,'openai');
 const textCost=priceOf(creditInfo,creditInfo?.prices['openai.text'],'openai'),imageCost=(n:number)=>priceOf(creditInfo,typeof creditInfo?.prices['openai.image.1k']==='number'?creditInfo.prices['openai.image.1k']*n:undefined,'openai');
 const [b,setB]=useState<Storyboard>(blank),[boards,setBoards]=useState<Storyboard[]>([]),[films,setFilms]=useState<Film[]>([]),[step,setStep]=useState(1),[expert,setExpert]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[count,setCount]=useState(6),[approve,setApprove]=useState<Approval|null>(null),[music,setMusic]=useState<File|null>(null),[progress,setProgress]=useState(0),[library,setLibrary]=useState<SavedVisual[]>([]);
 const setNotice=useCallback((message:string)=>{if(message)toast.toast({message,kind:'ok'})},[toast]);
 // A new, untouched story moves from the placeholder to the first preset once presets load.
 const presets=useConfiguratorPresets(list=>{if(!isDemoConfigurator(list[0]))setB(p=>!p.id&&!p.views.length&&isDemoConfigurator({url:p.configurator})?{...p,vehicle:list[0].name,configurator:list[0].url}:p)});
 const lock=useRef(false),current=useRef(b),abort=useRef<AbortController|null>(null);current.current=b;
 const put=useCallback((next:Storyboard)=>{current.current=next;setB(next);setBoards(prev=>[next,...prev.filter(x=>x.id!==next.id)]);if(next.id)history.replaceState(null,'','/storyboard?id='+next.id)},[]);
 const putFilm=(film:Film)=>setFilms(p=>[film,...p.filter(f=>f.id!==film.id)]);
 useEffect(()=>{let gone=false;void Promise.all([api<{boards:Storyboard[]}>('/api/storyboards'),api<{films:Film[]}>('/api/films'),api<{visuals?:(SavedVisual&{status:string})[]}>('/api/visuals')]).then(([s,f,v])=>{if(gone)return;setBoards(s.boards);setFilms(f.films);setLibrary((v.visuals||[]).filter(x=>x.status==='ready'));const id=new URLSearchParams(location.search).get('id'),saved=s.boards.find(x=>x.id===id);if(saved){put(saved);setStep(saved.shots.length?2:1)}}).catch((e:Error)=>setError(e.message));return()=>{gone=true}},[put]);
 async function run(label:string,fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(label);setError('');try{await fn()}catch(e){setError((e as Error).message);if(current.current.id){try{const d=await api('/api/storyboards/'+current.current.id);put(d.board)}catch(again){console.warn('The story could not be reloaded after an error.',again)}}}finally{setBusy('');lock.current=false}}
 // The chosen configurator car names the story (lib/story-vehicle.ts): the planner reads it from the saved story.
 async function save(value=current.current){const body={...value,vehicle:boardVehicle(value,presets)};const d=await api('/api/storyboards'+(body.id?'/'+body.id:''),body.id?'PATCH':'POST',body);put(d.board);return d.board}
 function edit(patch:Partial<Storyboard>){setB(p=>({...p,...patch,finalUrl:undefined}))}
 function shotEdit(id:string,patch:Partial<BoardShot>){edit({shots:b.shots.map(s=>s.id===id?{...s,...patch}:s)})}
 async function action(name:string,shotId?:string,extra:Record<string,unknown>={}){const board=current.current;const d=await api(`/api/storyboards/${board.id}/${name}`,'POST',{revision:board.revision,shotId,...extra});put(d.board);if(d.film)putFilm(d.film);return d}
 const selected=b.shots.filter(s=>s.selected),selectedFilms=selected.map(s=>films.find(f=>f.id===s.filmId));
 const toRender=selectedFilms.filter((f):f is Film=>!!f&&f.status==='quoted'&&f.data.model===b.model&&selected.some(s=>s.filmId===f.id&&s.motion===f.data.shots[0].direction)),price=toRender.reduce((n,f)=>n+f.credits,0);
 const ready=selected.length>=3&&selected.length<=6&&selectedFilms.every((f,i)=>f?.status==='ready'&&f.data.model===b.model&&f.data.shots[0].direction===selected[i].motion);
 useBackoffPoll(async()=>{const ids=current.current.shots.map(s=>s.filmId);const next=films.find(f=>ids.includes(f.id)&&['queued','in_progress','archiving'].includes(f.status));if(!next)return 'idle';if(lock.current)return 'same';lock.current=true;try{const d=await api<{film:Film}>(`/api/films/${next.id}/refresh`,'POST');putFilm(d.film);return d.film.status!==next.status?'changed':'same'}catch(e){setError((e as Error).message);return 'same'}finally{lock.current=false}},{base:12000,max:60000,enabled:films.some(f=>['queued','in_progress','archiving'].includes(f.status))});
 async function approved(){const a=approve;if(!a)return;setApprove(null);await run(a.kind==='plan'?'Planning your story…':a.kind==='images'?'Creating storyboard images…':'Starting approved clips…',async()=>{await save();if(a.kind==='plan'){await action('plan',undefined,{approved:true,count});setStep(2)}else if(a.kind==='images'){const shots=current.current.shots.filter(s=>a.shotId?s.id===a.shotId:s.selected&&!s.imageId);for(let i=0;i<shots.length;i++){setBusy(`Creating image ${i+1} of ${shots.length}…`);await action('image',shots[i].id,{approved:true,requestId:crypto.randomUUID()})}setNotice('Storyboard images are ready. Review car details and adjust any shot before making the film.')}else{for(const f of toRender){const shot=current.current.shots.find(s=>s.filmId===f.id&&s.selected);if(!shot)throw new Error('Your storyboard changed. Get a fresh video estimate.');await action('render',shot.id,{filmId:f.id,approvedEstimate:f.credits,approvedRevision:f.revision})}refreshCredits();setNotice('Your clips are rendering. You can return to this saved story later.')}})}
 async function estimate(){await run('Checking live video prices…',async()=>{await save();for(const s of current.current.shots.filter(s=>s.selected)){await action('quote',s.id)}setNotice('Review the total. Only new clips are included.');setStep(3)})}
 async function assemble(){await run('Assembling your 15-second film…',async()=>{const saved=await save();const approvedIds=saved.shots.filter(s=>s.selected).map(s=>s.filmId);if(selectedFilms.some((f,i)=>!f||f.id!==approvedIds[i]))throw new Error('Your storyboard changed. Generate the updated clips before assembling.');abort.current=new AbortController();setProgress(0);const {assembleStory}=await import('@/lib/storyboard-export');const blob=await assembleStory(selectedFilms.map(f=>f!.videoUrl!),saved.brand,saved.tagline,music,setProgress,abort.current.signal);const form=new FormData();form.set('video',blob,'story.mp4');form.set('revision',String(saved.revision));const r=await studioFetch(`/api/storyboards/${saved.id}/video`,{method:'POST',body:form,signal:AbortSignal.timeout(300_000)});const d=await r.json().catch(()=>({})) as Partial<Saved>&{error?:string};if(!r.ok||!d.board){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nmesis-story.mp4';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);throw new Error('Your film was downloaded, but could not be saved to the library. '+(d.error||''))}put(d.board);setNotice('Your finished film is saved.')})}
 function fresh(){const next=blank();current.current=next;setB(next);setStep(1);setMusic(null);history.replaceState(null,'','/storyboard')}
 const config:Configurator=presets.find(c=>c.url===b.configurator)||{id:'custom-car',name:b.vehicle,url:b.configurator||presets[0].url};
 const assembling=busy.startsWith('Assembling');
 // Generate is the story's next step, with what it costs before it starts.
 const missing=selected.filter(s=>!s.imageId),validCut=selected.length>=3&&selected.length<=6,videoCost=priceOf(creditInfo,price,'higgsfield');
 const next:Next=!b.shots.length?{verb:'Plan the shots',cost:textCost,disabled:b.idea.trim().length<8||!b.views.length,run:()=>setApprove({kind:'plan'}),note:!b.views.length?'Add a view of your car first.':b.idea.trim().length<8?'Describe your idea to plan the shots.':`One planning request writes ${count} editable shots.`}
  :missing.length?{verb:`Make ${plural(missing.length,'image')}`,cost:imageCost(missing.length),run:()=>setApprove({kind:'images'}),note:'For the selected shots without an image. Existing images stay saved.'}
  :!validCut?{verb:'Get video estimate',cost:null,disabled:true,run:()=>{},note:'Choose 3–6 shots with images for a 15-second film.'}
  :ready?{verb:'Assemble the film',cost:null,run:()=>void assemble(),note:'Keep this tab open while the clips are joined.'}
  :toRender.length?{verb:`Generate ${plural(toRender.length,'clip')}`,cost:videoCost,run:()=>setApprove({kind:'video'}),note:'Video credits only; images show their own. Prices are checked again before rendering.'}
  :selectedFilms.some(f=>pending(f))?{verb:'Clips are rendering',cost:null,disabled:true,run:()=>{},note:'Video renders continue while you are away.'}
  :{verb:'Get video estimate',cost:null,run:()=>void estimate(),note:'Checks live video prices for the selected shots.'};
 // The saved stories, newest first, each with the credits it used; the open one shows its work in progress.
 const usedBy=(x:Storyboard)=>{const ids=new Set(x.shots.flatMap(s=>[s.filmId,...s.oldFilmIds]).filter(Boolean));const parts=[x.credits,...x.shots.map(s=>s.credits),...films.filter(f=>ids.has(f.id)&&f.status==='ready').map(f=>f.credits)].filter((n):n is number=>typeof n==='number');return parts.length?parts.reduce((s,n)=>s+n,0):null};
 const renderingFilms=selectedFilms.filter((f):f is Film=>pending(f));
 const versions:Version[]=boards.map((x,i)=>{const thumb=x.shots.find(s=>s.imageId)?.imageId||x.views[0]?.id;const open=x.id===b.id,working=open&&(!!busy||renderingFilms.length>0);
  return {id:x.id,n:boards.length-i,label:x.title,src:thumb?'/api/assets/'+thumb:undefined,quality:qualityOf(x.model),used:usedBy(x),at:`${when(x.updatedAt)} · ${plural(x.shots.length,'shot')}`,status:working?'working':'ready',
   stage:working?busy||`Rendering ${plural(renderingFilms.length,'clip')}`:undefined,progress:open&&assembling?progress/100:undefined,held:open&&!busy&&renderingFilms.length?renderingFilms.reduce((n,f)=>n+f.credits,0):undefined}});
 const openStory=(id:string)=>{if(id===b.id)return;void run('Opening story…',async()=>{if(b.id)await save();const d=await api('/api/storyboards/'+id);put(d.board);setStep(d.board.shots.length?2:1)})};
 const tab=(i:number)=>!!busy||(i>0&&!b.views.length)||(i===2&&!b.shots.length);
 const bar=<>
  <NameField value={b.title} onChange={title=>edit({title})}/>
  <div className="ds-segmented editor-stage-switch" role="group" aria-label="Show">{STEPS.map((t,i)=><button key={t} type="button" aria-pressed={step===i+1} disabled={tab(i)} onClick={()=>setStep(i+1)}>{t}</button>)}</div>
  <SaveToProject folders={project.folders} folderId={b.id?project.folderOf('story',b.id):null} disabled={!b.id||!project.ready||!!busy} onSave={f=>void project.save('story',b.id,f)}/>
  <span className="editor-bar-actions">
   <TrashControls kind="storyboards" item={b.id?{id:b.id,title:b.title,busy:!!busy}:null} onDeleted={id=>{setBoards(v=>v.filter(x=>x.id!==id));if(b.id===id)fresh()}} onRestored={()=>void api<{boards:Storyboard[]}>('/api/storyboards').then(d=>setBoards(d.boards),(e:Error)=>setError(e.message))}>
    {trash=><Menu label="More actions" trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
     <MenuItem icon={<Save/>} disabled={!!busy||!b.id} onSelect={()=>void run('Saving story…',async()=>{await save()})}>Save changes</MenuItem>
     <MenuItem icon={<Plus/>} disabled={!!busy} onSelect={()=>void run('Opening new story…',async()=>{if(b.id)await save();fresh()})}>New story</MenuItem>
     {b.finalUrl&&<MenuItem icon={<Download/>} onSelect={()=>downloadFilm(b.finalUrl!)}>Download the finished film</MenuItem>}
     <MenuSeparator/>
     <MenuItem icon={<ArchiveRestore/>} onSelect={trash.show}>Deleted stories</MenuItem>
     {b.id&&<MenuItem icon={<Trash2/>} danger disabled={trash.busy} onSelect={trash.remove}>Delete story</MenuItem>}
    </Menu>}
   </TrashControls>
  </span>
 </>;
 const stage=<div className="ds-stack editor-storyboard-stage">
  {error&&<div className="ds-row"><Banner kind="bad">{error}</Banner><IconButton label="Dismiss error" size="sm" onClick={()=>setError('')}><X aria-hidden="true"/></IconButton></div>}
  {step===1&&<StoryCar config={config} views={b.views} locked={!!b.shots.length} disabled={!!busy} library={library}
   onViews={(views:CarView[],label)=>void run(label,async()=>{await save({...current.current,views})})}
   onLabel={(id,label)=>edit({views:b.views.map(x=>x.id===id?{...x,label}:x)})}
/>}
  {step===2&&(b.shots.length
   ?<ShotBoard shots={b.shots} views={b.views} films={films} expert={expert} disabled={!!busy} imageCost={imageCost(1)} onShot={shotEdit}
     onMove={i=>{const shots=[...b.shots];[shots[i-1],shots[i]]=[shots[i],shots[i-1]];edit({shots})}} onImage={id=>setApprove({kind:'images',shotId:id})}
     onReview={()=>void run('Saving storyboard…',async()=>{await save();setStep(3)})}/>
   :<div className="ds-note ds-stack"><p><b>Where are we taking it?</b></p><p>Describe your idea in the settings, add an atmosphere reference if you have one, then plan the shots. Each shot gets an editable image direction and camera move; nothing is generated until you approve it.</p></div>)}
  {step===3&&<FilmCut shots={selected} films={selectedFilms} finalUrl={b.finalUrl} disabled={!!busy} quote={toRender.length?{clips:toRender.length,label:costLabel(creditInfo,price,'higgsfield')||money(price)}:null}
   onRecover={f=>void run('Recovering original request…',async()=>{const d=await api<{film:Film}>(`/api/films/${f.id}/recover`,'POST');putFilm(d.film)})}
   onRedo={id=>void run('Preparing new clip version…',async()=>{await save();await action('redo-video',id)})} onEdit={()=>setStep(2)}/>}
 </div>;
 const settings=<StorySettings board={b} edit={edit} cars={presets} car={config} count={count} onCount={setCount} expert={expert} onExpert={setExpert} showNames={showNames} music={music} onMusic={setMusic} disabled={!!busy}
  quote={toRender.length?costLabel(creditInfo,price,'higgsfield')||money(price):null}
  onCar={c=>{if(b.shots.length)return;void run('Saving car…',async()=>{await save({...current.current,vehicle:c.name,configurator:c.url,views:[]})})}}
  onPin={()=>void run('Adding atmosphere reference…',async()=>{const d=await importPinterestReference(b.pin);await save({...current.current,moodId:d.id,pin:d.pin})})}
  onMood={file=>void run('Adding reference…',async()=>{const form=new FormData();form.set('image',file);const r=await studioFetch('/api/assets',{method:'POST',body:form,signal:AbortSignal.timeout(120_000)}),d=await r.json().catch(()=>({})) as {id?:string;error?:string};if(!r.ok||!d.id)throw new Error(d.error||'The reference could not be added.');await save({...current.current,moodId:d.id})})}/>;
 const dialogText=!approve?'':approve.kind==='plan'?`One AI planning request will create ${count} editable shot prompts using your car references.${textCredits?' It costs '+textCredits+'.':''}`:approve.kind==='images'?(()=>{const n=approve.shotId?1:missing.length;return `${n} image generation request(s), at 1536 × 864. Each uses your car views and shared art direction. Existing images remain saved.${imageCredits(n)?' Together they cost '+imageCredits(n)+'.':''}`})():`Approve up to ${costLabel(creditInfo,price,'higgsfield')||money(price)} for ${toRender.length} new clips.`;
 return <WorkspaceFrame current="storyboard" bleed notices={<AccountNotices variant="ds"/>}>
  <EditorScreen tool="storyboard" onTool={t=>{const to=EDITOR_TOOLS.find(x=>x.id===t);if(to&&t!=='storyboard')router.push(to.href)}} bar={bar} stage={stage}
   history={<VersionHistory versions={versions} current={b.id||null} onPick={openStory} onCancel={assembling?()=>abort.current?.abort():undefined}/>}
   settings={settings} cost={next.cost} verb={next.verb} busy={!!busy} disabled={next.disabled} onGenerate={next.run}
   note={<>{busy?<span role="status">{busy}{assembling?` ${progress}%`:''}</span>:next.note} Keep this tab open during image generation and final assembly.</>}/>
  <Dialog open={!!approve} onClose={()=>setApprove(null)} title={!approve?'':approve.kind==='plan'?'Plan your story?':approve.kind==='images'?'Create storyboard images?':'Generate your selected clips?'}
   footer={<><Button onClick={()=>setApprove(null)}>Back</Button><Button kind="primary" icon={<Check aria-hidden="true"/>} onClick={()=>void approved()}>Approve & continue</Button></>}>
   <p>{dialogText}</p>
   <p className="ds-help">{approve?.kind!=='video'?'Credits are reserved when each request starts and released if it fails. Nothing will retry automatically if a request is interrupted.':'A higher price requires new approval. Existing ready clips will be reused. If a later clip fails, earlier submissions remain saved.'}</p>
  </Dialog>
 </WorkspaceFrame>;
}
