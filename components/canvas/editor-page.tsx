'use client';
import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowDown,ArrowLeft,ArrowUp,BringToFront,Check,ClockArrowDown,Clock,Copy,Download,ImageOff,Info,Monitor,Redo2,Save,SendToBack,Share2,Trash2,Undo2,Users} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Field,Input,Select,Textarea} from '@/components/ds/field';
import {Loading,State} from '@/components/ds/feedback';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {useToast} from '@/components/ds/toast';
import {AccountNotices,useAccount} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {SharePanel} from '@/components/share/share-panel';
import {closePanel,setCanvasSink} from '@/components/shell/shell-state';
import {useBrandKit} from '@/components/brand/brand-kit';
import {cleanHex} from '@/lib/brand-kit';
import {can} from '@/lib/accounts/can';
import {studioFetch} from '@/lib/studio-fetch';
import {dateTime} from '@/lib/ds/words';
import type {Visual} from '@/lib/studio';
import {assetSrc,createDoc,drawOrder,duplicateOffset,edit,exportPixelRatio,pageIndex,readDoc,TEXT_LINE_HEIGHT,type CanvasAdd,type DrawnLayer,type EditorDoc,type TextLayer} from '@/lib/editor/doc';
import {apply,canRedo,canUndo,end,redo,startHistory,undo,type History} from '@/lib/editor/history';
import {exportWithFonts,fallbackNotice,fontChoices,knownFont} from '@/lib/editor/fonts';
import {editFileName,EDITS_PATH} from '@/lib/editor/save';
import {zipStored} from '@/lib/editor/zip';
import {answerProblem,CANT_OPEN,linkProblem,type CantOpen} from '@/lib/editor/cant-open';
import {viewerHref} from '@/lib/work-ref';
import {loadImage} from './images';
import {loadCanvasFont,useCanvasFonts} from './fonts';
import {TextEditor} from './text-editor';
import {editorHref} from './open-in-editor';
import {PageStrip} from './page-strip';
import {SaveStatus} from './save-status';
import {VersionHistory,type Version} from './version-history';
import {deviceCopy,useAutosave} from './use-autosave';
import {editedBy,usePresence} from './use-presence';
import type {StageHandle} from './stage';

// The canvas editor (/editor?visual=<id>): a generated picture on a canvas,
// with the shell's Brand, Elements, Text and Uploads panels adding to it.
// The design is format v2 (lib/editor/doc.ts): one or more pages of the same
// size, layers by id, pictures by storage key. Every change goes through one
// history of immer patches (lib/editor/history.ts): one undo step per gesture.
// Changes are autosaved as a working draft about 2 s after the last one, with
// the status always in the canvas bar; Save makes a new version of the picture
// (page 1, with every page kept beside it) and never overwrites anything.
// Duplicate: Ctrl/Cmd+D or Alt-drag (a layer), "Duplicate page", and
// "Duplicate design" ("Copy of …" in the same folder; the editor switches to
// the copy in place). Someone else editing the design opens it read only with
// "Edit anyway". Phones get a note instead: the editor needs a larger screen.
const CanvasStage=dynamic(()=>import('./stage'),{ssr:false,loading:()=><Loading label="Opening the canvas"><div className="canvas-skeleton"/></Loading>});

function useNarrow(){
 return React.useSyncExternalStore(l=>{const m=window.matchMedia('(max-width: 767px)');m.addEventListener('change',l);return()=>m.removeEventListener('change',l)},()=>window.matchMedia('(max-width: 767px)').matches,()=>false);
}
function useReducedMotion(){
 return React.useSyncExternalStore(l=>{const m=window.matchMedia('(prefers-reduced-motion: reduce)');m.addEventListener('change',l);return()=>m.removeEventListener('change',l)},()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,()=>true);
}
/** The space the canvas may use, measured. */
function useSize(ref:React.RefObject<HTMLElement|null>){
 const [size,setSize]=React.useState({width:0,height:0});
 React.useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>setSize({width:Math.floor(e.contentRect.width),height:Math.floor(e.contentRect.height)}));ro.observe(el);return()=>ro.disconnect()},[ref]);
 return size;
}
const nextPaint=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,30))));

/** A picture saved from the editor brings its design; `draft` is the working draft (autosave), newer than both. `layersLost`: it has layers, but they didn't load. */
type Ready={kind:'ready';visual:Visual;design:EditorDoc|null;draft:EditorDoc|null;layersLost?:boolean;
 /** The draft is this device's copy, not yet on the Studio (made offline): autosave sends it at once. */unsent?:boolean};
