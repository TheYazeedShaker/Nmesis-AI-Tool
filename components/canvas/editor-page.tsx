'use client';
import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowDown,ArrowLeft,ArrowUp,BringToFront,Check,Clock,Copy,Download,ImageOff,Info,Monitor,Redo2,Save,SendToBack,Share2,Trash2,Undo2} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Field,Input,Select,Textarea} from '@/components/ds/field';
import {Loading,State} from '@/components/ds/feedback';
import {Menu,MenuItem} from '@/components/ds/menu';
import {useToast} from '@/components/ds/toast';
import {AccountNotices,useAccount} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {SharePanel} from '@/components/share/share-panel';
import {closePanel,setCanvasSink} from '@/components/shell/shell-state';
import {useBrandKit} from '@/components/brand/brand-kit';
import {cleanHex} from '@/lib/brand-kit';
import {can} from '@/lib/accounts/can';
import {studioFetch} from '@/lib/studio-fetch';
import type {Visual} from '@/lib/studio';
import {addLayer,checkDoc,commit,createDoc,duplicateLayer,exportPixelRatio,nudge,redo,removeLayer,reorder,startHistory,TEXT_LINE_HEIGHT,undo,updateLayer,type CanvasAdd,type EditorDoc,type History,type Layer,type TextLayer} from '@/lib/editor/doc';
import {exportWithFonts,fallbackNotice,fontChoices,knownFont} from '@/lib/editor/fonts';
import {editFileName,EDITS_PATH} from '@/lib/editor/save';
import {answerProblem,CANT_OPEN,linkProblem,type CantOpen} from '@/lib/editor/cant-open';
import {viewerHref} from '@/lib/work-ref';
import {loadImage} from './images';
import {loadCanvasFont,useCanvasFonts} from './fonts';
import {TextEditor} from './text-editor';
import type {StageHandle} from './stage';

// The canvas editor (/editor?visual=<id>): a generated picture on a canvas,
// with the shell's Brand, Elements, Text and Uploads panels adding to it.
// Select, move, resize and rotate on the canvas or from the Layers list; the
// arrow keys move (Shift: ten times further), Delete removes, Ctrl+Z / Ctrl+Y
// undo and redo, Ctrl+D duplicates, [ and ] change the order; a double click
// (or Enter) on text types in it, on the canvas. Text is drawn in the brand's
// fonts, loaded first (./fonts.ts); the export waits for them. Save makes a new
// version (the picture opened stays as it was); Duplicate saves a separate copy;
// Download exports PNG or JPG at the picture's full resolution. A picture saved
// from here reopens as its original with every layer, still editable
// (GET /api/edits/<id>); any other picture opens plain. Phones get a note
// instead: the editor needs a larger screen.
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

