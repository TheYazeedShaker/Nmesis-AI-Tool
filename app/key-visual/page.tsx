"use client";
import {LiveFrame} from '@/components/editor/live-frame';
import {useState,useRef,useEffect,useCallback,useId} from 'react';
import {useRouter} from 'next/navigation';
import {Camera,Crop,Download,ExternalLink,Film,FileJson,FolderSync,ImagePlus,KeyRound,Monitor,MoreHorizontal,RefreshCw,RotateCw,Scissors,Sparkles,Trash2,Upload,Wand2,X,ZoomIn,Columns2,Info,LogIn,ChartNoAxesColumn,Share2} from 'lucide-react';
import {useBackoffPoll} from '@/lib/use-backoff-poll';
import {studioFetch} from '@/lib/studio-fetch';
import {importPinterestReference} from '@/lib/pinterest-client';
import {AccountNotices,UpsellChip,hasFeature,providerNames,useAccount} from '@/components/studio-account';
import {visualQualityLabel,visualToolLabel} from '@/lib/visual-labels';
import {plainProviderText} from '@/lib/provider-words';
import {clipboardImage,validateClipboardImage} from '@/lib/clipboard-image';
import {GoogleConnection} from '@/components/google-connection';
import {GEMINI_IMAGE_MODELS,geminiImageModel,type GoogleConnectionStatus} from '@/lib/image-models';
import {VisualComparison} from '@/components/visual-comparison';
import {ImageDownload} from '@/components/image-download';
import {ConnectionSettings,type ConnectionStatus} from '@/components/connection-settings';
import {CONFIGURATORS,generationCount,type Configurator} from '@/lib/configurators';
import {RefinementReferences,type RefinementReference} from '@/components/refinement-references';
import {AreaEditor} from '@/components/area-editor';
import {submitSmartImage} from '@/lib/smart-reference-client';
import {SmartControls,SmartPlanView,SmartReviewView} from '@/components/smart-reference';
import type {SmartPriority,SmartPlan} from '@/lib/smart-reference';
import {InspirationMatch} from '@/components/inspiration-match';
import {DropZone} from '@/components/ds/drop-zone';
import {ReferenceList} from '@/components/editor/reference-list';
import {addReference,clearPicked,referenceLimit,removeReference,updateReference,useReferenceTray,type TrayItem} from '@/lib/reference-tray';
import {openPanel} from '@/components/shell/shell-state';
import {liveConfiguratorUrl} from '@/lib/configurators';
import {toolOpen} from '@/lib/tools';
import {SharePanel} from '@/components/share/share-panel';
import {UpscalePanel} from '@/components/upscale-panel';
import {upscaleModel} from '@/lib/upscale-models';
import {OPENAI_IMAGE_MODEL,OPENAI_IMAGE_MODELS,higgsImageModel,HIGGSFIELD_IMAGE_MODELS,HIGGSFIELD_IMAGE_MODEL,imageSettings,refinementReferenceLimit,type ImageProvider,type HiggsBudget} from '@/lib/image-models';
import {costLabel,refreshCredits,useCredits} from '@/components/credits';
import {googleImageCost,openaiImageCost} from '@/lib/credits/words';
import {credits as creditWords} from '@/lib/ds/words';
import {useConfiguratorPresets,isDemoConfigurator,mergePresets} from '@/lib/configurator-presets';
import {snapshotStream,highResolutionDisplayOptions,captureSharedTab} from '@/lib/live-capture';
import {imageFromUrl,type CaptureResult} from '@/lib/capture';
import {VIEWS,localDirections,safePinterest,type View,type Direction,type Visual,type Asset,type ReferenceMode} from '@/lib/studio';
import {readReference,uploadReference} from '@/lib/reference-upload';
import {Button,IconButton,buttonClass} from '@/components/ds/button';
import {Banner} from '@/components/ds/shell';
import {State} from '@/components/ds/feedback';
import {Dialog} from '@/components/ds/dialog';
import {Field,Input,Textarea} from '@/components/ds/field';
import {Fold} from '@/components/ds/layout';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {useToast,type ToastKind} from '@/components/ds/toast';
import {OpenInEditor} from '@/components/canvas/open-in-editor';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {Advanced,EDITOR_TOOLS,EditorScreen,type GenerateBlocker} from '@/components/editor/editor-screen';
import {CarSettings,ChoiceChips,ConfiguratorStage,CostBadge,PromptSettings,QualitySettings,SaveToProject,SettingsSection,VersionHistory,type Quality,type Version} from '@/components/editor/parts';
import {iframeConfigurator} from '@/components/editor/iframe-configurator';
import type {ConfiguratorAdapter} from '@/components/editor/configurator';
import {useProject} from '@/components/editor/use-project';
import {QUALITY_SIZE,VisualsEngine,VisualsQuality,blobToDataUrl,imageCostKey,priceOf,qualityOfSize,supportsHigh,upscalePrices} from '@/components/editor/visuals-engine';
import './editor-visuals.css';

// Key visual in the one editor (Phase 3 group 2): the car (the live
// configurator, through the adapter, or a captured view) or the result in the
// canvas, the versions under it, one settings panel (car, inspiration, idea,
// art direction, quality, engine) with Generate and its cost, and the result's
// own actions in the canvas bar, each with its cost before it starts.

const DEFAULT_BRIEF='Create a premium automotive key visual using the Pinterest image for art direction, environment, lighting and atmosphere. Preserve the exact vehicle, angle, paint and trim from the configurator. Integrate the car naturally with matching perspective, grounded contact shadows and believable reflections. Remove all configurator controls and interface elements.';
type Status=ConnectionStatus;
type Rect={x:number;y:number;w:number;h:number};
type Stage='car'|'result';
type ModelContext={registerTool?:(tool:unknown,options:{signal:AbortSignal})=>unknown};
async function responseJson(r:Response):Promise<any>{const d:any=await r.json().catch(()=>({error:'The connection was interrupted. Your draft is preserved.'}));if(!r.ok)throw new Error(d.error||'Request failed.');return d}
const readImage=readReference;
// How the capture panel starts for a car: its explicit template setting (studio.car_settings).
const startView=(c:Configurator):View=>c.template==='choose-view'?VIEWS[0]:{id:'empty',src:'',title:'Capture your chosen view',finish:'Choose color and trim in the configurator'};
function downloadJson(data:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const when=(iso:string)=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})};
const higgsDraft=(r:Visual)=>['draft','quoted'].includes(r.jobStatus||''),higgsUnknown=(r:Visual)=>['unknown','submitting'].includes(r.jobStatus||''),higgsRunning=(r:Visual)=>['queued','in_progress','archiving'].includes(r.jobStatus||'');