type Loaded={kind:'loading'}|{kind:'error';problem:CantOpen;detail?:string}|Ready;
/** The design kept beside a picture saved from the editor (edits/<id>.json, any format, read as v2): null when it has none. */
async function loadDesign(id:string):Promise<{design:EditorDoc|null;lost:boolean}>{
 try{
  const r=await studioFetch('/api/edits/'+id,{signal:AbortSignal.timeout(20_000)});
  // 404: no layers kept (an older save), or the original underneath is gone: the picture opens plain.
  if(r.status===404)return {design:null,lost:false};
  const d=await r.json().catch(()=>({})) as {design?:unknown};
  const read=r.ok?readDoc(d.design):null;
  if(read?.ok)return {design:read.doc,lost:false};
  console.warn('[editor] the layers did not open',{status:r.status});
 }catch(e){console.warn('[editor] the layers did not open',{reason:e instanceof Error?e.name:'unknown'})}
 return {design:null,lost:true};
}
/** The working draft (autosave) for this picture, or this device's newer unsent copy; null when there is none. */
async function loadDraft(id:string,mayEdit:boolean):Promise<{doc:EditorDoc|null;unsent:boolean}>{
 if(!mayEdit)return {doc:null,unsent:false};
 let server:{doc:EditorDoc;at:number}|null=null;
 try{
  const r=await studioFetch(`/api/edits/${id}/draft`,{signal:AbortSignal.timeout(15_000)});
  if(r.ok){const d=await r.json().catch(()=>({})) as {draft?:{doc?:unknown;savedAt?:number}};const read=readDoc(d.draft?.doc);if(read.ok)server={doc:read.doc,at:Number(d.draft?.savedAt)||0}}
  else if(r.status!==404)console.warn('[editor] the draft did not open',{status:r.status});
 }catch(e){console.warn('[editor] the draft did not open',{reason:e instanceof Error?e.name:'unknown'})}
 const local=deviceCopy(id,server?.at??null),read=local?readDoc(local):null;
 return read?.ok?{doc:read.doc,unsent:true}:{doc:server?.doc??null,unsent:false};
}
/** The picture's answer said why it can't be edited (lib/editor/cant-open.ts). */
class Refused extends Error{problem:CantOpen;constructor(problem:CantOpen,detail?:string){super(detail||CANT_OPEN[problem].body);this.problem=problem}}
/** The picture at ?visual=<id>; `attempt` asks again (Try again). `skip`: the editor already moved there itself (a copy made in place). */
function useVisual(id:string|null,attempt:number,mayEdit:boolean,skip:boolean):Loaded{
 const [state,setState]=React.useState<{key:string;loaded:Loaded}>({key:'',loaded:{kind:'loading'}});
 const bad=linkProblem(id),key=(id||'')+'#'+attempt;
 React.useEffect(()=>{
  if(bad||!id||skip)return;let live=true;
  studioFetch('/api/visuals/'+id,{signal:AbortSignal.timeout(20_000)})
   .then(async r=>{const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};const problem=answerProblem(r.status,d.visual);if(problem)throw new Refused(problem,problem==='other'?d.error:undefined);return d.visual as Visual})
   .then(async v=>{
    // An older picture may not say its size: read it from the picture itself.
    if(!(v.width&&v.height)){const img=await loadImage(v.src);v={...v,width:img.naturalWidth,height:img.naturalHeight}}
    // Saved from the editor: reopen the original underneath with its layers. Any other picture opens plain.
    const [{design,lost},draft]=await Promise.all([v.edit?loadDesign(v.id):Promise.resolve({design:null,lost:false}),loadDraft(v.id,mayEdit)]);
    if(live)setState({key,loaded:{kind:'ready',visual:v,design,draft:draft.doc,unsent:draft.unsent,layersLost:lost}});
   })
   .catch((e:unknown)=>{
    if(!live)return;
    const problem=e instanceof Refused?e.problem:'other';
    // Which case, never the address: enough to tell a bad link from a missing picture in the logs.
    console.warn('[editor] the picture did not open',{problem,reason:e instanceof Error?e.name:'unknown'});
    setState({key,loaded:{kind:'error',problem,detail:e instanceof Refused&&problem==='other'?e.message:undefined}});
   });
  return()=>{live=false};
 },[id,bad,key,mayEdit,skip]);
 if(bad)return {kind:'error',problem:bad};
 return state.key===key?state.loaded:{kind:'loading'};
}

/** Why the editor can't open, in its own words, with the way on (Projects; Try again when a load failed). */
function CantOpenState({problem,detail,onRetry}:{problem:CantOpen;detail?:string;onRetry:()=>void}){
 const words=CANT_OPEN[problem],calm=problem==='pending'||problem==='missing';
 return <div className="canvas-editor canvas-editor-state">
  <State kind={calm?'empty':'error'} icon={problem==='pending'?<Clock/>:problem==='missing'?<ImageOff/>:undefined} title={words.title}
   actions={<>{problem==='other'&&<Button kind="primary" onClick={onRetry}>Try again</Button>}<Link className="ds-btn" href="/library">Go to Projects</Link></>}>
   {detail||words.body}
  </State>
 </div>;
}