/** A picture saved from the editor brings its design (the original underneath, every layer); `layersLost`: it has one, but it didn't load. */
type Ready={kind:'ready';visual:Visual;design:EditorDoc|null;layersLost?:boolean};
type Loaded={kind:'loading'}|{kind:'error';problem:CantOpen;detail?:string}|Ready;
/** The design kept beside a picture saved from the editor (edits/<id>.json): null when it has none or it can't be reopened. */
async function loadDesign(id:string):Promise<{design:EditorDoc|null;lost:boolean}>{
 try{
  const r=await studioFetch('/api/edits/'+id,{signal:AbortSignal.timeout(20_000)});
  // 404: no layers kept (an older save), or the original underneath is gone: the picture opens plain.
  if(r.status===404)return {design:null,lost:false};
  const d=await r.json().catch(()=>({})) as {design?:unknown};
  const checked=r.ok?checkDoc(d.design):null;
  if(checked?.ok)return {design:checked.doc,lost:false};
  console.warn('[editor] the layers did not open',{status:r.status});
 }catch(e){console.warn('[editor] the layers did not open',{reason:e instanceof Error?e.name:'unknown'})}
 return {design:null,lost:true};
}
/** The picture's answer said why it can't be edited (lib/editor/cant-open.ts). */
class Refused extends Error{problem:CantOpen;constructor(problem:CantOpen,detail?:string){super(detail||CANT_OPEN[problem].body);this.problem=problem}}
/** The picture at ?visual=<id>; `attempt` asks again (Try again). */
function useVisual(id:string|null,attempt:number):Loaded{
 const [state,setState]=React.useState<{key:string;loaded:Loaded}>({key:'',loaded:{kind:'loading'}});
 const bad=linkProblem(id),key=(id||'')+'#'+attempt;
 React.useEffect(()=>{
  if(bad||!id)return;let live=true;
  studioFetch('/api/visuals/'+id,{signal:AbortSignal.timeout(20_000)})
   .then(async r=>{const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};const problem=answerProblem(r.status,d.visual);if(problem)throw new Refused(problem,problem==='other'?d.error:undefined);return d.visual as Visual})
   .then(async v=>{
    // An older picture may not say its size: read it from the picture itself.
    if(!(v.width&&v.height)){const img=await loadImage(v.src);v={...v,width:img.naturalWidth,height:img.naturalHeight}}
    // Saved from the editor: reopen the original underneath with its layers. Any other picture opens plain.
    const {design,lost}=v.edit?await loadDesign(v.id):{design:null,lost:false};
    if(live)setState({key,loaded:{kind:'ready',visual:v,design,layersLost:lost}});
   })
   .catch((e:unknown)=>{
    if(!live)return;
    const problem=e instanceof Refused?e.problem:'other';
    // Which case, never the address: enough to tell a bad link from a missing picture in the logs.
    console.warn('[editor] the picture did not open',{problem,reason:e instanceof Error?e.name:'unknown'});
    setState({key,loaded:{kind:'error',problem,detail:e instanceof Refused&&problem==='other'?e.message:undefined}});
   });
  return()=>{live=false};
 },[id,bad,key]);
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
 const params=useSearchParams(),id=params.get('visual'),[attempt,setAttempt]=React.useState(0),loaded=useVisual(id,attempt),narrow=useNarrow();
 // Phones have no editor: no editor panels either, and the navigation is the usual one.
 React.useEffect(()=>{if(narrow)closePanel()},[narrow]);
 return <WorkspaceFrame current={narrow?'projects':'editor'} bleed={!narrow} notices={<AccountNotices variant="ds"/>}>
  {narrow?<PhoneNote id={id}/>
   :loaded.kind==='loading'?<Loading label="Opening your picture" className="canvas-editor"><div className="canvas-skeleton"/></Loading>
   :loaded.kind==='error'?<CantOpenState problem={loaded.problem} detail={loaded.detail} onRetry={()=>setAttempt(n=>n+1)}/>
   :<Editor key={loaded.visual.id+(loaded.design?':layers':'')} visual={loaded.visual} design={loaded.design} layersLost={!!loaded.layersLost} onRetry={()=>setAttempt(n=>n+1)}/>}
 </WorkspaceFrame>;
}

function PhoneNote({id}:{id:string|null}){
 return <div className="canvas-phone-note">
  <State kind="empty" icon={<Monitor/>} title="Edit on a larger screen" actions={<Link className="ds-btn" href={id&&!linkProblem(id)?viewerHref({kind:'visual',id}):'/library'}>Back to the picture</Link>}>
   The editor needs a tablet or a computer to place logos and text precisely. Your picture is safe in Projects.
  </State>
 </div>;
}

const LAYER_KIND:Record<Layer['kind'],string>={image:'Picture',text:'Text',shape:'Shape',line:'Line',frame:'Frame',icon:'Icon'};
/** A text layer's height for its lines (the canvas measures wrapping itself; guides use this). */
const textHeight=(l:TextLayer,text:string)=>Math.max(1,text.split('\n').length)*l.fontSize*TEXT_LINE_HEIGHT;

