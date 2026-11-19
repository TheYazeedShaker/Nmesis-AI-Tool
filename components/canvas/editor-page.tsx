'use client';
import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowDown,ArrowLeft,ArrowUp,BringToFront,Copy,Download,Monitor,Redo2,Save,SendToBack,Share2,Trash2,Undo2} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Field,Input,Textarea} from '@/components/ds/field';
import {Loading,State} from '@/components/ds/feedback';
import {Menu,MenuItem} from '@/components/ds/menu';
import {useToast} from '@/components/ds/toast';
import {AccountNotices,useAccount} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {SharePanel} from '@/components/share/share-panel';
import {closePanel,setCanvasSink} from '@/components/shell/shell-state';
import {can} from '@/lib/accounts/can';
import {studioFetch} from '@/lib/studio-fetch';
import type {Visual} from '@/lib/studio';
import {addLayer,commit,createDoc,duplicateLayer,exportPixelRatio,nudge,redo,removeLayer,reorder,startHistory,undo,updateLayer,type CanvasAdd,type EditorDoc,type History,type Layer} from '@/lib/editor/doc';
import {editFileName,EDITS_PATH} from '@/lib/editor/save';
import {loadImage} from './images';
import type {StageHandle} from './stage';

// The canvas editor (/editor?visual=<id>): a generated picture on a canvas,
// with the shell's Brand, Elements, Text and Uploads panels adding to it.
// Select, move, resize and rotate on the canvas or from the Layers list; the
// arrow keys move (Shift: ten times further), Delete removes, Ctrl+Z / Ctrl+Y
// undo and redo, Ctrl+D duplicates, [ and ] change the order. Save makes a new
// version (the original stays as it was); Duplicate saves a separate copy;
// Download exports PNG or JPG at the picture's full resolution. Phones get a
// note instead: the editor needs a larger screen.
const CanvasStage=dynamic(()=>import('./stage'),{ssr:false,loading:()=><Loading label="Opening the canvas"><div className="canvas-skeleton"/></Loading>});
const VISUAL_ID=/^[a-z0-9-]{8,80}$/;

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

type Loaded={kind:'loading'}|{kind:'error';message:string}|{kind:'ready';visual:Visual};
function useVisual(id:string|null):Loaded{
 const [state,setState]=React.useState<{id:string;loaded:Loaded}>({id:'',loaded:{kind:'loading'}});
 React.useEffect(()=>{
  if(!id||!VISUAL_ID.test(id))return;let live=true;
  studioFetch('/api/visuals/'+id,{signal:AbortSignal.timeout(20_000)})
   .then(async r=>{const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};if(!r.ok||!d.visual)throw new Error(d.error||'This picture could not be opened.');return d.visual})
   .then(async v=>{
    if(v.status!=='ready')throw new Error('This picture is not finished yet, so it can’t be edited.');
    // An older picture may not say its size: read it from the picture itself.
    if(!(v.width&&v.height)){const img=await loadImage(v.src);v={...v,width:img.naturalWidth,height:img.naturalHeight}}
    if(live)setState({id,loaded:{kind:'ready',visual:v}});
   })
   .catch((e:unknown)=>{if(live)setState({id,loaded:{kind:'error',message:e instanceof Error&&e.name!=='TimeoutError'?e.message:'This picture could not be opened. Try again.'}})});
  return()=>{live=false};
 },[id]);
 if(!id||!VISUAL_ID.test(id))return {kind:'error',message:'Choose a picture to edit: open one of your key visuals or line-ups and click it.'};
 return state.id===id?state.loaded:{kind:'loading'};
}

export function EditorPage(){
 const params=useSearchParams(),id=params.get('visual'),loaded=useVisual(id),narrow=useNarrow();
 // Phones have no editor: no editor panels either, and the navigation is the usual one.
 React.useEffect(()=>{if(narrow)closePanel()},[narrow]);
 return <WorkspaceFrame current={narrow?'projects':'editor'} bleed={!narrow} notices={<AccountNotices variant="ds"/>}>
  {narrow?<PhoneNote id={id}/>
   :loaded.kind==='loading'?<Loading label="Opening your picture" className="canvas-editor"><div className="canvas-skeleton"/></Loading>
   :loaded.kind==='error'?<div className="canvas-editor canvas-editor-state"><State kind="error" title="Can’t open the editor" actions={<Link className="ds-btn" href="/library">Go to Projects</Link>}>{loaded.message}</State></div>
   :<Editor key={loaded.visual.id} visual={loaded.visual}/>}
 </WorkspaceFrame>;
}