export function EditorPage(){
 const params=useSearchParams(),id=params.get('visual'),[attempt,setAttempt]=React.useState(0),narrow=useNarrow(),account=useAccount();
 const mayEdit=can(account,'work.create');
 // "Duplicate design" switches the editor to the copy in place: the address follows, the editor stays.
 const [inPlace,setInPlace]=React.useState<{id:string;ready:Ready}|null>(null);
 const here=!!inPlace&&inPlace.id===id;
 const loaded=useVisual(id,attempt,mayEdit,here);
 const router=useRouter();
 const onSwitched=React.useCallback((copyId:string,ready:Ready)=>setInPlace({id:copyId,ready}),[]);
 // "Back to original": the original opens again, read afresh (its draft holds everything done before the copy).
 const onBack=React.useCallback((originalId:string)=>{const there=editorHref('visual',originalId);if(!there)return;setInPlace(null);setAttempt(n=>n+1);router.replace(there)},[router]);
 // Phones have no editor: no editor panels either, and the navigation is the usual one.
 React.useEffect(()=>{if(narrow)closePanel()},[narrow]);
 const shown:Loaded=here?inPlace.ready:loaded;
 return <WorkspaceFrame current={narrow?'projects':'editor'} bleed={!narrow} notices={<AccountNotices variant="ds"/>}>
  {narrow?<PhoneNote id={id}/>
   :shown.kind==='loading'?<Loading label="Opening your picture" className="canvas-editor"><div className="canvas-skeleton"/></Loading>
   :shown.kind==='error'?<CantOpenState problem={shown.problem} detail={shown.detail} onRetry={()=>setAttempt(n=>n+1)}/>
   :<Editor key={`${attempt}:${shown.visual.id}${shown.design?':layers':''}`} opened={shown} mayEdit={mayEdit} onRetry={()=>setAttempt(n=>n+1)} onSwitched={onSwitched} onBack={onBack}/>}
 </WorkspaceFrame>;
}

function PhoneNote({id}:{id:string|null}){
 return <div className="canvas-phone-note">
  <State kind="empty" icon={<Monitor/>} title="Edit on a larger screen" actions={<Link className="ds-btn" href={id&&!linkProblem(id)?viewerHref({kind:'visual',id}):'/library'}>Back to the picture</Link>}>
   The editor needs a tablet or a computer to place logos and text precisely. Your picture is safe in Projects.
  </State>
 </div>;
}

const LAYER_KIND:Record<DrawnLayer['kind'],string>={image:'Picture',text:'Text',shape:'Shape',line:'Line',frame:'Frame',icon:'Icon'};
/** A text layer's height for its lines (the canvas measures wrapping itself; guides use this). */
const textHeight=(l:TextLayer,text:string)=>Math.max(1,text.split('\n').length)*l.fontSize*TEXT_LINE_HEIGHT;
const uuid=()=>crypto.randomUUID();
const isMac=()=>typeof navigator!=='undefined'&&/Mac|iP(hone|ad)/.test(navigator.platform||navigator.userAgent);