function Editor({visual,design,layersLost,onRetry}:{visual:Visual;design:EditorDoc|null;layersLost:boolean;onRetry:()=>void}){
 const account=useAccount(),toaster=useToast(),reduced=useReducedMotion(),router=useRouter();
 const mayEdit=can(account,'work.create');
 // A design saved from here opens as it was saved: its original underneath, every layer editable.
 const [opened]=React.useState<EditorDoc>(()=>design||createDoc({id:visual.id,src:visual.src,width:visual.width||1,height:visual.height||1}));
 const [history,setHistory]=React.useState<History<EditorDoc>>(()=>startHistory(opened));
 const doc=history.present;
 const fonts=useCanvasFonts(doc);
 const [selected,setSelected]=React.useState<string|null>(null);
 // The text layer being typed in on the canvas, and its typing session (one undo step each).
 const [editing,setEditing]=React.useState<string|null>(null);
 const [session,setSession]=React.useState(0);
 const [saved,setSaved]=React.useState<{visual:Visual;doc:EditorDoc}|null>(null);
 const [busy,setBusy]=React.useState<''|'save'|'copy'|'download'>('');
 const [sharing,setSharing]=React.useState(false);
 const canvasBox=React.useRef<HTMLDivElement>(null),handle=React.useRef<StageHandle>({stage:null,ui:null});
 // The box has its final size from the first paint (app/canvas.css: the picture's shape, fitted to the
 // space); the stage takes the box's measured width, so nothing moves when the canvas appears.
 const shownWidth=Math.floor(useSize(canvasBox).width);
 /** One change to the design; `merge` joins it to the step before with the same key (typing). */
 const change=React.useCallback((next:(d:EditorDoc)=>EditorDoc,merge?:string)=>setHistory(h=>commit(h,next(h.present),merge)),[]);
 const layer=doc.layers.find(l=>l.id===selected)||null;
 const dirty=doc!==(saved?saved.doc:opened);
 const editingLayer=doc.layers.find((l):l is TextLayer=>l.id===editing&&l.kind==='text')||null;
 function startTyping(id:string){
  if(!mayEdit)return;
  setSession(n=>n+1);setSelected(id);setEditing(id);
 }
 const typingKey=(id:string)=>`type:${id}:${session}`;
 const type=(text:string)=>{if(!editingLayer)return;const l=editingLayer;change(d=>updateLayer(d,l.id,{text,height:textHeight(l,text)}),typingKey(l.id))};
 function stopTyping(){
  const l=editingLayer;setEditing(null);
  // Text typed away to nothing is removed, in the same undo step as the typing.
  if(l&&!l.text.trim()){change(d=>removeLayer(d,l.id),typingKey(l.id));setSelected(null)}
  canvasBox.current?.focus({preventScroll:true});
 }

 // The shell's panels add here while the editor is open.
 const add=React.useCallback(async(what:CanvasAdd)=>{
  let item=what;
  if(item.kind==='image'&&!(item.naturalWidth&&item.naturalHeight)){
   try{const img=await loadImage(item.src);item={...item,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}}
   catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'That picture could not be added.'});return}
  }
  const id=crypto.randomUUID();
  try{
   change(d=>addLayer(d,item,id));setSelected(id);
   // On a tablet the panel is a sheet over the canvas: close it so the new layer can be placed.
   if(window.matchMedia('(max-width: 768px)').matches)closePanel();
   canvasBox.current?.focus({preventScroll:true});
  }
  catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'That could not be added.'})}
 },[change,toaster]);
 React.useEffect(()=>{const sink=(a:CanvasAdd)=>{void add(a)};setCanvasSink(sink);return()=>setCanvasSink(null)},[add]);

 // Leaving with unsaved work asks first.
 React.useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);

 const step=Math.max(1,Math.round(1/Math.max(shownWidth/doc.width,0.01)));
 function onKey(e:React.KeyboardEvent){
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'&&!e.shiftKey){e.preventDefault();setHistory(undo);return}
  if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();setHistory(redo);return}
  if(!selected)return;
  if(e.key==='Enter'&&layer?.kind==='text'){e.preventDefault();startTyping(layer.id);return}
  if(mod&&k==='d'){e.preventDefault();const id=crypto.randomUUID();change(d=>duplicateLayer(d,selected,id));setSelected(id);return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(d=>removeLayer(d,selected));setSelected(null);return}
  if(e.key==='Escape'){setSelected(null);return}
  if(e.key===']'||e.key==='['){e.preventDefault();change(d=>reorder(d,selected,e.key===']'?(mod?'front':'forward'):(mod?'back':'backward')));return}
  const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  const a=arrows[e.key];if(a){e.preventDefault();const by=step*(e.shiftKey?10:1);change(d=>nudge(d,selected,a[0]*by,a[1]*by))}
 }

 /** The design at the picture's own size, without the handles or guides. */
 async function exportBlob(type:'image/png'|'image/jpeg'):Promise<Blob>{
  if(!handle.current.stage||!shownWidth)throw new Error('The canvas isn’t ready yet.');
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
 async function save(copy:boolean){
  if(busy)return;setBusy(copy?'copy':'save');
  try{
   const blob=await exportBlob('image/png'),form=new FormData();
   // The picture opened is the parent (this is its next version); a reopened design keeps its original underneath (doc.background).
   form.set('parentId',visual.id);form.set('doc',JSON.stringify(doc));if(copy)form.set('copy','1');
   form.set('image',new File([blob],editFileName(visual.title,'png',copy),{type:'image/png'}));
   const r=await studioFetch(EDITS_PATH,{method:'POST',body:form});const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};
   if(!r.ok||!d.visual)throw new Error(d.error||'Your design could not be saved. Try again.');
   if(!copy)setSaved({visual:d.visual,doc});
   toaster.toast({kind:'ok',message:copy?'Saved a copy in Projects.':'Saved as a new version. The original is unchanged.',action:{label:'Open in Projects',run:()=>router.push(viewerHref({kind:'visual',id:d.visual!.id}))}});
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'Your design could not be saved. Try again.'})}
  finally{setBusy('')}
 }
 async function download(type:'png'|'jpg'){
  if(busy)return;setBusy('download');
  try{
   const blob=await exportBlob(type==='png'?'image/png':'image/jpeg'),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=editFileName(visual.title,type,false);a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
   toaster.toast({kind:'ok',message:`Downloaded at full size, ${doc.width} × ${doc.height}.`});
  }catch(e){toaster.toast({kind:'bad',message:e instanceof Error?e.message:'The download didn’t start. Try again.'})}
  finally{setBusy('')}
 }
 const shareTarget=saved?.visual||visual;
 const fontNote=fallbackNotice(fonts.failed);
 const reopened=doc.background.visualId!==visual.id;

 return <div className="canvas-editor">
  <div className="canvas-bar">
   <Link className="ds-btn icon sm quiet" href={viewerHref({kind:'visual',id:visual.id})} aria-label="Back to the picture" title="Back to the picture"><ArrowLeft aria-hidden="true"/></Link>
   <h1 className="canvas-title ds-truncate" title={visual.title}>{visual.title}</h1>
   <span className="canvas-bar-group" role="group" aria-label="History">
    <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!history.past.length} onClick={()=>setHistory(undo)}><Undo2 aria-hidden="true"/></IconButton>
    <IconButton label="Redo (Ctrl+Y)" size="sm" disabled={!history.future.length} onClick={()=>setHistory(redo)}><Redo2 aria-hidden="true"/></IconButton>
   </span>
   <span className="canvas-bar-actions">
    {mayEdit&&<Button size="sm" kind="quiet" icon={<Copy aria-hidden="true"/>} busy={busy==='copy'} disabled={!!busy&&busy!=='copy'} onClick={()=>void save(true)}>Duplicate</Button>}
    <Menu label="Download" size="sm" trigger={<Download aria-hidden="true"/>} text="Download">
     <MenuItem disabled={!!busy} onSelect={()=>void download('png')}>PNG, {doc.width} × {doc.height}</MenuItem>
     <MenuItem disabled={!!busy} onSelect={()=>void download('jpg')}>JPG, {doc.width} × {doc.height}</MenuItem>
    </Menu>
    <Button size="sm" icon={<Share2 aria-hidden="true"/>} onClick={()=>setSharing(true)}>Share</Button>
    {mayEdit&&<Button size="sm" kind="primary" icon={<Save aria-hidden="true"/>} busy={busy==='save'} disabled={(!!busy&&busy!=='save')||!dirty} onClick={()=>void save(false)}>{saved&&!dirty?'Saved':'Save'}</Button>}
   </span>
  </div>
  <div className="canvas-body">
   <div className="canvas-area">
    {layersLost&&<div className="ds-banner warn canvas-notice" role="status"><Info aria-hidden="true"/><span>This picture’s layers didn’t load, so it opens as one flat picture. Saving still makes a new version.</span><Button size="sm" kind="quiet" onClick={onRetry}>Try again</Button></div>}
    {fontNote&&<div className="ds-banner warn canvas-notice" role="status"><Info aria-hidden="true"/><span>{fontNote}</span></div>}
    <div className="canvas-fit">
    <div ref={canvasBox} className="canvas-box" tabIndex={0} role="application" aria-roledescription="design canvas" aria-label={`Canvas, ${doc.layers.length} ${doc.layers.length===1?'layer':'layers'}${layer?`, ${layer.name} selected`:''}`} aria-describedby="canvas-keys" onKeyDown={onKey} style={{['--canvas-ratio' as string]:String(doc.width/doc.height)} as React.CSSProperties}>
     {shownWidth>0&&<CanvasStage doc={doc} shownWidth={shownWidth} selected={selected} reducedMotion={reduced} fonts={fonts} editing={editing} handle={handle} onSelect={setSelected} onChange={(lid,patch)=>change(d=>updateLayer(d,lid,patch))} onEditText={startTyping}/>}
     {editingLayer&&shownWidth>0&&<TextEditor key={editingLayer.id+':'+session} layer={editingLayer} scale={shownWidth/doc.width} family={fonts.family(editingLayer.font,editingLayer.fontWeight).family} onType={type} onDone={stopTyping}/>}
    </div>
    </div>
    <p className="ds-help canvas-keys" id="canvas-keys">Double-click text (or press Enter) to type in it. Arrows move, Delete removes, Ctrl+D duplicates, [ and ] reorder, Ctrl+Z undoes.</p>
   </div>
   <aside className="canvas-inspector" aria-label="Design">
    <section className="canvas-section" aria-labelledby="canvas-layers-title">
     <h2 className="canvas-section-title" id="canvas-layers-title">Layers</h2>
     {doc.layers.length===0?<p className="ds-help">Nothing added yet. Open Brand, Elements, Text or Uploads on the left and click what you want.</p>
      :<ol className="canvas-layers">{[...doc.layers].reverse().map(l=><li key={l.id}>
        <button type="button" className="canvas-layer" aria-pressed={l.id===selected} onClick={()=>{setSelected(l.id);canvasBox.current?.focus({preventScroll:true})}}>
         <span className="canvas-layer-kind">{LAYER_KIND[l.kind]}</span><span className="ds-truncate" title={l.kind==='text'?l.text:l.name}>{l.kind==='text'?l.text:l.name}</span>
        </button>
       </li>)}<li><span className="canvas-layer canvas-layer-base"><span className="canvas-layer-kind">Picture</span><span className="ds-truncate" title={visual.title}>{reopened?'The original picture (kept as it is)':'Your picture (kept as it is)'}</span></span></li></ol>}
    </section>
    {layer&&<LayerSettings key={layer.id} layer={layer} onPatch={(patch,merge)=>change(d=>updateLayer(d,layer.id,patch),merge)} onType={()=>startTyping(layer.id)}
     onOrder={to=>change(d=>reorder(d,layer.id,to))} onDuplicate={()=>{const id=crypto.randomUUID();change(d=>duplicateLayer(d,layer.id,id));setSelected(id)}} onRemove={()=>{change(d=>removeLayer(d,layer.id));setSelected(null)}}/>}
   </aside>
  </div>
  <SharePanel open={sharing} onClose={()=>setSharing(false)} item={{kind:'visual',id:shareTarget.id,title:shareTarget.title,src:shareTarget.src,mine:shareTarget.mine!==false}}/>
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