function PhoneNote({id}:{id:string|null}){
 return <div className="canvas-phone-note">
  <State kind="empty" icon={<Monitor/>} title="Edit on a larger screen" actions={<Link className="ds-btn" href={id&&VISUAL_ID.test(id)?'/library?open='+id:'/library'}>Back to the picture</Link>}>
   The editor needs a tablet or a computer to place logos and text precisely. Your picture is safe in Projects.
  </State>
 </div>;
}

const LAYER_KIND:Record<Layer['kind'],string>={image:'Picture',text:'Text',shape:'Shape',line:'Line',frame:'Frame'};

function Editor({visual}:{visual:Visual}){
 const account=useAccount(),toaster=useToast(),reduced=useReducedMotion(),router=useRouter();
 const mayEdit=can(account,'work.create');
 const [history,setHistory]=React.useState<History<EditorDoc>>(()=>startHistory(createDoc({id:visual.id,src:visual.src,width:visual.width||1,height:visual.height||1})));
 const doc=history.present;
 const [selected,setSelected]=React.useState<string|null>(null);
 const [saved,setSaved]=React.useState<{visual:Visual;doc:EditorDoc}|null>(null);
 const [busy,setBusy]=React.useState<''|'save'|'copy'|'download'>('');
 const [sharing,setSharing]=React.useState(false);
 const canvasBox=React.useRef<HTMLDivElement>(null),handle=React.useRef<StageHandle>({stage:null,ui:null});
 // The box has its final size from the first paint (app/canvas.css: the picture's shape, fitted to the
 // space); the stage takes the box's measured width, so nothing moves when the canvas appears.
 const shownWidth=Math.floor(useSize(canvasBox).width);
 const change=React.useCallback((next:(d:EditorDoc)=>EditorDoc)=>setHistory(h=>commit(h,next(h.present))),[]);
 const layer=doc.layers.find(l=>l.id===selected)||null;
 const dirty=saved?saved.doc!==doc:doc.layers.length>0;

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
  if(mod&&k==='d'){e.preventDefault();const id=crypto.randomUUID();change(d=>duplicateLayer(d,selected,id));setSelected(id);return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();change(d=>removeLayer(d,selected));setSelected(null);return}
  if(e.key==='Escape'){setSelected(null);return}
  if(e.key===']'||e.key==='['){e.preventDefault();change(d=>reorder(d,selected,e.key===']'?(mod?'front':'forward'):(mod?'back':'backward')));return}
  const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  const a=arrows[e.key];if(a){e.preventDefault();const by=step*(e.shiftKey?10:1);change(d=>nudge(d,selected,a[0]*by,a[1]*by))}
 }

 /** The design at the picture's own size, without the handles or guides. */
 async function exportBlob(type:'image/png'|'image/jpeg'):Promise<Blob>{
  const {stage,ui}=handle.current;if(!stage||!shownWidth)throw new Error('The canvas isn’t ready yet.');
  const ratio=exportPixelRatio(doc,shownWidth),scale=shownWidth/doc.width;
  ui?.hide();
  try{
   const blob=await stage.toBlob({x:0,y:0,width:doc.width*scale,height:doc.height*scale,pixelRatio:ratio,mimeType:type,quality:0.92}) as Blob|null;
   if(!blob)throw new Error('The design could not be exported. Try again.');
   return blob;
  }finally{ui?.show()}
 }
 async function save(copy:boolean){
  if(busy)return;setBusy(copy?'copy':'save');
  try{
   const blob=await exportBlob('image/png'),form=new FormData();
   form.set('parentId',visual.id);form.set('doc',JSON.stringify(doc));if(copy)form.set('copy','1');
   form.set('image',new File([blob],editFileName(visual.title,'png',copy),{type:'image/png'}));
   const r=await studioFetch(EDITS_PATH,{method:'POST',body:form});const d=await r.json().catch(()=>({})) as {visual?:Visual;error?:string};
   if(!r.ok||!d.visual)throw new Error(d.error||'Your design could not be saved. Try again.');
   if(!copy)setSaved({visual:d.visual,doc});
   toaster.toast({kind:'ok',message:copy?'Saved a copy in Projects.':'Saved as a new version. The original is unchanged.',action:{label:'Open in Projects',run:()=>router.push('/library?open='+d.visual!.id)}});
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

 return <div className="canvas-editor">
  <div className="canvas-bar">
   <Link className="ds-btn icon sm quiet" href={'/library?open='+visual.id} aria-label="Back to the picture" title="Back to the picture"><ArrowLeft aria-hidden="true"/></Link>
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
    <div className="canvas-fit">
    <div ref={canvasBox} className="canvas-box" tabIndex={0} role="application" aria-roledescription="design canvas" aria-label={`Canvas, ${doc.layers.length} ${doc.layers.length===1?'layer':'layers'}${layer?`, ${layer.name} selected`:''}`} aria-describedby="canvas-keys" onKeyDown={onKey} style={{['--canvas-ratio' as string]:String(doc.width/doc.height)} as React.CSSProperties}>
     {shownWidth>0&&<CanvasStage doc={doc} shownWidth={shownWidth} selected={selected} reducedMotion={reduced} handle={handle} onSelect={setSelected} onChange={(lid,patch)=>change(d=>updateLayer(d,lid,patch))}/>}
    </div>
    </div>
    <p className="ds-help canvas-keys" id="canvas-keys">Add from Brand, Elements, Text or Uploads on the left. Arrow keys move (Shift: further), Delete removes, Ctrl+D duplicates, [ and ] change the order, Ctrl+Z undoes.</p>
   </div>
   <aside className="canvas-inspector" aria-label="Design">
    <section className="canvas-section" aria-labelledby="canvas-layers-title">
     <h2 className="canvas-section-title" id="canvas-layers-title">Layers</h2>
     {doc.layers.length===0?<p className="ds-help">Nothing added yet. Open Brand, Elements, Text or Uploads on the left and click what you want.</p>
      :<ol className="canvas-layers">{[...doc.layers].reverse().map(l=><li key={l.id}>
        <button type="button" className="canvas-layer" aria-pressed={l.id===selected} onClick={()=>{setSelected(l.id);canvasBox.current?.focus({preventScroll:true})}}>
         <span className="canvas-layer-kind">{LAYER_KIND[l.kind]}</span><span className="ds-truncate" title={l.kind==='text'?l.text:l.name}>{l.kind==='text'?l.text:l.name}</span>
        </button>
       </li>)}<li><span className="canvas-layer canvas-layer-base"><span className="canvas-layer-kind">Picture</span><span className="ds-truncate" title={visual.title}>Your picture (kept as it is)</span></span></li></ol>}
    </section>
    {layer&&<LayerSettings key={layer.id} layer={layer} onPatch={patch=>change(d=>updateLayer(d,layer.id,patch))}
     onOrder={to=>change(d=>reorder(d,layer.id,to))} onDuplicate={()=>{const id=crypto.randomUUID();change(d=>duplicateLayer(d,layer.id,id));setSelected(id)}} onRemove={()=>{change(d=>removeLayer(d,layer.id));setSelected(null)}}/>}
   </aside>
  </div>
  <SharePanel open={sharing} onClose={()=>setSharing(false)} item={{kind:'visual',id:shareTarget.id,title:shareTarget.title,src:shareTarget.src,mine:shareTarget.mine!==false}}/>
 </div>;
}

function LayerSettings({layer,onPatch,onOrder,onDuplicate,onRemove}:{layer:Layer;onPatch:(p:Partial<Layer>)=>void;onOrder:(to:'forward'|'backward'|'front'|'back')=>void;onDuplicate:()=>void;onRemove:()=>void}){
 const colourKey=layer.kind==='text'?'color':layer.kind==='shape'?'fill':layer.kind==='image'?null:'stroke';
 const colour=colourKey?(layer as unknown as Record<string,string>)[colourKey]:null;
 return <section className="canvas-section" aria-labelledby="canvas-selected-title">
  <h2 className="canvas-section-title" id="canvas-selected-title">{LAYER_KIND[layer.kind]}</h2>
  {layer.kind==='text'&&<Field label="Text" count={{value:layer.text.length,max:500}}><Textarea rows={3} maxLength={500} value={layer.text} onChange={e=>onPatch({text:e.target.value})}/></Field>}
  {layer.kind==='text'&&<Field label="Size"><Input type="number" min={4} max={4000} value={layer.fontSize} onChange={e=>{const n=Number(e.target.value);if(n>=4&&n<=4000)onPatch({fontSize:n})}}/></Field>}
  {colourKey&&colour!==null&&<Field label="Colour"><Input type="color" className="canvas-colour" value={colour==='transparent'?'#000000':colour} onChange={e=>onPatch({[colourKey]:e.target.value} as Partial<Layer>)}/></Field>}
  <Field label="Rotation"><Input type="number" min={-360} max={360} value={layer.rotation} onChange={e=>{const n=Number(e.target.value);if(n>=-360&&n<=360)onPatch({rotation:n})}}/></Field>
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