function Editor({opened,mayEdit,onRetry,onSwitched,onBack}:{opened:Ready;mayEdit:boolean;onRetry:()=>void;onSwitched:(copyId:string,ready:Ready)=>void;onBack:(originalId:string)=>void}){
 const toaster=useToast(),reduced=useReducedMotion(),router=useRouter();
 // The picture being edited: the one opened, or the copy "Duplicate design" switched to.
 const [target,setTarget]=React.useState<{visual:Visual;original:Visual|null}>({visual:opened.visual,original:null});
 const visual=target.visual;
 // A design saved from here opens as it was saved; its working draft (autosave) is newer still.
 const [start]=React.useState<EditorDoc>(()=>opened.draft||opened.design||createDoc({id:opened.visual.id,width:opened.visual.width||1,height:opened.visual.height||1}));
 const [history,setHistoryState]=React.useState<History<EditorDoc>>(()=>startHistory(start));
 // The history is changed synchronously through this ref (never inside a state updater), so a change
 // can say what it made (a copy's id) and a refused change can say why at once.
 const live=React.useRef(history);
 const setHistory=React.useCallback((f:(h:History<EditorDoc>)=>History<EditorDoc>)=>{const next=f(live.current);if(next!==live.current){live.current=next;setHistoryState(next)}},[]);
 const doc=history.present;
 const [pageId,setPageId]=React.useState(start.pages[0].id);
 const page=doc.pages.find(p=>p.id===pageId)?pageId:doc.pages[0].id;
 const fonts=useCanvasFonts(doc);
 const [selected,setSelected]=React.useState<string|null>(null);
 // The text layer being typed in on the canvas, and its typing session (one undo step each).
 const [editing,setEditing]=React.useState<string|null>(null);
 const [session,setSession]=React.useState(0);
 const [savedDoc,setSavedDoc]=React.useState<{visual:Visual;doc:EditorDoc}|null>(null);
 const [busy,setBusy]=React.useState<''|'save'|'copy'|'download'|'restore'>('');
 const [restoring,setRestoring]=React.useState<string|null>(null);
 const [sharing,setSharing]=React.useState(false);
 const [versionsOpen,setVersionsOpen]=React.useState(false);
 const canvasBox=React.useRef<HTMLDivElement>(null),handle=React.useRef<StageHandle>({stage:null,ui:null});
 // The soft lock: someone else editing opens it read only, with "Edit anyway".
 const presence=usePresence(visual.id,mayEdit);
 const readOnly=!mayEdit||!presence.checked||!presence.editing;
 const busyNote=editedBy(presence.others);
 const autosave=useAutosave(visual.id,{enabled:mayEdit&&presence.editing,doc,rev:history.rev,unsent:opened.unsent&&visual.id===opened.visual.id});
 // The box has its final size from the first paint (app/canvas.css: the picture's shape, fitted to the
 // space); the stage takes the box's measured width, so nothing moves when the canvas appears.
 const shownWidth=Math.floor(useSize(canvasBox).width);
 /** One change to the design (an immer recipe). `gesture` joins the open step of the same gesture: a drag, a slider, typing. */
 const change=React.useCallback((recipe:(d:import('immer').Draft<EditorDoc>)=>void,gesture?:string)=>{
  try{setHistory(h=>apply(h,recipe,gesture));return true}
  catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'That change couldn’t be made.'});return false}
 },[toaster,setHistory]);
 const endGesture=React.useCallback(()=>setHistory(end),[setHistory]);
 const raw=selected?doc.layers[selected]:undefined;
 const layer=raw&&raw.kind!=='group'&&raw.pageId===page?raw:null;
 const editingLayer=editing&&doc.layers[editing]?.kind==='text'?doc.layers[editing] as TextLayer:null;
 function startTyping(id:string){
  if(readOnly)return;
  setSession(n=>n+1);setSelected(id);setEditing(id);
 }
 const typingKey=(id:string)=>`type:${id}:${session}`;
 const type=(text:string)=>{if(!editingLayer)return;const l=editingLayer;change(d=>edit.update(d,l.id,{text,height:textHeight(l,text)}),typingKey(l.id))};
 function stopTyping(){
  const l=editingLayer;setEditing(null);
  // Text typed away to nothing is removed, in the same undo step as the typing.
  if(l&&!l.text.trim()){change(d=>edit.remove(d,l.id),typingKey(l.id));setSelected(null)}
  endGesture();
  canvasBox.current?.focus({preventScroll:true});
 }
 function pickPage(id:string){setPageId(id);setSelected(null);setEditing(null)}

 // The shell's panels add here while the editor is open.
 const add=React.useCallback(async(what:CanvasAdd)=>{
  if(readOnly){toaster.toast({kind:'info',message:busyNote?`${busyNote}. Press Edit anyway to change it.`:'You can view this design, not change it.'});return}
  let item=what;
  if(item.kind==='image'&&!(item.naturalWidth&&item.naturalHeight)){
   try{const img=await loadImage(item.src);item={...item,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}}
   catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'That picture could not be added.'});return}
  }
  const id=uuid();
  change(d=>edit.add(d,page,item,id));setSelected(id);
  // On a tablet the panel is a sheet over the canvas: close it so the new layer can be placed.
  if(window.matchMedia('(max-width: 768px)').matches)closePanel();
  canvasBox.current?.focus({preventScroll:true});
 },[change,toaster,page,readOnly,busyNote]);
 React.useEffect(()=>{const sink=(a:CanvasAdd)=>{void add(a)};setCanvasSink(sink);return()=>setCanvasSink(null)},[add]);

 // Leaving while a change is still on its way asks first (it is kept on this device either way).
 React.useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(!autosave.pending())return;e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[autosave]);

 /** Ctrl/Cmd+D, the Duplicate button: a copy next to the original, selected. One undo step. */
 function duplicateSelected(){
  if(!layer||readOnly)return;const copy=uuid(),root=layer.id;
  if(change(d=>{edit.duplicate(d,root,x=>x===root?copy:uuid(),duplicateOffset(doc))}))setSelected(copy);
 }
 /** Alt held as a drag starts: a copy where the layer is, in the drag's own undo step (the drop moves the copy). */
 const altDrag=React.useCallback((id:string,gesture:string)=>{
  if(readOnly)return null;const copy=uuid();
  if(!change(d=>{edit.duplicate(d,id,x=>x===id?copy:uuid(),{x:0,y:0})},gesture))return null;
  setSelected(copy);return copy;
 },[readOnly,change]);

 function onKey(e:React.KeyboardEvent){
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'&&!e.shiftKey){e.preventDefault();setHistory(undo);return}
  if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();setHistory(redo);return}
  if(readOnly)return;
  if(!mod&&!e.altKey&&k==='t'){e.preventDefault();void add({kind:'text',style:'heading'});return}
  if(!layer)return;
  if(e.key==='Enter'&&layer.kind==='text'){e.preventDefault();startTyping(layer.id);return}
  if(mod&&k==='d'){e.preventDefault();duplicateSelected();return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(d=>edit.remove(d,layer.id));setSelected(null);return}
  if(e.key==='Escape'){setSelected(null);return}
  // Ctrl/Cmd+] and [ move one step; with Shift, to the front or the back.
  if(mod&&(e.code==='BracketRight'||e.code==='BracketLeft'||e.key===']'||e.key==='['||e.key==='}'||e.key==='{')){
   e.preventDefault();const up=e.code==='BracketRight'||e.key===']'||e.key==='}';
   change(d=>edit.reorder(d,layer.id,up?(e.shiftKey?'front':'forward'):(e.shiftKey?'back':'backward')));return;
  }
  const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  // Arrow keys: 1 px of the picture; Shift: 10 px.
  const a=arrows[e.key];if(a&&!layer.locked){e.preventDefault();const by=e.shiftKey?10:1;change(d=>edit.nudge(d,layer.id,a[0]*by,a[1]*by))}
 }

 // ── Pages ──
 function addPage(){const id=uuid();change(d=>edit.addPage(d,id,page));pickPage(id)}
 function duplicatePage(){const id=uuid();change(d=>edit.duplicatePage(d,page,id,uuid));pickPage(id);toaster.toast({kind:'ok',message:`Page ${pageIndex(doc,page)+2} is a copy of page ${pageIndex(doc,page)+1}.`})}
 function movePage(by:-1|1){const at=pageIndex(doc,page);change(d=>edit.movePage(d,page,at+by))}
 function removePage(){
  const at=pageIndex(doc,page),next=doc.pages[at+1]?.id||doc.pages[at-1]?.id;if(!next)return;
  change(d=>edit.removePage(d,page));pickPage(next);
  toaster.toast({kind:'ok',message:`Page ${at+1} deleted.`,action:{label:'Undo',run:()=>{setHistory(undo);setPageId(page)}}});
 }

 // ── Export ──
 /** Draws a page on the stage (switching to it) once its pictures and fonts are in. */
 async function showPage(id:string){
  if(id!==page){setPageId(id);setSelected(null);await nextPaint()}
  const p=doc.pages.find(x=>x.id===id);
  const keys=[...(p?.background.kind==='picture'?[p.background.asset]:[]),...drawOrder(doc,id).flatMap(l=>l.kind==='image'?[l.asset]:[])];
  await Promise.all(keys.map(k=>loadImage(assetSrc(k)).catch(()=>null)));
  await nextPaint();
 }
 /** One page at the picture's own size, without the handles or guides. */
 async function exportBlob(type:'image/png'|'image/jpeg',id:string):Promise<Blob>{
  if(!shownWidth)throw new Error('The canvas isn’t ready yet.');
  await showPage(id);
  // Every font in the design is loaded (or has fallen back, and the notice says so) before anything is drawn.
  const {file}=await exportWithFonts(doc,{load:loadCanvasFont,ready:fonts.whenReady,draw:async()=>{
   const {stage,ui}=handle.current;if(!stage)throw new Error('The canvas isn’t ready yet.');
   const ratio=exportPixelRatio(doc,shownWidth),scale=shownWidth/doc.width;
   ui?.hide();
   try{
    const blob=await stage.toBlob({x:0,y:0,width:doc.width*scale,height:doc.height*scale,pixelRatio:ratio,mimeType:type,quality:0.92}) as Blob|null;
    if(!blob)throw new Error('The design could not be exported. Try again.');
    return blob;
   }finally{ui?.show()}
  }});
  return file;
 }
 /** Save (a new version of the picture opened) or Duplicate design (a separate copy). Page 1 is the picture; every page is kept. */
 async function post(copy:boolean):Promise<Visual>{
  const back=page,blob=await exportBlob('image/png',doc.pages[0].id),form=new FormData();
  if(back!==doc.pages[0].id)setPageId(back);
  form.set('parentId',visual.id);form.set('doc',JSON.stringify(doc));if(copy)form.set('copy','1');
  form.set('image',new File([blob],editFileName(visual.title,'png',copy),{type:'image/png'}));
  const r=await studioFetch(EDITS_PATH,{method:'POST',body:form,signal:AbortSignal.timeout(90_000)});const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};
  if(!r.ok||!d.visual)throw new Error(d.error||(copy?'The copy couldn’t be made. Try again.':'Your design could not be saved. Try again.'));
  return d.visual;
 }
 async function save(){
  if(busy)return;setBusy('save');
  try{
   const v=await post(false);setSavedDoc({visual:v,doc});
   toaster.toast({kind:'ok',message:'Saved as a new version. The original is unchanged.',action:{label:'Open in Projects',run:()=>router.push(viewerHref({kind:'visual',id:v.id}))}});
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'Your design could not be saved. Try again.'})}
  finally{setBusy('')}
 }
 /** "Duplicate design": "Copy of <name>" in the same folder, and the editor carries on with the copy, here. */
 async function duplicateDesign(){
  if(busy||readOnly)return;setBusy('copy');
  try{
   // The original keeps everything done so far (its draft), then the copy starts from the same design.
   await autosave.flush();
   const copy=await post(true),original=target.original||visual;
   const there=editorHref('visual',copy.id);if(there)window.history.replaceState(window.history.state,'',there);
   setTarget({visual:copy,original});setSavedDoc({visual:copy,doc});
   onSwitched(copy.id,opened);
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'The copy couldn’t be made. Try again.'})}
  finally{setBusy('')}
 }
 async function download(type:'png'|'jpg'|'zip'){
  if(busy)return;setBusy('download');const back=page;
  try{
   let blob:Blob,name:string;
   if(type==='zip'){
    const files=[];
    for(const [i,p] of doc.pages.entries())files.push({name:editFileName(visual.title,'png',false).replace(/\.png$/,`-page-${i+1}.png`),bytes:new Uint8Array(await (await exportBlob('image/png',p.id)).arrayBuffer())});
    blob=new Blob([zipStored(files) as BlobPart],{type:'application/zip'});name=editFileName(visual.title,'png',false).replace(/\.png$/,'-pages.zip');
   }else{blob=await exportBlob(type==='png'?'image/png':'image/jpeg',back);name=editFileName(visual.title,type,false)}
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
   toaster.toast({kind:'ok',message:type==='zip'?`Downloaded ${doc.pages.length} pages at full size, ${doc.width} × ${doc.height}.`:`Downloaded page ${pageIndex(doc,back)+1} at full size, ${doc.width} × ${doc.height}.`});
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'The download didn’t start. Try again.'})}
  finally{if(back!==page)setPageId(back);setBusy('')}
 }
 /** Restore: a new version made from that one; on the canvas as one change (undo takes it back). */
 async function restore(v:Version){
  if(busy||readOnly)return;setBusy('restore');setRestoring(v.id);
  try{
   const r=await studioFetch(`/api/edits/${v.id}/restore`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({parentId:visual.id}),signal:AbortSignal.timeout(60_000)});
   const d=await r.json().catch(()=>({})) as {visual?:Visual;design?:unknown;error?:string};
   const read=readDoc(d.design);
   if(!r.ok||!d.visual||!read.ok)throw new Error(d.error||'That version couldn’t be restored. Try again.');
   change(x=>edit.replace(x,read.doc));pickPage(read.doc.pages[0].id);setSavedDoc({visual:d.visual,doc:read.doc});setVersionsOpen(false);
   toaster.toast({kind:'ok',message:`Restored the version from ${dateTime(v.createdAt)} as a new version. Nothing was deleted.`,action:{label:'Undo',run:()=>setHistory(undo)}});
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'That version couldn’t be restored. Try again.'})}
  finally{setBusy('');setRestoring(null)}
 }

 const shareTarget=savedDoc?.visual||visual;
 const fontNote=fallbackNotice(fonts.failed);
 const dirty=doc!==(savedDoc?savedDoc.doc:start)||!!opened.draft;
 const mod=isMac()?'⌘':'Ctrl+';
 const drawn=drawOrder(doc,page),bg=doc.pages.find(p=>p.id===page)?.background;
 const viewOnly=!mayEdit?'View only':readOnly&&presence.checked?'View only':false;

 return <div className="canvas-editor">
  <div className="canvas-bar">
   <Link className="ds-btn icon sm quiet" href={viewerHref({kind:'visual',id:visual.id})} aria-label="Back to the picture" title="Back to the picture"><ArrowLeft aria-hidden="true"/></Link>
   <h1 className="canvas-title ds-truncate" title={visual.title}>{visual.title}</h1>
   <SaveStatus status={autosave.status} detail={autosave.detail} viewOnly={viewOnly} onRetry={autosave.retry}/>
   <span className="canvas-bar-group" role="group" aria-label="History">
    <IconButton label={`Undo (${mod}Z)`} size="sm" disabled={!canUndo(history)} onClick={()=>setHistory(undo)}><Undo2 aria-hidden="true"/></IconButton>
    <IconButton label={`Redo (${mod}Shift+Z)`} size="sm" disabled={!canRedo(history)} onClick={()=>setHistory(redo)}><Redo2 aria-hidden="true"/></IconButton>
   </span>
   <span className="canvas-bar-actions">
    {mayEdit&&<Button size="sm" kind="quiet" icon={<ClockArrowDown aria-hidden="true"/>} onClick={()=>setVersionsOpen(true)}>Versions</Button>}
    {mayEdit&&<Button size="sm" kind="quiet" icon={<Copy aria-hidden="true"/>} busy={busy==='copy'} disabled={(!!busy&&busy!=='copy')||readOnly} onClick={()=>void duplicateDesign()}>Duplicate design</Button>}
    <Menu label="Download" size="sm" trigger={<Download aria-hidden="true"/>} text="Download">
     <MenuItem disabled={!!busy} onSelect={()=>void download('png')}>{doc.pages.length>1?`Page ${pageIndex(doc,page)+1}, PNG`:'PNG'}, {doc.width} × {doc.height}</MenuItem>
     <MenuItem disabled={!!busy} onSelect={()=>void download('jpg')}>{doc.pages.length>1?`Page ${pageIndex(doc,page)+1}, JPG`:'JPG'}, {doc.width} × {doc.height}</MenuItem>
     {doc.pages.length>1&&<><MenuSeparator/><MenuItem disabled={!!busy} onSelect={()=>void download('zip')}>All {doc.pages.length} pages, ZIP of PNGs</MenuItem></>}
    </Menu>
    <Button size="sm" icon={<Share2 aria-hidden="true"/>} onClick={()=>setSharing(true)}>Share</Button>
    {mayEdit&&<Button size="sm" kind="primary" icon={<Save aria-hidden="true"/>} busy={busy==='save'} disabled={(!!busy&&busy!=='save')||readOnly||!dirty} onClick={()=>void save()} title="Makes a new version of the picture from page 1, with every page kept. Nothing is overwritten.">{savedDoc&&!dirty?'Saved':'Save'}</Button>}
   </span>
  </div>
  <div className="canvas-body">
   <div className="canvas-area">
    {target.original&&<div className="ds-banner canvas-notice" role="status" data-copy-notice><Copy aria-hidden="true"/><span>You’re now editing the copy, “{visual.title}”.</span><Button size="sm" kind="quiet" onClick={()=>{void autosave.flush().finally(()=>onBack(target.original!.id))}}>Back to original</Button></div>}
    {mayEdit&&busyNote&&<div className="ds-banner warn canvas-notice" role="status" data-soft-lock><Users aria-hidden="true"/><span>{busyNote}.{readOnly?' It’s open read only for you.':' You’re both editing; each change is kept as its own draft.'}</span>{readOnly&&<Button size="sm" kind="quiet" onClick={presence.editAnyway}>Edit anyway</Button>}</div>}
    {opened.layersLost&&<div className="ds-banner warn canvas-notice" role="status"><Info aria-hidden="true"/><span>This picture’s layers didn’t load, so it opens as one flat picture. Saving still makes a new version.</span><Button size="sm" kind="quiet" onClick={onRetry}>Try again</Button></div>}
    {fontNote&&<div className="ds-banner warn canvas-notice" role="status"><Info aria-hidden="true"/><span>{fontNote}</span></div>}
    <div className="canvas-fit">
    <div ref={canvasBox} className="canvas-box" tabIndex={0} role="application" aria-roledescription="design canvas" data-editable={readOnly?undefined:'true'} data-undo-steps={history.past.length}
     aria-label={`Canvas, page ${pageIndex(doc,page)+1} of ${doc.pages.length}, ${drawn.length} ${drawn.length===1?'layer':'layers'}${layer?`, ${layer.name} selected`:''}`} aria-describedby="canvas-keys" onKeyDown={onKey} style={{['--canvas-ratio' as string]:String(doc.width/doc.height)} as React.CSSProperties}>
     {shownWidth>0&&<CanvasStage doc={doc} pageId={page} shownWidth={shownWidth} selected={selected} reducedMotion={reduced} fonts={fonts} editing={editing} readOnly={readOnly} handle={handle}
      onSelect={setSelected} onChange={(lid,patch,gesture)=>change(d=>edit.update(d,lid,patch),gesture)} onEditText={startTyping} onAltDrag={altDrag} onGestureEnd={endGesture}/>}
     {editingLayer&&shownWidth>0&&<TextEditor key={editingLayer.id+':'+session} layer={editingLayer} scale={shownWidth/doc.width} family={fonts.family(editingLayer.font,editingLayer.fontWeight).family} onType={type} onDone={stopTyping}/>}
    </div>
    </div>
    <PageStrip doc={doc} current={page} readOnly={readOnly} onPick={pickPage} onAdd={addPage} onDuplicate={duplicatePage} onMove={movePage} onRemove={removePage}/>
    <p className="ds-help canvas-keys" id="canvas-keys">Double-click text to type. {mod}D duplicates, Alt-drag copies, {mod}Z undoes, arrows nudge (Shift: 10 px).</p>
   </div>
   <aside className="canvas-inspector" aria-label="Design">
    <section className="canvas-section" aria-labelledby="canvas-layers-title">
     <h2 className="canvas-section-title" id="canvas-layers-title">Layers on page {pageIndex(doc,page)+1}</h2>
     {drawn.length===0?<p className="ds-help">Nothing on this page yet. Open Brand, Elements, Text or Uploads on the left and click what you want.</p>
      :<ol className="canvas-layers">{[...drawn].reverse().map(l=><li key={l.id}>
        <button type="button" className="canvas-layer" aria-pressed={l.id===selected} onClick={()=>{setSelected(l.id);canvasBox.current?.focus({preventScroll:true})}}>
         <span className="canvas-layer-kind">{LAYER_KIND[l.kind]}</span><span className="ds-truncate" title={l.kind==='text'?l.text:l.name}>{l.kind==='text'?l.text:l.name}</span>
        </button>
       </li>)}<li><span className="canvas-layer canvas-layer-base"><span className="canvas-layer-kind">{bg?.kind==='colour'?'Colour':'Picture'}</span><span className="ds-truncate" title={visual.title}>{bg?.kind==='colour'?'A plain background':doc.base!==visual.id?'The original picture (kept as it is)':'Your picture (kept as it is)'}</span></span></li></ol>}
    </section>
    {layer&&!readOnly&&<LayerSettings key={layer.id} layer={layer} mod={mod} onEnd={endGesture} onPatch={(patch,gesture)=>change(d=>edit.update(d,layer.id,patch),gesture)} onType={()=>startTyping(layer.id)}
     onOrder={to=>change(d=>edit.reorder(d,layer.id,to))} onDuplicate={duplicateSelected} onRemove={()=>{change(d=>edit.remove(d,layer.id));setSelected(null)}}/>}
   </aside>
  </div>
  <SharePanel open={sharing} onClose={()=>setSharing(false)} item={{kind:'visual',id:shareTarget.id,title:shareTarget.title,src:shareTarget.src,mine:shareTarget.mine!==false}}/>
  {mayEdit&&<VersionHistory open={versionsOpen} pictureId={visual.id} onClose={()=>setVersionsOpen(false)} onRestore={v=>void restore(v)} busy={restoring}/>}
 </div>;
}