function LayerSettings({layer,onPatch,onType,onOrder,onDuplicate,onRemove}:{layer:Layer;onPatch:(p:Partial<Layer>,merge?:string)=>void;onType:()=>void;onOrder:(to:'forward'|'backward'|'front'|'back')=>void;onDuplicate:()=>void;onRemove:()=>void}){
 const {kit}=useBrandKit();
 const colourKey=layer.kind==='text'||layer.kind==='icon'?'color':layer.kind==='shape'?'fill':layer.kind==='image'?null:'stroke';
 const colour=colourKey?(layer as unknown as Record<string,string>)[colourKey]:null;
 const font=layer.kind==='text'?knownFont(layer.font):null,choices=layer.kind==='text'?fontChoices(kit):[];
 return <section className="canvas-section" aria-labelledby="canvas-selected-title">
  <h2 className="canvas-section-title" id="canvas-selected-title">{LAYER_KIND[layer.kind]}</h2>
  {layer.kind==='text'&&<Field label="Text" count={{value:layer.text.length,max:500}}><Textarea rows={3} maxLength={500} value={layer.text} onChange={e=>onPatch({text:e.target.value,height:textHeight(layer,e.target.value)},'text:'+layer.id)}/></Field>}
  {layer.kind==='text'&&<Button size="sm" onClick={onType}>Type on the canvas</Button>}
  {layer.kind==='text'&&font&&<Field label="Font"><Select value={font} onChange={e=>onPatch({font:e.target.value})}>{!choices.some(c=>c.font===font)&&<option value={font}>{font}</option>}{choices.map(c=><option key={c.font} value={c.font}>{c.label}</option>)}</Select></Field>}
  {layer.kind==='text'&&<Field label="Size"><Input type="number" min={4} max={4000} value={layer.fontSize} onChange={e=>{const n=Number(e.target.value);if(n>=4&&n<=4000)onPatch({fontSize:n,height:textHeight({...layer,fontSize:n},layer.text)},'size:'+layer.id)}}/></Field>}
  {colourKey&&colour!==null&&<Field label="Colour"><span className="canvas-colours"><BrandSwatches value={colour} onPick={hex=>onPatch({[colourKey]:hex} as Partial<Layer>)}/><Input type="color" className="canvas-colour" aria-label="Any colour" value={colour==='transparent'?'#000000':colour} onChange={e=>onPatch({[colourKey]:e.target.value} as Partial<Layer>,'colour:'+layer.id)}/></span></Field>}
  <Field label="Rotation"><Input type="number" min={-360} max={360} value={layer.rotation} onChange={e=>{const n=Number(e.target.value);if(n>=-360&&n<=360)onPatch({rotation:n},'rotation:'+layer.id)}}/></Field>
  <div className="canvas-actions" role="group" aria-label="Order">
   <IconButton label="Bring to front (Ctrl+])" size="sm" onClick={()=>onOrder('front')}><BringToFront aria-hidden="true"/></IconButton>
   <IconButton label="Bring forward (])" size="sm" onClick={()=>onOrder('forward')}><ArrowUp aria-hidden="true"/></IconButton>
   <IconButton label="Send backward ([)" size="sm" onClick={()=>onOrder('backward')}><ArrowDown aria-hidden="true"/></IconButton>
   <IconButton label="Send to back (Ctrl+[)" size="sm" onClick={()=>onOrder('back')}><SendToBack aria-hidden="true"/></IconButton>
  </div>
  <div className="canvas-actions">
   <Button size="sm" icon={<Copy aria-hidden="true"/>} onClick={onDuplicate}>Duplicate</Button>
   <Button size="sm" kind="danger-quiet" icon={<Trash2 aria-hidden="true"/>} onClick={onRemove}>Delete</Button>
  </div>
 </section>;
}