export default function Studio(){
 const router=useRouter();const toaster=useToast();const say=useCallback((message:string,kind:ToastKind='info')=>toaster.toast({message,kind}),[toaster]);
 const project=useProject();const sourceName=`kv-source-${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
 const account=useAccount();const showProvider=providerNames(account);const w=(text:string)=>showProvider?text:plainProviderText(text);const can=(key:Parameters<typeof hasFeature>[1])=>hasFeature(account,key);
 const [configurators,setConfigurators]=useState<Configurator[]>(CONFIGURATORS);const [configurator,setConfigurator]=useState<Configurator>(CONFIGURATORS[0]);// Home sends ?car=<name> ("Start from your cars") and ?brief=<words> ("What do you want to make?").
 useConfiguratorPresets(list=>{const asked=new URLSearchParams(location.search),wanted=asked.get('car'),first=(wanted&&list.find(c=>c.name===wanted))||list[0],words=asked.get('brief');if(words)setBrief(words.slice(0,600));setConfigurators(mergePresets(list));setConfigurator(c=>isDemoConfigurator(c)||wanted?first:c);setView(v=>v.id===VIEWS[0].id||wanted?startView(first):v)});const [visualCount,setVisualCount]=useState(1);const [captureNotice,setCaptureNotice]=useState('');const [imageUrl,setImageUrl]=useState('');const [importingImage,setImportingImage]=useState(false);const [cropRatio,setCropRatio]=useState(16/9);
 const tray=useReferenceTray();const [smartPick,setSmartPick]=useState(true);const [pickCount,setPickCount]=useState(1);const [smartState,setSmartState]=useState<{kind:'ready'|'picking'|'none'|'unavailable'}>({kind:'ready'});const pickTried=useRef(new Set<string>());
 const savedViews=useRef<Record<string,View[]>>({});const [view,setView]=useState<View>(VIEWS[0]);const [mode,setMode]=useState('live');const [brief,setBrief]=useState(DEFAULT_BRIEF);const [referenceMode,setReferenceMode]=useState<ReferenceMode>('creative');const [smartPriority,setSmartPriority]=useState<SmartPriority|null>(null);const [smartPlan,setSmartPlan]=useState<SmartPlan|null>(null);const [smartStatus,setSmartStatus]=useState('');
 const [connectionOpen,setConnectionOpen]=useState(false);const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState('');const [mood,setMood]=useState<{src:string;name:string}|null>(null);const [pin,setPin]=useState('');
 const [moodUpload,setMoodUpload]=useState('');const [moodUploadError,setMoodUploadError]=useState('');const moodFile=useRef<File|null>(null);const moodAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{if(mood?.src.startsWith('blob:'))URL.revokeObjectURL(mood.src)},[mood?.src]);
 useEffect(()=>()=>{pinVersion.current++;moodAbort.current?.abort()},[]);
 useEffect(()=>{if(!moodUpload)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[moodUpload]);
 const [directions,setDirections]=useState<Direction[]>(localDirections(DEFAULT_BRIEF,VIEWS[0].title));const [direction,setDirection]=useState(0);
 const [googleConnection,setGoogleConnection]=useState<GoogleConnectionStatus|null>(null),[googleOpen,setGoogleOpen]=useState(false);const googleReady=!!(googleConnection?.connected||googleConnection?.available);
 const [provider,setProvider]=useState<ImageProvider>('openai');const [imageModel,setImageModel]=useState<string>(OPENAI_IMAGE_MODEL);const [higgsConnection,setHiggsConnection]=useState<HiggsBudget|null>(null);const higgsConnected=!!(higgsConnection?.connected||higgsConnection?.available);const creditInfo=useCredits();const [cleaningEmpty,setCleaningEmpty]=useState(false);const [size,setSize]=useState('2048x1152');const [results,setResults]=useState<Visual[]>([]);const [busy,setBusy]=useState(false);const [completed,setCompleted]=useState(0);const [jobCount,setJobCount]=useState(3);const [historyError,setHistoryError]=useState('');const [historyLoading,setHistoryLoading]=useState(false);
 const [captureOpen,setCaptureOpen]=useState(false);const [capturing,setCapturing]=useState(false);const [cropSrc,setCropSrc]=useState('');const [crop,setCrop]=useState<Rect>({x:0,y:0,w:1,h:1});const [captureTitle,setCaptureTitle]=useState('Custom view');const [captureFinish,setCaptureFinish]=useState('Selected configurator finish');
 const [trashOpen,setTrashOpen]=useState(false),[deletedVisuals,setDeletedVisuals]=useState<Visual[]>([]),[trashLoading,setTrashLoading]=useState(false),[trashError,setTrashError]=useState(''),[managingVisual,setManagingVisual]=useState('');
 // The editor: what the canvas shows, the version in it, and the result's own dialogs.
 const [stage,setStage]=useState<Stage>('car');const [currentId,setCurrentId]=useState<string|null>(null);const [refineOpen,setRefineOpen]=useState(false);const [compareOpen,setCompareOpen]=useState<false|'references'|'original'>(false);
 const [creatingFilm,setCreatingFilm]=useState(false);const [shareOpen,setShareOpen]=useState(false);const [refinement,setRefinement]=useState('');const [refinementImages,setRefinementImages]=useState<RefinementReference[]>([]);const [readingReferences,setReadingReferences]=useState(false);const refinementOwner=useRef('');const imagePollIndex=useRef(0);const [upscaleOpen,setUpscaleOpen]=useState(false);const [areaOpen,setAreaOpen]=useState(false);const [areaBusy,setAreaBusy]=useState(false);
 const iframeRef=useRef<HTMLIFrameElement>(null);const uploadRef=useRef<HTMLInputElement>(null);const cropImage=useRef<HTMLImageElement>(null);const dragStart=useRef<{x:number;y:number}|null>(null);const assets=useRef(new Map<string,Asset>());const originals=useRef(new Map<string,string>());const pendingAssets=useRef(new Map<string,Promise<Asset>>());const working=useRef(false);
 useEffect(()=>{setSmartPlan(null)},[view.src,mood?.src,brief,provider,imageModel,size,smartPriority]);
 const current=useRef({view,brief,results,configurator,visualCount});current.current={view,brief,results,configurator,visualCount};
 const captureVersion=useRef(0);
 // The configurator is reached only through the adapter (components/editor/configurator.ts).
 const adapter=useRef<ConfiguratorAdapter|null>(null);
 useEffect(()=>{const a=iframeConfigurator(()=>iframeRef.current,()=>current.current.configurator.url);adapter.current=a;return()=>{a.dispose();if(adapter.current===a)adapter.current=null}},[]);
 const [importingPin,setImportingPin]=useState(false);const [pinError,setPinError]=useState('');const [preparing,setPreparing]=useState(false);const [sharing,setSharing]=useState(false);const [askingToShare,setAskingToShare]=useState(false);
 const pinVersion=useRef(0);const pinRequest=useRef<{url:string;promise:Promise<{src:string;name:string}>}|null>(null);const pinAbort=useRef<AbortController|null>(null);const streamRef=useRef<MediaStream|null>(null);const handleRef=useRef('');const preparingRef=useRef(false);
 function stopSharing(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setSharing(false)}
 useEffect(()=>{handleRef.current=crypto.randomUUID();const media=navigator.mediaDevices as MediaDevices&{setCaptureHandleConfig?:(v:unknown)=>void};try{media?.setCaptureHandleConfig?.({handle:handleRef.current,exposeOrigin:true,permittedOrigins:[location.origin]})}catch{/* Optional: without a capture handle the shared tab is still cropped by position. */}const stop=()=>streamRef.current?.getTracks().forEach(t=>t.stop());window.addEventListener('pagehide',stop);return()=>{stop();pinAbort.current?.abort();window.removeEventListener('pagehide',stop)}},[]);
 function updatePin(value:string){moodAbort.current?.abort();moodFile.current=null;setMoodUpload('');setMoodUploadError('');pinVersion.current++;pinAbort.current?.abort();pinRequest.current=null;setPin(value);setMood(null);setPinError('');setImportingPin(false)}
 function importPin(value:string){
  const url=value.trim();if(pinRequest.current?.url===url)return pinRequest.current.promise;
  const version=pinVersion.current;const controller=new AbortController();pinAbort.current=controller;setImportingPin(true);setPinError('');
  const promise=(async()=>{try{const d=await importPinterestReference(url,controller.signal);const result={src:d.url as string,name:d.name as string};if(version!==pinVersion.current)throw new Error('The Pinterest link changed. Generate again with the new pin.');setMood(result);return result}catch(e){if(version===pinVersion.current&&(e as Error).name!=='AbortError'){setPinError((e as Error).message);pinRequest.current=null}throw e}finally{if(version===pinVersion.current)setImportingPin(false)}})();pinRequest.current={url,promise};return promise;
 }
 // The import's own failure shows as pinError; this early start only saves time.
 useEffect(()=>{if(!pin.trim()||!status?.storage)return;const timer=setTimeout(()=>{void importPin(pin).catch(()=>undefined)},650);return()=>clearTimeout(timer)},[pin,status?.storage]);
 async function autoGenerate(){
  if(preparingRef.current||working.current||moodUpload||moodUploadError||cropSrc)return;
  if(provider==='openai'&&!status?.generation){setConnectionOpen(true);return}if(provider==='google'&&!googleReady){if(googleConnection?.ownKeys)setGoogleOpen(true);else setError(w('Nano Banana isn’t available in your Studio right now. Ask Nmesis.'));return}if(provider==='higgsfield'&&!higgsConnected){setError(w('Connect Higgsfield in Film studio first.'));return}if(!pin.trim()&&!mood&&!tray.length){setError('Add a reference first: a photo that shows the look you want.');return}
  preparingRef.current=true;setPreparing(true);setError('');const version=captureVersion.current;
  try{
   let chosen=view;
   if(mode==='live'){
    // The configurator's own picture first, through the adapter (it answers within half a second when the configurator has no capture connection), then this tab, shared once.
    const shot=await adapter.current?.capture().catch(()=>null);
    let source:CaptureResult;
    if(shot)source={image:await blobToDataUrl(shot.blob),angle:shot.state.view,finish:shot.state.colour};
    else{
     if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('This browser can’t take the picture by itself. Choose Captured view and add a picture of the car.');
     let stream=streamRef.current;
     if(!stream||stream.getVideoTracks()[0]?.readyState!=='live'){
      // The browser is about to ask to share this tab: say why, only now.
      setAskingToShare(true);
      try{stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions())}finally{setAskingToShare(false)}
      streamRef.current=stream;setSharing(true);
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(streamRef.current===stream){streamRef.current=null;setSharing(false)}},{once:true});
     }
     source={image:await snapshotStream(stream,iframeRef.current,handleRef.current)};
     if(stream.getVideoTracks()[0]?.readyState!=='live'){streamRef.current=null;setSharing(false)}
    }
    if(version!==captureVersion.current)throw new Error('The vehicle changed. Choose its angle and generate again.');
    chosen={id:crypto.randomUUID(),src:source.image,title:source.angle||'Your chosen angle',finish:source.finish||'Exact color and trim shown in the capture'};
    setView(chosen);savedViews.current[configurator.id]=[chosen,...(savedViews.current[configurator.id]||[])].slice(0,6);
   }
   if(!chosen.src)throw new Error('Choose a car reference first.');
   const moods=pin.trim()?[await importPin(pin)]:tray.length?await Promise.all(tray.map(resolveReference)):mood?[mood]:[];if(!moods.length)throw new Error('Add a reference first: a photo that shows the look you want.');
   if(version!==captureVersion.current)throw new Error('The vehicle changed. Choose its angle and generate again.');
   await generate(undefined,{view:chosen,mood:moods[0],moods});
  }catch(e){stopSharing();const name=(e as Error).name;setError(name==='NotAllowedError'?'Sharing was cancelled. Click Generate again and choose this tab, so the Studio can take the picture.':name==='InvalidStateError'?'Bring this studio tab to the front, then click Generate again.':(e as Error).message)}
  finally{preparingRef.current=false;setPreparing(false)}
 }
 // In live mode the configurator must be on screen to be captured: show it first.
 function startGenerate(){if(mode==='live'&&stage!=='car'){setStage('car');setAreaOpen(false);requestAnimationFrame(()=>requestAnimationFrame(()=>void autoGenerate()));return}void autoGenerate()}

 function chooseConfigurator(c:Configurator){stopSharing();clearPicked();captureVersion.current++;setConfigurator(c);setView(savedViews.current[c.id]?.[0]||startView(c));setMode('live');setStage('car');setCaptureTitle('Custom view');setCaptureFinish('Selected configurator finish');setCropSrc('');setCaptureOpen(false);setCaptureNotice('');setImageUrl('');setError('');setDirections(localDirections(brief,'selected vehicle view'));setDirection(0)}
 const refreshStatus=useCallback(async()=>{try{const r=await studioFetch('/api/status');if(r.status===401){setStatus({generation:false,storage:false,signedOut:true});return}setStatus(await responseJson(r))}catch{setError('Studio connection is unavailable. Your draft is still here.')}},[]);
 const refreshGoogle=useCallback(async()=>{try{setGoogleConnection(await responseJson(await studioFetch('/api/google/connection')))}catch{setGoogleConnection(null)}},[]);
 useEffect(()=>{void refreshGoogle()},[refreshGoogle]);
 const refreshResults=useCallback(async()=>{setHistoryLoading(true);try{const data=await responseJson(await studioFetch('/api/visuals'));setResults(data.visuals);setHistoryError(data.warning||'')}catch(e){setHistoryError((e as Error).message)}finally{setHistoryLoading(false)}},[]);
 useEffect(()=>{void refreshStatus()},[refreshStatus]);
 useBackoffPoll(async()=>{await refreshStatus();return 'same'},{base:10000,max:60000,enabled:!!status?.sponsorPending});
 useEffect(()=>{if(status?.storage)void refreshResults()},[status?.storage,refreshResults]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(working.current||preparingRef.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[]);
 function chooseView(v:View){setView(v);setMode('capture');setStage('car');setDirections(localDirections(brief,v.title));setDirection(0)}
 useEffect(()=>{
  const context=(document as Document&{modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
  const tools=[
   {name:'read_studio_brief',description:'Read the selected vehicle view, campaign brief, and saved visual statuses.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>({vehicle:current.current.configurator.name,configurator:current.current.configurator.url,visualCount:current.current.visualCount,hasProductReference:!!current.current.view.src,view:current.current.view.title,finish:current.current.view.finish,brief:current.current.brief,visuals:current.current.results.map(v=>({id:v.id,title:v.title,status:v.status}))})},
   {name:'stage_studio_brief',description:'Update the visible campaign brief and optionally choose a supplied capture. Does not generate or spend credits.',inputSchema:{type:'object',properties:{brief:{type:'string',minLength:8,maxLength:2000},viewId:{type:'string',enum:VIEWS.map(v=>v.id)}},required:['brief'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:{brief?:unknown;viewId?:unknown})=>{if(typeof input?.brief!=='string'||input.brief.trim().length<8||input.brief.length>2000)throw new Error('Brief must contain 8–2000 characters.');const viewId=typeof input.viewId==='string'?input.viewId:undefined;if(input.viewId!==undefined&&!VIEWS.some(v=>v.id===viewId))throw new Error('Unknown capture.');if(viewId&&current.current.configurator.id!=='s08')throw new Error('These supplied captures belong to a different preset vehicle; capture the currently selected vehicle instead.');const v=VIEWS.find(v=>v.id===viewId)||current.current.view;const text=input.brief;setBrief(text);setView(v);setMode('capture');setDirections(localDirections(text,v.title));setDirection(0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{staged:true,view:v.title,brief:text,generationStarted:false}}}
  ];
  // A tool the browser refuses is simply not offered; the screen works without it.
  tools.forEach(tool=>Promise.resolve(context.registerTool?.(tool,{signal:lifecycle.signal})).catch(()=>undefined));return()=>lifecycle.abort();
 },[]);
 async function resolveReference(item:TrayItem):Promise<{src:string;name:string}>{
  if(item.assetId)return {src:'/api/assets/'+item.assetId,name:item.name};
  if(item.provider==='unsplash'){
   const d=await responseJson(await studioFetch('/api/references/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:item.provider,id:item.key.slice(item.provider.length+1)}),signal:AbortSignal.timeout(45_000)}));
   updateReference(item.key,{assetId:d.id});return {src:'/api/assets/'+d.id,name:item.name};
  }
  return {src:(await ensureAsset(item.src)).url,name:item.name};
 }
 async function ensureAsset(src:string):Promise<Asset>{
  const known=assets.current.get(src);if(known)return known;if(src.startsWith('/api/assets/'))return{id:src.split('?')[0].split('/').pop()!,url:src};
  const pending=pendingAssets.current.get(src);if(pending)return pending;
  const work=(async()=>{const blob=await (await studioFetch(src)).blob();const originalSrc=originals.current.get(src);const original=originalSrc?await(await studioFetch(originalSrc)).blob():blob;const data=await uploadReference(blob,original);assets.current.set(src,data);return data})();
  pendingAssets.current.set(src,work);try{return await work}finally{pendingAssets.current.delete(src)}
 }
 const selected=(currentId&&results.find(r=>r.id===currentId))||null;const shown=selected||results[0]||null;
 async function createLaunchFilm(){if(!shown||creatingFilm)return;setCreatingFilm(true);try{const source=await ensureAsset(shown.src);const d=await responseJson(await studioFetch('/api/films',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:source.id,title:shown.title,vehicle:shown.vehicle||configurator.name})}));router.push('/films?id='+d.film.id)}catch(e){say((e as Error).message,'bad')}finally{setCreatingFilm(false)}}
 async function receiveMood(file?:File){
  if(!file)return;try{validateClipboardImage(file)}catch(e){setError((e as Error).message);return}
  const version=pinVersion.current,controller=new AbortController();moodAbort.current=controller;moodFile.current=file;
  // Display the local file immediately, before reading, encoding or sending any bytes.
  setMoodUpload('Preparing image…');setError('');
  try{
   if(!status?.storage)throw new Error('Image storage is not connected yet. Wait a moment, then retry.');
   const asset=await uploadReference(file,file,{signal:controller.signal,upload:true,onStage:stage=>{if(version===pinVersion.current)setMoodUpload(stage)}});
   if(version!==pinVersion.current)return;
   setMood(null);moodFile.current=null;
   if(!addReference({key:'upload:'+asset.id,src:asset.url,thumb:asset.url+'?thumb=1',name:file.name.slice(0,100)||'Your upload',provider:'upload',assetId:asset.id}))say('You have the most references you can use. Remove one first.','bad');
   else say('Reference added. Original saved.','ok');
  }catch(e){if(version===pinVersion.current&&(e as Error).name!=='AbortError')setMoodUploadError((e as Error).name==='TimeoutError'?'Upload took too long. Your preview is still here—retry saving it.':(e as Error).message)}
  finally{if(version===pinVersion.current)setMoodUpload('')}
 }
 // A car picture to review and crop; the drop zone shows its problems under itself.
 async function readCapture(file:File){const version=captureVersion.current;const src=await readImage(file);if(version!==captureVersion.current)return;setCropSrc(src);setCrop({x:0,y:0,w:1,h:1});setCaptureOpen(false)}
 async function receiveCapture(file?:File){if(!file)return;try{await readCapture(file)}catch(e){setError((e as Error).message)}}
 async function screenCapture(){setCapturing(true);setCaptureOpen(false);setError('');let stream:MediaStream|undefined;try{
  if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Screen capture is unavailable in this browser. Upload a screenshot of your chosen view instead.');
  stream=await navigator.mediaDevices.getDisplayMedia(highResolutionDisplayOptions());
  const image=await captureSharedTab(stream,iframeRef.current,handleRef.current);setCropSrc(image);setCrop({x:0,y:0,w:1,h:1});setCaptureOpen(false);
 }catch(e){setCaptureOpen(true);const name=(e as Error).name;if(name==='NotAllowedError')say('Capture cancelled. Your selected view is unchanged.');else setCaptureNotice(name==='InvalidStateError'?'Bring the studio tab to the front, then try capturing again.':'The browser could not capture this view. Try opening the configurator in a separate tab, or upload a screenshot.')}finally{stream?.getTracks().forEach(t=>t.stop());setCapturing(false)}}
 function reviewCapture(result:CaptureResult){setCropSrc(result.image);setCaptureTitle(typeof result.angle==='string'?result.angle.slice(0,100):'Custom view');setCaptureFinish(typeof result.finish==='string'?result.finish.slice(0,120):'Selected configurator finish');setCrop({x:0,y:0,w:1,h:1});setCaptureOpen(false)}
 // Use this view: the configurator's picture through the adapter; when it has none, the other ways in.
 async function captureView(){if(mode!=='live'){setCaptureNotice('');setCaptureOpen(true);return}const a=adapter.current;if(!a){setCaptureNotice('This configurator has no direct capture connection yet. Capture its tab, or import the current image URL from Inspect.');setCaptureOpen(true);return}setCapturing(true);setCaptureNotice('');const version=captureVersion.current;
 try{const shot=await a.capture();const image=await blobToDataUrl(shot.blob);if(version!==captureVersion.current)return;reviewCapture({image,angle:shot.state.view,finish:shot.state.colour});say('Current configurator image extracted. Review it before use.','ok')}catch{if(version===captureVersion.current){setCaptureNotice('This configurator has no direct capture connection yet. Capture its tab, or import the current image URL from Inspect.');setCaptureOpen(true)}}finally{setCapturing(false)}}
 async function importImage(){setImportingImage(true);setCaptureNotice('');const version=captureVersion.current;try{const file=await imageFromUrl(imageUrl);if(version===captureVersion.current)await receiveCapture(file)}catch(e){setCaptureNotice((e as Error).message)}finally{setImportingImage(false)}}
 async function applyCrop(){const img=cropImage.current;if(capturing||!img||!img.complete||!img.naturalWidth||crop.w<.02||crop.h<.02){say('Select a larger area of the image.','bad');return}setCapturing(true);const version=captureVersion.current;try{const c=document.createElement('canvas');const w=img.naturalWidth*crop.w,h=img.naturalHeight*crop.h;c.width=Math.round(w);c.height=Math.round(h);c.getContext('2d')!.drawImage(img,img.naturalWidth*crop.x,img.naturalHeight*crop.y,w,h,0,0,c.width,c.height);const src=c.toDataURL('image/png');originals.current.set(src,cropSrc);const asset=status?.storage?await ensureAsset(src):null;if(version!==captureVersion.current)return;const captured={id:crypto.randomUUID(),src:asset?.url||src,title:captureTitle.trim()||'Custom view',finish:captureFinish.trim()||'Selected configurator finish'};savedViews.current[configurator.id]=[captured,...(savedViews.current[configurator.id]||[])].slice(0,6);chooseView(captured);setCropSrc('');say('Car reference saved. Your original screenshot is kept.','ok')}catch(e){say((e as Error).message,'bad')}finally{setCapturing(false)}}
 function cropPoint(e:React.PointerEvent<HTMLDivElement>){const b=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))}}
 async function generate(parent?:Visual,prepared?:{view:View;mood:{src:string;name:string};moods?:{src:string;name:string}[]}){const productView=prepared?.view||view;const moodReference=prepared?.mood||mood;if(working.current)return;if(!parent&&!productView.src){setError('Add a picture of the car before generating.');return}if(provider==='google'&&!googleReady){if(googleConnection?.ownKeys)setGoogleOpen(true);else setError(w('Nano Banana isn’t available in your Studio right now. Ask Nmesis.'));return}if(!(provider==='openai'?status?.generation:provider==='google'?googleConnection?.connected:higgsConnected)){setError(provider==='openai'?w('Connect OpenAI to generate with ChatGPT.'):w('Connect Higgsfield in Film studio to use this generator.'));return}if(!parent&&!moodReference){setError('Add an inspiration image or Pinterest pin link first.');return}if(parent&&!refinement.trim()){say('Describe what you would like to change.','bad');return}if(parent&&(readingReferences||refinementImages.length>refinementReferenceLimit(provider,imageModel))){say('Wait for your references to load, or choose a model that supports them.','bad');return}
 working.current=true;setBusy(true);setCompleted(0);setError('');const originalRefinement=refinement;const originalReferences=parent?[...refinementImages]:[];const count=generationCount(visualCount,!!parent);setJobCount(count);
 try{
  const product=parent?.sourceId?{id:parent.sourceId}:await ensureAsset(productView.src);const inspiration=parent?.moodId?{id:parent.moodId}:await ensureAsset(moodReference!.src);
  const refinementReferenceIds:string[]=[];for(const reference of originalReferences)refinementReferenceIds.push((await ensureAsset(reference.src)).id);
  const generationBrief=!parent&&smartPriority&&provider!=='higgsfield'?(brief===DEFAULT_BRIEF?'Create a premium automotive photograph using the supplied car and inspiration.':brief):referenceMode==='match-inspiration'?(parent?.brief||(brief===DEFAULT_BRIEF?'Match the inspiration faithfully.':brief)):parent?.brief||(brief===DEFAULT_BRIEF?brief:DEFAULT_BRIEF+' Additional direction: '+brief);
  // With several references and no smart prompt (which plans one picture), visual i takes reference i (in turn).
  const moodIds=parent||(smartPriority&&provider!=='higgsfield')||!prepared?.moods||prepared.moods.length<2?[inspiration.id]:await Promise.all(prepared.moods.map(async m=>(await ensureAsset(m.src)).id));
  let planned:SmartPlan|undefined;if(!parent&&smartPriority&&provider!=='higgsfield'){setSmartStatus('Analyzing references and preparing your prompt…');const d=await responseJson(await studioFetch('/api/smart-prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:product.id,moodId:inspiration.id,brief:generationBrief,provider,model:imageModel,size,priority:smartPriority})}));planned=d.plan;setSmartPlan(d.plan);setSmartStatus('Generating with your tailored prompt…')}
  const requests=Array.from({length:count},(_,i)=>({id:crypto.randomUUID(),title:parent?parent.title+' · refined':configurator.name+' · '+String(i+1).padStart(2,'0'),src:'',status:'pending' as const,createdAt:new Date().toISOString()}));
  // The new versions go to the front of the history; the first is shown while it is made.
  setResults(prev=>[...requests,...prev]);setCurrentId(requests[0].id);setStage('result');setAreaOpen(false);
  await Promise.all(requests.map(async(job,i)=>{try{const payload={...job,smartPlanId:planned?.id,vehicle:parent?.vehicle||configurator.name,configurator:parent?.configurator||configurator.url,sourceId:product.id,moodId:moodIds[i%moodIds.length],referenceMode,brief:generationBrief,finish:parent?.finish||productView.finish,angle:parent?.angle||productView.title,scene:brief,variant:i,size,provider,generate:provider==='higgsfield',model:imageModel,pin:parent?.pin||safePinterest(pin)||'',parentId:parent?.id,refinementReferenceIds:parent?refinementReferenceIds:undefined,refinement:parent?originalRefinement:undefined};const data=provider!=='higgsfield'?await submitSmartImage(provider==='google'?'/api/google/generate':'/api/generate',payload):await responseJson(await studioFetch(provider==='higgsfield'?'/api/image-jobs':provider==='google'?'/api/google/generate':'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));setResults(prev=>prev.map(x=>x.id===job.id?data.visual:x));if(planned&&data.visual.status==='ready'){setSmartStatus('Image saved. Checking car details and inspiration…');try{const checked=await responseJson(await studioFetch('/api/smart-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id})}));setResults(prev=>prev.map(x=>x.id===job.id?checked.visual:x))}catch(e){setResults(prev=>prev.map(x=>x.id===job.id?{...x,smartReview:{status:'failed',error:(e as Error).message}}:x))}}}catch(e){setResults(prev=>prev.map(x=>x.id===job.id?{...x,status:'failed',error:(e as Error).message}:x))}finally{setCompleted(n=>n+1)}}));
 }catch(e){setError((e as Error).message)}finally{working.current=false;setBusy(false);setSmartStatus('');refreshCredits()}}
 function applyAsInspiration(visual:Visual){
  if(working.current||busy||areaBusy||preparing||readingReferences||managingVisual)return;
  const assetId=/^\/api\/assets\/([a-z0-9-]{8,80})/.exec(visual.src)?.[1];
  if(!assetId||!addReference({key:'visual:'+visual.id,src:visual.src,name:visual.title||'Your visual',provider:'upload',assetId})){say('Remove a reference first, then use this one.','bad');return}
  setAreaOpen(false);setUpscaleOpen(false);setRefineOpen(false);setStage('car');setError('');
  say('Added to your references. Choose your car and generate when ready.','ok');
  requestAnimationFrame(()=>document.getElementById('kv-references-title')?.scrollIntoView({behavior:'smooth',block:'start'}));
 }
 async function openDeleted(){setTrashOpen(true);setTrashLoading(true);setTrashError('');try{const d=await responseJson(await studioFetch('/api/visuals?deleted=1'));setDeletedVisuals(d.visuals);setTrashError(d.warning||'')}catch(e){setTrashError((e as Error).message)}finally{setTrashLoading(false)}}
 async function restoreDeleted(visual:Visual){if(working.current)return;working.current=true;setManagingVisual(visual.id);setTrashError('');try{await responseJson(await studioFetch('/api/visuals/'+visual.id,{method:'POST'}));setDeletedVisuals(prev=>prev.filter(v=>v.id!==visual.id));await refreshResults();say('Image restored.','ok')}catch(e){setTrashError((e as Error).message);say((e as Error).message,'bad')}finally{working.current=false;setManagingVisual('')}}
 async function removeVisual(visual:Visual){if(working.current||areaBusy||readingReferences||preparing||creatingFilm)return;working.current=true;setManagingVisual(visual.id);try{await responseJson(await studioFetch('/api/visuals/'+visual.id,{method:'DELETE'}));setResults(prev=>prev.filter(v=>v.id!==visual.id));if(currentId===visual.id){setCurrentId(null);setAreaOpen(false)}if(shown?.id===visual.id){setAreaOpen(false);setRefineOpen(false);setUpscaleOpen(false)}toaster.toast({message:'Moved to Deleted images.',kind:'ok',action:{label:'Undo',run:()=>void restoreDeleted(visual)}})}catch(e){say((e as Error).message,'bad')}finally{working.current=false;setManagingVisual('')}}
 async function cleanEmpty(){if(working.current)return;working.current=true;setCleaningEmpty(true);try{const d=await responseJson(await studioFetch('/api/visuals/cleanup',{method:'POST'}));await refreshResults();say(d.removed?d.removed+' empty entries removed. Finished images are preserved.':'No empty drafts to remove.','ok')}catch(e){setHistoryError((e as Error).message)}finally{working.current=false;setCleaningEmpty(false)}}
 function exportBrief(){downloadJson({vehicle:configurator.name,configurator:configurator.url,visualCount,view:{title:view.title,finish:view.finish},brief,direction:directions[direction],pinterest:safePinterest(pin),output:size,provider,model:imageModel,referenceMode,referenceStatus:mood?'Inspiration image selected':'No inspiration image',notes:referenceMode==='match-inspiration'?'The car capture defines product identity. Inspiration defines camera, lens, composition, light and mood.':'The car capture defines product identity and angle. Inspiration defines atmosphere.'},'nmesis-creative-brief.json')}

 const engineFallback=!showProvider&&provider!=='openai'&&!!status?.generation&&(provider==='google'?!googleReady:!higgsConnected);
 useEffect(()=>{if(engineFallback&&!busy)chooseImageProvider('openai')/* eslint-disable-line react-hooks/exhaustive-deps -- chooseImageProvider is a plain function of this render */},[engineFallback,busy]);
 const generationReady=provider==='openai'?!!status?.generation:provider==='google'?googleReady&&(!googleConnection?.connected||googleConnection.models.includes(imageModel)):higgsConnected;
 function chooseImageProvider(next:ImageProvider){const nextModel=next==='openai'?OPENAI_IMAGE_MODEL:next==='google'?GEMINI_IMAGE_MODELS[0].id:HIGGSFIELD_IMAGE_MODELS[0].id;setProvider(next);setImageModel(nextModel);try{imageSettings(next,size,nextModel)}catch{setSize('2048x1152')}}
 function chooseImageModel(next:string){setImageModel(next);try{imageSettings(provider,size,next)}catch{setSize('2048x1152')}}
 const putImage=(visual:Visual)=>setResults(prev=>[visual,...prev.filter(x=>x.id!==visual.id)]);
 async function imageAction(visual:Visual,action:string){if(working.current)return;working.current=true;setBusy(true);setError('');try{const data=await responseJson(await studioFetch(`/api/image-jobs/${visual.id}/${action}`,{method:'POST'}));putImage(data.visual)}catch(e){setError((e as Error).message)}finally{working.current=false;setBusy(false)}}
 const refreshHiggsConnection=useCallback(async()=>{try{setHiggsConnection(await responseJson(await studioFetch('/api/video-connection')))}catch{setHiggsConnection(null)}},[]);
 useEffect(()=>{void refreshHiggsConnection();const onFocus=()=>void refreshHiggsConnection();window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus)},[refreshHiggsConnection]);
 // Only the person who started a job checks on it, and only while they may change work: a viewer, staff viewing a client or an ended plan would be refused (check:ui).
 const mayChange=!!account&&account.workspace.open&&account.role!=='viewer'&&!account.viewingAs;
 const imageWaiting=(v:Visual)=>v.provider==='higgsfield'&&higgsRunning(v)&&v.mine!==false&&mayChange;
 useBackoffPoll(async()=>{if(working.current)return 'same';const pending=results.filter(imageWaiting);if(!pending.length)return 'idle';const visual=pending[imagePollIndex.current++%pending.length];working.current=true;try{const d=await responseJson(await studioFetch(`/api/image-jobs/${visual.id}/refresh`,{method:'POST'}));putImage(d.visual);return d.visual.jobStatus!==visual.jobStatus?'changed':'same'}catch(e){setHistoryError((e as Error).message);return 'same'}finally{working.current=false}},{base:8000,max:48000,enabled:results.some(imageWaiting)});
 // Read saved status even after the original request/tab disconnects. Never resubmit.
 useEffect(()=>{
  const pending=results.filter(v=>v.status==='pending'&&v.provider!=='higgsfield');if(!pending.length)return;
  let canceled=false,checking=false,index=0;const controller=new AbortController();
  const check=async()=>{if(document.hidden||checking)return;checking=true;const visual=pending[index++%pending.length];
   try{const r=await studioFetch('/api/visuals/'+encodeURIComponent(visual.id),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!r.ok)return;const d=await r.json() as {visual?:Visual},updated=d.visual;if(!canceled&&updated?.id===visual.id&&['ready','failed'].includes(updated.status))setResults(prev=>prev.map(v=>v.id===visual.id&&v.status==='pending'?updated:v))}catch(e){if(!canceled&&(e as Error).name!=='AbortError')setHistoryError('Could not check this render yet. Refresh the gallery to check again.')} finally{checking=false}
  };
  const timer=setInterval(()=>void check(),15000);window.addEventListener('focus',check);
  return()=>{canceled=true;clearInterval(timer);controller.abort();window.removeEventListener('focus',check)};
 },[results]);

 // ── The editor ──────────────────────────────────────────────────────────
 // Picking a version shows it and, like opening it did, takes its engine for a refinement.
 function adoptVersion(r:Visual){
  if(refinementOwner.current!==r.id){setRefinement('');setRefinementImages([]);refinementOwner.current=r.id}
  setReferenceMode(r.referenceMode||'creative');setProvider(r.provider||'openai');setImageModel(r.provider==='google'?(r.model||GEMINI_IMAGE_MODELS[0].id):r.provider==='higgsfield'?(r.model||HIGGSFIELD_IMAGE_MODEL):(OPENAI_IMAGE_MODELS.find(m=>m.id===r.model)?.id||OPENAI_IMAGE_MODEL));setSize(r.upscale?'2048x1152':r.size||'2048x1152');
 }
 function pickVersion(id:string){
  if(areaBusy)return;const r=results.find(v=>v.id===id);if(!r)return;
  if(r.lineup){router.push('/lineup?visual='+r.id);return}
  setCurrentId(r.id);setStage('result');setUpscaleOpen(false);setAreaOpen(false);setCompareOpen(false);
  if(r.status==='ready')adoptVersion(r);
 }
 function openRefine(){if(!shown)return;if(refinementOwner.current!==shown.id)adoptVersion(shown);setAreaOpen(false);setRefineOpen(true)}
 const lock=busy||preparing;
 const unit=priceOf(creditInfo,imageCostKey(provider,imageModel,size),provider);
 const cost=unit===null?null:unit*visualCount;
 const billing=creditInfo?.billing[provider];
 const costNote=provider==='higgsfield'&&unit===null?w('Higgsfield prices it in credits as it starts'):billing==='own key'||billing==='internal'?costLabel(creditInfo,cost,provider):'';
 const qualityCosts:Record<Quality,number|null>={standard:null,high:null};
 for(const q of ['standard','high'] as Quality[]){const n=priceOf(creditInfo,imageCostKey(provider,imageModel,QUALITY_SIZE[q]),provider);qualityCosts[q]=n===null?null:n*visualCount}
 const highAllowed=supportsHigh(provider,imageModel);
 const chooseQuality=(q:Quality)=>{if(!lock)setSize(QUALITY_SIZE[q])};
 const ready=shown?.status==='ready'&&!shown.example?shown:null;
 const areaProvider=ready?.provider==='google'?'google':'openai';
 const areaCost=priceOf(creditInfo,areaProvider==='google'?googleImageCost(ready?.model&&GEMINI_IMAGE_MODELS.some(m=>m.id===ready.model)?ready.model:GEMINI_IMAGE_MODELS[0].id,'2048x1152'):openaiImageCost('2048x1152'),areaProvider);
 const upscaleCosts=upscalePrices(creditInfo,account?.maxEdge||7680);const upscaleFrom=upscaleCosts.find(c=>c.credits!==null)?.credits??null;
 const refineUnit=unit;
 const resultBusy=busy||areaBusy||readingReferences||!!managingVisual||creatingFilm;
 const meta=(n:number|null,from?:boolean)=>n===null?null:<span className="ds-btn-meta">· {from?'from ':''}{creditWords(n)}</span>;
 const versions:Version[]=results.map((r,i)=>({id:r.id,n:results.length-i,src:r.status==='ready'?r.src:undefined,quality:visualQualityLabel(r)==='High detail'?'high':'standard',used:typeof r.credits==='number'?r.credits:null,at:when(r.createdAt),label:r.title,
  status:r.status==='ready'?'ready':r.status==='failed'?'failed':'working',
  stage:r.provider==='higgsfield'&&higgsDraft(r)?'Not started':r.provider==='higgsfield'&&higgsUnknown(r)?'Check original request':r.mine===false?'Started by someone in your company':'Creating your visual'}));
 const generateVerb=moodUpload?'Saving inspiration…':preparing&&!busy?(mode==='live'?'Taking the picture…':'Preparing your visual…'):busy?completed+' / '+jobCount+' completed':'Generate '+visualCount+' key visual'+(visualCount===1?'':'s');
 const madeWith=(r:Visual)=>r.provider==='higgsfield'?'Higgsfield · '+higgsImageModel(r.model).label:r.provider==='google'?'Google · '+geminiImageModel(r.model).label:(OPENAI_IMAGE_MODELS.find(m=>m.id===r.model)?'OpenAI · '+OPENAI_IMAGE_MODELS.find(m=>m.id===r.model)!.label:'OpenAI');
 // The result's line names the tool and, at most, a plain quality (F-050); "Made with …" only for staff and companies with their own keys.
 const resultLine=(r:Visual)=><>
  {r.upscale?<span className="ds-muted">Upscale · {visualQualityLabel(r)}{showProvider?<> · {r.upscale.method==='topaz-api'?'API upscale':'Imported upscale'} · {upscaleModel(r.upscale.modelId).label}</>:null}</span>
   :<span className="ds-muted">{visualToolLabel(r)} · {visualQualityLabel(r)}{r.width?<> · {r.width} × {r.height}</>:null}</span>}
  {r.provider&&showProvider&&<span className="ds-muted">Made with {madeWith(r)}</span>}
 </>;
 const placeholder=(r:Visual)=>r.provider==='higgsfield'
  ?<State kind={r.status==='failed'?'error':'empty'} icon={<Sparkles aria-hidden="true"/>} title={higgsDraft(r)?'Not started':higgsUnknown(r)?'Check original request':r.status==='failed'?'Generation could not finish':'Creating your visual'}
    actions={<>{higgsDraft(r)&&<Button disabled={busy} onClick={()=>void imageAction(r,'generate')}>Generate image</Button>}{higgsUnknown(r)&&<Button disabled={busy} onClick={()=>void imageAction(r,'recover')}>Recover original request</Button>}{higgsRunning(r)&&<Button disabled={busy} icon={<RefreshCw aria-hidden="true"/>} onClick={()=>void imageAction(r,'refresh')}>Refresh image</Button>}</>}>
    {r.error?w(r.error):higgsDraft(r)?'This draft has not generated an image.':'Your request is saved. Open the Studio within seven days so the finished image can be saved to your library.'}</State>
  :r.status==='pending'?<State kind="empty" icon={<RotateCw className="ds-spin-icon" aria-hidden="true"/>} title="Creating your visual"><span role="status">{r.mine===false?<>Someone in your company started this visual.<br/>It appears here when it is ready.</>:<>Lighting, materials and atmosphere.<br/>Keep this page open while it renders.</>}</span></State>
  :<State kind="error" title={r.jobStatus==='interrupted'?'Generation interrupted':'Generation could not finish'}>{r.error?w(r.error):'Try again after checking your connection.'}</State>;

 const carStage=<>
  {mode==='live'&&<div className="editor-visuals-car" hidden={stage!=='car'}>
   <ConfiguratorStage frame={0} frames={0} onFrame={()=>undefined} onCapture={()=>void captureView()} capturing={capturing}>
    <LiveFrame frameRef={iframeRef} url={configurator.url} name={configurator.name} visible={stage==='car'} badge={!preparing}/>
   </ConfiguratorStage>
  </div>}
  {mode!=='live'&&stage==='car'&&(view.src
   ?<figure className="editor-result">{/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    <img crossOrigin="anonymous" src={view.src} alt={view.title}/><figcaption><span>Product reference · {view.title}</span><span className="ds-muted">{view.finish}</span></figcaption></figure>
   :<State kind="empty" icon={<Camera aria-hidden="true"/>} title={`Choose your view of ${configurator.name}`} actions={<Button kind="primary" onClick={()=>{setMode('live');setStage('car')}}>Open live configurator</Button>}>Open the live configurator and turn the car to the angle you want.</State>)}
 </>;
 const resultStage=stage==='result'&&<div className="editor-visuals-result">
  {!shown?<State kind="empty" icon={<ImagePlus aria-hidden="true"/>} title={historyLoading?'Loading your versions…':'No versions yet'}>Choose your car and inspiration, then Generate.</State>
   :areaOpen&&ready?<AreaEditor key={ready.id} visual={ready} connected={!!status?.generation} onBusy={v=>{setAreaBusy(v);working.current=v}} onSaved={v=>{putImage(v);setCurrentId(v.id);setProvider(v.provider||'openai');setImageModel(v.model||OPENAI_IMAGE_MODEL);setRefinementImages([]);setRefinement('');refinementOwner.current=v.id;setAreaOpen(false);setCompareOpen(false);say('Area edit saved. Everything outside the selection is preserved.','ok')}}/>
   :shown.status==='ready'?<figure className="editor-result">{/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    <OpenInEditor visualId={shown.id} title={shown.title}><img crossOrigin="anonymous" src={shown.src} alt={shown.title}/></OpenInEditor>
    <figcaption><span className="ds-truncate" title={shown.title}><b>{shown.title}</b></span>{resultLine(shown)}<CostBadge credits={typeof shown.credits==='number'?shown.credits:null} used/></figcaption>
    <SmartReviewView review={shown.areaEdit?undefined:shown.smartReview}/>
   </figure>
   :placeholder(shown)}
 </div>;

 const resultActions=ready&&<>
  {can('studio.area_edit')?<Button size="sm" kind="quiet" aria-pressed={areaOpen} icon={<Scissors aria-hidden="true"/>} disabled={areaBusy||readingReferences||busy} onClick={()=>{setAreaOpen(!areaOpen);setUpscaleOpen(false)}}>Area edit {meta(areaCost)}</Button>:<span className="ds-row">Area edit <UpsellChip feature="studio.area_edit" account={account}/></span>}
  {can('studio.upscale')?<Button size="sm" kind="quiet" icon={<ZoomIn aria-hidden="true"/>} disabled={areaBusy||readingReferences||busy} onClick={()=>{setUpscaleOpen(true);setAreaOpen(false)}}>Upscale {meta(upscaleFrom,true)}</Button>:<span className="ds-row">Upscale <UpsellChip feature="studio.upscale" account={account}/></span>}
  <Button size="sm" kind="quiet" icon={<Wand2 aria-hidden="true"/>} disabled={busy||areaBusy} onClick={openRefine}>Refine {meta(refineUnit)}</Button>
  {/* Film is Coming soon (lib/tools.ts): its button shows again when the tool opens. */}
  {toolOpen('films')&&<Button size="sm" kind="quiet" icon={<Film aria-hidden="true"/>} busy={creatingFilm} disabled={areaBusy||readingReferences||busy} onClick={()=>void createLaunchFilm()}>Launch film</Button>}
  <ImageDownload key={ready.id} src={ready.src} name={ready.title} label="Download" className={buttonClass({kind:'quiet',size:'sm'})}/>
 </>;
 const bar=<>
  <h1 className="ds-sr-only">Key visual</h1>
  <div className="ds-segmented editor-stage-switch" role="group" aria-label="Show">
   <button type="button" aria-pressed={stage==='car'} disabled={areaBusy} onClick={()=>{setStage('car');setAreaOpen(false)}}>Your car</button>
   <button type="button" aria-pressed={stage==='result'} disabled={areaBusy} onClick={()=>setStage('result')}>Result</button>
  </div>
  <SaveToProject folders={project.folders} folderId={ready?project.folderOf('visual',ready.id):null} disabled={!ready||!project.ready||!!ready.lineup} onSave={f=>{if(ready)void project.save('visual',ready.id,f)}}/>
  <span className="editor-bar-actions">
   {stage==='result'&&resultActions}
   {stage==='result'&&ready&&<Button size="sm" kind="primary" icon={<Share2 aria-hidden="true"/>} onClick={()=>setShareOpen(true)}>Share</Button>}
   <Menu label="More actions" trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
    {ready&&<MenuItem icon={<Share2/>} onSelect={()=>setShareOpen(true)}>Share</MenuItem>}
    {ready&&<MenuItem icon={<Columns2/>} onSelect={()=>setCompareOpen('references')}>Compare with references</MenuItem>}
    {ready&&<MenuItem icon={<ImagePlus/>} disabled={resultBusy||preparing} onSelect={()=>applyAsInspiration(ready)}>Use as inspiration</MenuItem>}
    {ready&&ready.sourceId&&ready.moodId&&!ready.lineup&&can('studio.smart_reference')&&<MenuItem icon={<Sparkles/>} disabled={busy||areaBusy} onSelect={()=>router.push('/nano-lab?visual='+ready.id)}>Smart reference lab</MenuItem>}
    {ready&&<MenuItem icon={<FileJson/>} onSelect={()=>downloadJson(ready,'nmesis-visual-details.json')}>Image details</MenuItem>}
    {ready&&<MenuSeparator/>}
    {status?.storage&&<MenuItem icon={<RefreshCw/>} disabled={historyLoading} onSelect={()=>void refreshResults()}>Refresh versions</MenuItem>}
    {status?.storage&&<MenuItem icon={<Trash2/>} disabled={!!managingVisual||busy} onSelect={()=>void openDeleted()}>Deleted images</MenuItem>}
    {status?.storage&&<MenuItem icon={<FolderSync/>} disabled={busy||cleaningEmpty} onSelect={()=>void cleanEmpty()}>{cleaningEmpty?'Removing empty drafts…':'Remove empty drafts'}</MenuItem>}
    <MenuItem icon={<Download/>} onSelect={exportBrief}>Export brief</MenuItem>
    {creditInfo?.usage&&<MenuSeparator/>}
    {creditInfo?.usage&&<MenuItem icon={<ChartNoAxesColumn/>} onSelect={()=>router.push('/usage')}>Usage</MenuItem>}
    {ready&&<><MenuSeparator/><MenuItem icon={<Trash2/>} danger disabled={resultBusy||preparing} onSelect={()=>void removeVisual(ready)}>{managingVisual===ready.id?'Deleting…':'Delete image'}</MenuItem></>}
   </Menu>
  </span>
 </>;

 const saved=savedViews.current[configurator.id]||[];
 // Staff and companies with their own keys: the engine, its model and exact size, and who pays for it.
 const paidBy=provider==='google'?(googleConnection?.connected?'Uses your company’s Google key: 0 credits.':googleReady?'Nano Banana is provided by Nmesis; each image costs credits.':'')
  :provider==='higgsfield'?(higgsConnection?.connected?'Uses your company’s Higgsfield key: 0 credits.':higgsConnected?'Higgsfield is provided by Nmesis; each image costs credits.':'')
  :status?.generation?(status.personalKey?'Uses your company’s OpenAI key: 0 credits.':'Provided by Nmesis; each image costs credits.'):'';
 // Why Generate cannot run here (the account and credits are checked by the editor).
 const blocked:GenerateBlocker|null=status?.signedOut?{title:'Sign in to generate',body:'Your draft stays here.'}
  :!status?null
  :!generationReady?(provider==='google'&&googleConnection?.connected&&!googleConnection.models.includes(imageModel)?{title:w('This Nano Banana model isn’t available on your key'),body:'Choose another model under Advanced, or reconnect to check access.'}
   :status.ownKeys&&provider==='openai'?{title:w('Connect your OpenAI key to generate'),body:'Your company uses its own keys.',action:<Button size="sm" icon={<KeyRound aria-hidden="true"/>} onClick={()=>setConnectionOpen(true)}>Connect</Button>}
   :{title:'AI generation isn’t set up for your Studio yet',body:'Ask Nmesis to set it up.'})
  :!status.storage?{title:'Saving pictures isn’t available right now',body:'Ask Nmesis.'}
  :null;
 // The settings, one column, for someone new: Car and view, References,
 // Quality, How many, what it will use, then everything else under Advanced (closed).
 const quality=highAllowed&&!lock
  ?<QualitySettings value={qualityOfSize(size)} onChange={chooseQuality} costs={qualityCosts}/>
  :<VisualsQuality value={qualityOfSize(size)} onChange={chooseQuality} costs={qualityCosts} highAllowed={highAllowed} disabled={lock}/>;
 const costLine=billing==='own key'||billing==='internal'?(costLabel(creditInfo,cost,provider)||'No credits are used.')
  :cost===null?(costNote||'The credits show here once the price is known.')
  :<>This will use <b>{creditWords(cost)}</b>{visualCount>1&&unit!==null?<> ({visualCount} × {creditWords(unit)})</>:null}.</>;
 const yourIdea=brief===DEFAULT_BRIEF?'':brief;
 const advancedSummary=[yourIdea?'Your idea: '+(yourIdea.length>40?yourIdea.slice(0,40)+'…':yourIdea):'Your idea',smartPriority?'smart prompt':'art direction',showProvider?'image generator, model and size':''].filter(Boolean).join(' · ');
 const settings=<>
  <CarSettings title="Car and view" cars={configurators.map(c=>c.name)} car={configurator.name} onCar={name=>{const c=configurators.find(x=>x.name===name);if(c&&!busy&&!capturing&&!preparing)chooseConfigurator(c)}} options={{colours:[],trims:[],views:[],frames:0}} state={{}} onColour={()=>undefined} onTrim={()=>undefined} onView={()=>undefined} controlsInEditor={false} idPrefix="kv-car">
   <div className="ds-contents" onPaste={e=>{const file=clipboardImage(e.clipboardData);if(file){e.preventDefault();if(!busy&&!preparing&&!capturing&&!cropSrc)void receiveCapture(file)}}}>
    <ChoiceChips legend="View" name={sourceName} choices={[{id:'live',name:'Live configurator'},{id:'capture',name:'Your picture'}]} value={mode} onChange={v=>{if(!lock){setMode(v);setStage('car')}}}/>
    <p className="ds-help">{mode==='live'?'Turn the car in the configurator. Generate takes a picture of that view.':view.src?'Your picture of the car · '+view.title:'Add a picture of the car.'}</p>
    {mode==='capture'&&<DropZone name="car picture" label="Drop, paste or upload a picture of the car" hint="PNG, JPEG or WebP · up to 40 MB. You can crop it next."
     value={view.src||null} valueName={view.title} valueAlt={view.title} valueMeta={view.finish}
     onFile={readCapture} disabled={lock||capturing||!!cropSrc}/>}
    {mode==='capture'&&saved.length>0&&<div className="ds-stack"><span className="ds-label">Saved angles <span className="ds-muted">{saved.length}</span></span>
     <ul className="editor-visuals-angles" aria-label="Saved angles">{saved.map(v=><li key={v.id}><button type="button" className="editor-visuals-angle" aria-pressed={view.id===v.id&&mode==='capture'} disabled={lock} onClick={()=>chooseView(v)}><span className="editor-visuals-thumb">{/* eslint-disable-next-line @next/next/no-img-element -- private media */}
<img crossOrigin="anonymous" src={v.src} alt="" loading="lazy"/></span><span className="ds-truncate">{v.title}</span></button></li>)}</ul></div>}
    {mode==='live'&&<div className="editor-row">
     <Button size="sm" kind="quiet" icon={<Monitor aria-hidden="true"/>} disabled={capturing||lock} onClick={()=>{setCaptureNotice('');setCaptureOpen(true)}}>More ways to add the car</Button>
     {sharing&&<Button size="sm" kind="quiet" onClick={stopSharing}>Stop sharing</Button>}
    </div>}
   </div>
  </CarSettings>
  <div className="ds-contents" onPaste={e=>{const file=clipboardImage(e.clipboardData);if(file){e.preventDefault();if(!lock)void receiveMood(file)}}}>
   <ReferenceList id="kv-references-title" title="References" limit={referenceLimit('visuals')} help="Pictures that show the look you want: the place, the light, the framing."
    items={tray} onAdd={()=>openPanel('references')} onFile={file=>void receiveMood(file)} onRemove={removeReference}
    busy={moodUpload||(importingPin?'Finding the largest Pinterest image…':'')} error={moodUploadError||pinError||undefined}
    smart={{on:smartPick,onChange:on=>{setSmartPick(on);if(!on)clearPicked()},count:pickCount,onCount:n=>{setPickCount(n);clearPicked()},state:smartState}} disabled={lock}/>
  </div>
  {quality}
  <SettingsSection title="How many" id="kv-count-title">
   <div className="ds-segmented editor-count" role="group" aria-label="How many visuals">{[1,3].map(n=><button key={n} type="button" aria-pressed={visualCount===n} disabled={lock} onClick={()=>setVisualCount(n)}>{n} {n===1?'visual':'visuals'}</button>)}</div>
  </SettingsSection>
  <p className="editor-cost-line" aria-live="polite">{costLine}</p>
  <Fold name="kv-advanced" title="Advanced" summary={advancedSummary} className="editor-advanced">
   <div className="ds-stack">
    <PromptSettings label="Your idea (optional)" value={yourIdea} onChange={v=>setBrief(v.trim()?v:DEFAULT_BRIEF)} placeholder="Golden hour, a quiet city street, warm reflections…" max={2000} inspiration={false}/>
    <SettingsSection title="Art direction" id="kv-direction-title">
     {provider!=='higgsfield'&&(can('studio.smart_reference')?<SmartControls value={smartPriority} onChange={setSmartPriority} disabled={lock}/>:<p className="ds-help">Smart references <UpsellChip feature="studio.smart_reference" account={account}/></p>)}
     <InspirationMatch nanoBanana={provider==='google'} value={referenceMode} onChange={setReferenceMode} disabled={lock||provider!=='higgsfield'&&!!smartPriority}/>
     {smartStatus&&<p className="ds-help" role="status">{smartStatus}</p>}{smartPlan&&<SmartPlanView plan={smartPlan}/>}
    </SettingsSection>
    {can('studio.pinterest')&&<Field label="Pinterest pin link" help="Uses the pin’s picture as your main reference.">
     <Input type="url" value={pin} disabled={lock} onChange={e=>updatePin(e.target.value)} placeholder="https://www.pinterest.com/pin/…"/>
    </Field>}
    {showProvider&&<SettingsSection title="Image generator" id="kv-engine-title"><VisualsEngine provider={provider} model={imageModel} size={size} onProvider={chooseImageProvider} onModel={chooseImageModel} onSize={setSize} disabled={lock}/>{paidBy&&<p className="ds-help">{paidBy}</p>}</SettingsSection>}
   </div>
  </Fold>
 </>;
 // Smart pick: with no reference added by hand, photos of the car from the
 // photo library (lib/references), as many as asked; once per car and number.
 const handAdded=tray.some(t=>!t.picked),pickedNow=tray.filter(t=>t.picked).length;
 useEffect(()=>{
  const car=liveConfiguratorUrl(configurator)?configurator.name:'';
  const wanted=car+'|'+pickCount;
  // Only for someone who can make work now: the photo library is not part of a closed or read-only Studio.
  if(!smartPick||!car||!mayChange||handAdded||pickedNow>0||pickTried.current.has(wanted))return;
  pickTried.current.add(wanted);let live=true;
  void (async()=>{
   setSmartState({kind:'picking'});
   try{
    const r=await studioFetch('/api/references?q='+encodeURIComponent(car)+'&page=1',{signal:AbortSignal.timeout(15_000)});
    const d=await r.json().catch(()=>({})) as {available?:boolean;photos?:{id:string;provider:'unsplash';thumb:string;src:string;alt?:string;credit?:TrayItem['credit']}[]};
    if(!live)return;
    if(d.available===false){setSmartState({kind:'unavailable'});return}
    if(!r.ok){setSmartState({kind:'ready'});return}
    const photos=(d.photos||[]).slice(0,pickCount);
    for(const p of photos)addReference({key:p.provider+':'+p.id,src:p.src,thumb:p.thumb,name:p.alt||'Photo of '+car,provider:p.provider,credit:p.credit,picked:true});
    setSmartState({kind:photos.length?'ready':'none'});
   }catch(e){if(live){setSmartState({kind:'ready'});console.warn('[smart pick] no photos',e instanceof Error?e.message:e)}}
  })();
  return()=>{live=false};
 },[smartPick,pickCount,configurator,handAdded,pickedNow,mayChange]);

 const notices=<>
  <AccountNotices variant="ds"/>
  {askingToShare&&<Banner icon={<Monitor aria-hidden="true"/>}>Your browser will ask to share this tab once, so the Studio can take the picture. Choose this tab and Share.</Banner>}
  {error&&<Banner kind="bad" icon={<Info aria-hidden="true"/>}><span role="alert">{error}</span> <IconButton label="Dismiss message" size="sm" onClick={()=>setError('')}><X aria-hidden="true"/></IconButton></Banner>}
  {status?.signedOut&&<Banner icon={<LogIn aria-hidden="true"/>}>Sign in to save references and generate visuals. <a className="ds-link" href="/signin" target="_top">Sign in</a></Banner>}
 </>;

 return <WorkspaceFrame current="visuals" bleed notices={notices}>
  <EditorScreen tool="visuals" loading={!status} onTool={t=>{const href=EDITOR_TOOLS.find(x=>x.id===t)?.href;if(href&&t!=='visuals')router.push(href)}}
   bar={bar}
   stage={<>{carStage}{resultStage}</>}
   history={<>{historyError&&<p className="ds-error" role="alert">{historyError}</p>}<VersionHistory versions={versions} current={stage==='result'?shown?.id||null:null} onPick={pickVersion}/></>}
   settings={settings}
   cost={cost} verb={generateVerb} busy={lock} onGenerate={startGenerate} blocked={blocked} payer={provider}
   disabled={!status||!!moodUpload||!!cropSrc||(!pin.trim()&&!mood&&!tray.length)}
   note={mode==='live'?'Takes a picture of the car as it is shown, adds your references and generates.':'Uses your picture of the car and your references.'}/>

  <Dialog open={trashOpen} onClose={()=>{if(!managingVisual)setTrashOpen(false)}} title="Deleted images">
   <p className="ds-help">Restore any image to your library. Original files stay available to existing edits and references.</p>
   {trashLoading?<p role="status">Loading deleted images…</p>:!deletedVisuals.length?<p>No deleted images.</p>
    :<ul className="editor-visuals-list" aria-label="Deleted images">{deletedVisuals.map(v=><li key={v.id}><span className="editor-visuals-thumb">{v.status==='ready'&&<>{/* eslint-disable-next-line @next/next/no-img-element -- private media */}
<img crossOrigin="anonymous" src={v.src} alt=""/></>}</span><b className="ds-truncate" title={v.title}>{v.title}</b><Button size="sm" busy={managingVisual===v.id} disabled={!!managingVisual&&managingVisual!==v.id} onClick={()=>void restoreDeleted(v)}>Restore image</Button></li>)}</ul>}
   {trashError&&<p role="alert" className="ds-error">{trashError}</p>}
  </Dialog>
  {ready&&<SharePanel open={shareOpen} onClose={()=>setShareOpen(false)} item={{kind:'visual',id:ready.id,title:ready.title,src:ready.src,mine:ready.mine!==false}}/>}
  <GoogleConnection open={googleOpen} onOpenChange={setGoogleOpen} status={googleConnection} onUpdate={refreshGoogle}/>
  <ConnectionSettings open={connectionOpen} onOpenChange={setConnectionOpen} status={status} onUpdate={refreshStatus}/>
  <input hidden ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload a car reference" onChange={e=>{void receiveCapture(e.target.files?.[0]);e.target.value=''}}/>

  <Dialog open={captureOpen} onClose={()=>setCaptureOpen(false)} title="Capture your chosen view">
   <div className="ds-stack">
    <p className="ds-help">Take a picture of {configurator.name} as it is shown. Your browser asks which tab to share: choose the one with the car. Sharing stops as soon as the picture is taken, and you check the crop before it is used.</p>
    {captureNotice&&<p className="ds-note" role="status">{captureNotice}</p>}
    <div className="editor-row"><Button kind="primary" busy={capturing} icon={<Monitor aria-hidden="true"/>} onClick={()=>void screenCapture()}>{capturing?'Capturing…':'Capture a browser tab'}</Button><Button icon={<Upload aria-hidden="true"/>} onClick={()=>uploadRef.current?.click()}>Upload a screenshot</Button></div>
    <p className="ds-help">For a larger image, open the configurator in its own browser tab, set your angle there, then capture that tab. You’ll review the image before using it.</p>
    <a className="ds-link" href={configurator.url} target="_blank" rel="noreferrer">Open the configurator <ExternalLink aria-hidden="true"/></a>
    <Fold name="kv-capture-url" title="Use an image URL from Inspect" summary="For a frame the configurator loads">
     <div className="ds-stack"><p className="ds-help">Copy the current vehicle image’s URL from the configurator’s Inspect panel. Panorama source files show the whole sphere; use a screenshot for the exact interior angle.</p>
      <Field label="Current image URL"><Input type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://…/current-frame.webp"/></Field>
      <div><Button busy={importingImage} disabled={!imageUrl.trim()} onClick={()=>void importImage()}>{importingImage?'Importing…':'Import this image'}</Button></div></div>
    </Fold>
    <Fold name="kv-capture-connector" title="Enable direct image capture" summary="For configurators you manage">
     <div className="ds-stack"><p className="ds-help">Add the capture connector to a configurator you manage. Then “Use this view” can read its current image or rendered view without a screenshot.</p>
      <a className="ds-link" href="/integration/nmesis-capture.js" download>Download capture connector</a></div>
    </Fold>
   </div>
  </Dialog>

  <Dialog open={!!cropSrc} onClose={()=>setCropSrc('')} title="Review your car reference" wide
   footer={<Button kind="primary" busy={capturing} icon={<Crop aria-hidden="true"/>} onClick={()=>void applyCrop()}>{capturing?'Saving original and preparing reference…':'Use this car reference'}</Button>}>
   <div className="ds-stack">
    <p className="ds-help">This is the image the generator will receive. Check the car, angle and color. Drag to crop out any controls or page content. No generation has started.</p>
    <div className="editor-visuals-crop" style={{aspectRatio:cropRatio,width:`min(100%, ${52*cropRatio}vh)`}} onPointerDown={e=>{const p=cropPoint(e);dragStart.current=p;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!dragStart.current)return;const p=cropPoint(e),s=dragStart.current;setCrop({x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)})}} onPointerUp={()=>{dragStart.current=null}}>
     {/* eslint-disable-next-line @next/next/no-img-element -- a local capture being cropped */}
     <img crossOrigin="anonymous" ref={cropImage} src={cropSrc||undefined} alt="Capture to crop" onLoad={e=>setCropRatio(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)} draggable={false}/>
     <div className="editor-visuals-crop-selection" style={{left:crop.x*100+'%',top:crop.y*100+'%',width:crop.w*100+'%',height:crop.h*100+'%'}}/>
    </div>
    <div className="editor-visuals-fields">{(['x','y','w','h'] as const).map((key,i)=><Field key={key} label={['Left','Top','Width','Height'][i]+' %'}><Input type="number" min="0" max="100" value={Math.round(crop[key]*100)} onChange={e=>{const n=Math.max(0,Math.min(1,Number(e.target.value)/100));setCrop(c=>{const a={...c,[key]:n};return{x:a.x,y:a.y,w:Math.min(a.w,1-a.x),h:Math.min(a.h,1-a.y)}})}}/></Field>)}</div>
    <div className="editor-visuals-fields"><Field label="View name"><Input value={captureTitle} onChange={e=>setCaptureTitle(e.target.value)} maxLength={100}/></Field><Field label="Color / trim notes"><Input value={captureFinish} onChange={e=>setCaptureFinish(e.target.value)} maxLength={120}/></Field></div>
   </div>
  </Dialog>

  <Dialog open={upscaleOpen&&!!ready} onClose={()=>setUpscaleOpen(false)} title="Upscale" wide>
   {ready&&<div className="ds-stack">
    <p className="ds-help">{upscaleCosts.map(c=>c.credits===null?null:`${c.label} · ${creditWords(c.credits)}`).filter(Boolean).join(' · ')||'The cost shows before the upscale starts.'}</p>
    <UpscalePanel key={ready.id} visual={ready} onSaved={v=>{putImage(v);setCurrentId(v.id);setRefinementImages([]);setRefinement('');refinementOwner.current=v.id;setUpscaleOpen(false);setCompareOpen('original');say('Enlarged version saved. Your original is preserved.','ok')}}/>
   </div>}
  </Dialog>

  <Dialog open={!!compareOpen&&!!ready} onClose={()=>setCompareOpen(false)} title="Compare" wide>
   {ready&&<VisualComparison key={ready.id+String(compareOpen)} visual={ready} showOriginal={compareOpen==='original'}/>}
  </Dialog>

  <Dialog open={refineOpen&&!!ready} onClose={()=>{if(!readingReferences)setRefineOpen(false)}} title="Refine this version" wide
   footer={<Button kind="primary" icon={<Sparkles aria-hidden="true"/>} busy={busy} disabled={readingReferences||refinementImages.length>refinementReferenceLimit(provider,imageModel)||!generationReady||!refinement.trim()} onClick={()=>{const parent=ready;if(!parent)return;setRefineOpen(false);void generate(parent)}}>Create refined version{meta(refineUnit)}</Button>}>
   {ready&&<div className="ds-stack">
    <InspirationMatch refining nanoBanana={provider==='google'} value={referenceMode} onChange={setReferenceMode} disabled={busy}/>
    {can('studio.area_edit')&&<div><Button size="sm" icon={<Scissors aria-hidden="true"/>} disabled={busy||readingReferences} onClick={()=>{setRefineOpen(false);setStage('result');setAreaOpen(true);setUpscaleOpen(false)}}>Paint an area to refine {meta(areaCost)}</Button></div>}
    <RefinementReferences value={refinementImages} onChange={setRefinementImages} disabled={busy} limit={refinementReferenceLimit(provider,imageModel)} onPreparingChange={setReadingReferences}/>
    <Field label="What would you like to change?" count={{value:refinement.length,max:1000}}><Textarea rows={4} placeholder={refinementImages.length?'Use Reference 1 for the wheel details and Reference 2 for the material finish. Keep everything else unchanged…':referenceMode==='match-inspiration'?'Match the reference shadows more closely, correct wheel details…':'Warmer sunlight, simpler scenery, softer reflections…'} value={refinement} onChange={e=>setRefinement(e.target.value)} maxLength={1000}/></Field>
    <Advanced name="visuals-refine"><VisualsEngine provider={provider} model={imageModel} size={size} onProvider={chooseImageProvider} onModel={chooseImageModel} onSize={setSize} disabled={busy}/></Advanced>
    {provider==='google'&&googleConnection?.ownKeys&&<div><Button size="sm" kind="quiet" icon={<KeyRound aria-hidden="true"/>} onClick={()=>{setRefineOpen(false);setGoogleOpen(true)}}>{googleConnection?.connected?'Manage Google connection':'Connect your Google key'}</Button></div>}
    <p className="ds-help">Edits the version displayed in the canvas, preserving previous changes. Saves a new version and keeps this one.</p>
   </div>}
  </Dialog>
 </WorkspaceFrame>;
}