/** The brand kit's colours as swatches: one press recolours the selection. */
function BrandSwatches({value,onPick}:{value:string;onPick:(hex:string)=>void}){
 const {kit}=useBrandKit();
 const colours=(kit?.colours??[]).flatMap(c=>{const hex=cleanHex(c?.hex);return hex?[{hex,name:c.name?.trim()||hex}]:[]});
 if(!colours.length)return null;
 const now=value.toUpperCase();
 return <div className="canvas-swatches" role="group" aria-label="Brand colours">{colours.map(c=>{const on=c.hex===now;return <button key={c.hex} type="button" className="canvas-swatch" aria-pressed={on} aria-label={c.name!==c.hex?`${c.name}, ${c.hex}`:c.hex} title={c.name} style={{['--swatch' as string]:c.hex} as React.CSSProperties} onClick={()=>onPick(c.hex)}>{on&&<Check aria-hidden="true"/>}</button>})}</div>;
}

function LayerSettings({layer,mod,onPatch,onEnd,onType,onOrder,onDuplicate,onRemove}:{layer:DrawnLayer;mod:string;onPatch:(p:Partial<DrawnLayer>,gesture?:string)=>void;onEnd:()=>void;onType:()=>void;onOrder:(to:'forward'|'backward'|'front'|'back')=>void;onDuplicate:()=>void;onRemove:()=>void}){
 const {kit}=useBrandKit();
 const colourKey=layer.kind==='text'||layer.kind==='icon'?'color':layer.kind==='shape'?'fill':layer.kind==='image'?null:'stroke';
 const colour=colourKey?(layer as unknown as Record<string,string>)[colourKey]:null;
 const font=layer.kind==='text'?knownFont(layer.font):null,choices=layer.kind==='text'?fontChoices(kit):[];
 // Leaving a field closes its undo step: typing a number, then another field, is two steps.
 return <section className="canvas-section" aria-labelledby="canvas-selected-title" onBlur={onEnd}>
  <h2 className="canvas-section-title" id="canvas-selected-title">{LAYER_KIND[layer.kind]}</h2>
  {layer.kind==='text'&&<Field label="Text" count={{value:layer.text.length,max:500}}><Textarea rows={3} maxLength={500} value={layer.text} onChange={e=>onPatch({text:e.target.value,height:textHeight(layer,e.target.value)},'text:'+layer.id)}/></Field>}
  {layer.kind==='text'&&<Button size="sm" onClick={onType}>Type on the canvas</Button>}
  {layer.kind==='text'&&font&&<Field label="Font"><Select value={font} onChange={e=>onPatch({font:e.target.value})}>{!choices.some(c=>c.font===font)&&<option value={font}>{font}</option>}{choices.map(c=><option key={c.font} value={c.font}>{c.label}</option>)}</Select></Field>}
  {layer.kind==='text'&&<Field label="Size"><Input type="number" min={4} max={4000} value={layer.fontSize} onChange={e=>{const n=Number(e.target.value);if(n>=4&&n<=4000)onPatch({fontSize:n,height:textHeight({...layer,fontSize:n},layer.text)},'size:'+layer.id)}}/></Field>}
  {colourKey&&colour!==null&&<Field label="Colour"><span className="canvas-colours"><BrandSwatches value={colour} onPick={hex=>onPatch({[colourKey]:hex} as Partial<DrawnLayer>)}/><Input type="color" className="canvas-colour" aria-label="Any colour" value={colour==='transparent'?'#000000':colour} onChange={e=>onPatch({[colourKey]:e.target.value} as Partial<DrawnLayer>,'colour:'+layer.id)}/></span></Field>}
  <Field label="Rotation"><Input type="number" min={-360} max={360} value={layer.rotation} onChange={e=>{const n=Number(e.target.value);if(n>=-360&&n<=360)onPatch({rotation:n},'rotation:'+layer.id)}}/></Field>
  <div className="canvas-actions" role="group" aria-label="Order">
   <IconButton label={`Bring to front (${mod}Shift+])`} size="sm" onClick={()=>onOrder('front')}><BringToFront aria-hidden="true"/></IconButton>
   <IconButton label={`Bring forward (${mod}])`} size="sm" onClick={()=>onOrder('forward')}><ArrowUp aria-hidden="true"/></IconButton>
   <IconButton label={`Send backward (${mod}[)`} size="sm" onClick={()=>onOrder('backward')}><ArrowDown aria-hidden="true"/></IconButton>
   <IconButton label={`Send to back (${mod}Shift+[)`} size="sm" onClick={()=>onOrder('back')}><SendToBack aria-hidden="true"/></IconButton>
  </div>
  <div className="canvas-actions">
   <Button size="sm" icon={<Copy aria-hidden="true"/>} onClick={onDuplicate} title={`Duplicate (${mod}D)`}>Duplicate</Button>
   <Button size="sm" kind="danger-quiet" icon={<Trash2 aria-hidden="true"/>} onClick={onRemove}>Delete</Button>
  </div>
 </section>;
}
