'use client';
import * as React from 'react';
import {Search} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {State} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {useBrandKit} from '@/components/brand/brand-kit';
import {addToCanvas,carryToCanvas,endCarry,type DropPoint} from '@/components/shell/shell-state';
import {canvasAddSaid,iconCanvasAdd} from '@/lib/elements';
import {iconLabel} from '@/lib/editor/icons';
import {ICON_SETS,iconsFor,readIconSet,type IconSetInfo,type LoadedIconSet,type SetIcon} from '@/lib/editor/icon-sets';
import type {BrandKit} from '@/lib/brand-kit';

// The editor's Icons panel (inside the shell's panel slot, components/shell/panels.tsx):
// the open icon sets as categories (lib/editor/icon-sets.ts, docs/icons.md),
// a search within the open one, and its icons in a grid that grows as it
// scrolls. A set's icons load from the Studio's own address (public/icons/)
// only when its category opens; no icon service is ever asked. Click an icon
// to add it to the middle of the page, or drag it onto the canvas: it lands as
// the editor's icon layer (its own vector paths), in the brand's first colour,
// recoloured from the right panel. Styles: app/elements.css ("Icons").

const PAGE=96,DEBOUNCE_MS=200,LOAD_MS=20_000;
// Each set's file once per page visit: the panel can close and open again without asking twice.
const sets=new Map<string,Promise<LoadedIconSet>>();
function loadSet(info:IconSetInfo):Promise<LoadedIconSet>{
 let p=sets.get(info.id);
 if(!p){
  p=fetch(info.file,{credentials:'same-origin',signal:AbortSignal.timeout(LOAD_MS)}).then(async r=>{
   if(!r.ok)throw new Error(String(r.status));
   const set=readIconSet(await r.json(),info);
   if(!set)throw new Error('shape');
   return set;
  });
  p.catch(e=>{sets.delete(info.id);console.warn('[icons] a set did not load',info.id,e instanceof Error?e.message:'unknown')});
  sets.set(info.id,p);
 }
 return p;
}

/** An icon drawn from its own paths on its set's grid (the same paths the design keeps). */
function IconArt({icon,grid}:{icon:SetIcon;grid:number}){
 return <svg className="icons-art" viewBox={`0 0 ${grid} ${grid}`} aria-hidden="true" focusable="false"
  {...(icon.fill?{fill:'currentColor'}:{fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const})}>
  {icon.paths.map((d,i)=><path key={i} d={d}/>)}
 </svg>;
}

function addFor(set:LoadedIconSet,icon:SetIcon,kit:BrandKit|null){
 const add=iconCanvasAdd({id:icon.name,name:iconLabel(icon.name)},icon.paths,kit);
 return add&&add.kind==='icon'?{...add,grid:set.grid,...(icon.fill?{fill:true}:{})}:null;
}

export function IconsPanel(){
 const {kit}=useBrandKit(),{toast}=useToast();
 const [setId,setSetId]=React.useState(ICON_SETS[0]?.id??'');
 const info=ICON_SETS.find(s=>s.id===setId)??ICON_SETS[0];
 // The last set that answered (or failed), for the attempt it answered: anything else is still loading.
 const [got,setGot]=React.useState<{id:string;attempt:number;set:LoadedIconSet|null}|null>(null),[attempt,setAttempt]=React.useState(0);
 const [typed,setTyped]=React.useState(''),[query,setQuery]=React.useState(''),[shown,setShown]=React.useState(PAGE);
 const grid=React.useRef<HTMLUListElement>(null),sentinel=React.useRef<HTMLDivElement>(null);
 const searchId=React.useId(),helpId=React.useId();

 // The open category's set loads now (once per page visit).
 React.useEffect(()=>{
  if(!info)return;let live=true;
  loadSet(info).then(set=>{if(live)setGot({id:info.id,attempt,set})},()=>{if(live)setGot({id:info.id,attempt,set:null})});
  return()=>{live=false};
 },[info,attempt]);
 React.useEffect(()=>{const t=window.setTimeout(()=>{setQuery(typed.trim());setShown(PAGE)},DEBOUNCE_MS);return()=>window.clearTimeout(t)},[typed]);

 const loaded=!info||!got||got.id!==info.id||got.attempt!==attempt?{kind:'loading' as const}:got.set?{kind:'ready' as const,set:got.set}:{kind:'error' as const};
 const set=loaded.kind==='ready'?loaded.set:null;
 const found=React.useMemo(()=>set?iconsFor(set,query):[],[set,query]);
 const visible=found.slice(0,shown),more=found.length>shown;

 // More icons as the end of the grid scrolls into view.
 React.useEffect(()=>{
  const end=sentinel.current;if(!end||!more)return;
  const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setShown(n=>n+PAGE)},{rootMargin:'0px 0px 300px 0px'});
  io.observe(end);return()=>io.disconnect();
 },[more,visible.length]);

 function add(icon:SetIcon,at?:DropPoint){
  if(!set)return;
  const one=addFor(set,icon,kit);
  if(!one){toast({message:'This icon can’t be added to the design.',kind:'bad'});return}
  const placed=at?{...one,at}:one;
  toast(canvasAddSaid(placed,addToCanvas(placed)));
 }
 function choose(id:string){setSetId(id);setTyped('');setQuery('');setShown(PAGE)}
 /** The arrow keys move through the grid (four a row); Home and End go to the first and last shown. */
 function onGridKey(e:React.KeyboardEvent<HTMLUListElement>){
  const buttons=[...(grid.current?.querySelectorAll<HTMLButtonElement>('button.icons-add')??[])],at=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(at<0)return;
  const cols=Math.max(1,Math.round((grid.current?.clientWidth??0)/Math.max(1,buttons[0]?.offsetWidth??1)));
  const to={ArrowRight:at+1,ArrowLeft:at-1,ArrowDown:at+cols,ArrowUp:at-cols,Home:0,End:buttons.length-1}[e.key];
  if(to===undefined)return;
  e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,to))]?.focus();
 }

 if(!info)return <State kind="empty" title="No icons yet">The icon sets aren’t part of this Studio.</State>;
 return <div className="icons-panel">
  <div className="elements-bar" role="group" aria-label="Icon sets">
   {ICON_SETS.map(s=><button key={s.id} type="button" className="ds-chip" aria-pressed={s.id===info.id} onClick={()=>choose(s.id)}>{s.label}</button>)}
  </div>
  <form role="search" onSubmit={e=>{e.preventDefault();setQuery(typed.trim());setShown(PAGE)}}>
   <label className="ds-search" htmlFor={searchId}><Search aria-hidden="true"/><span className="ds-sr-only">{`Search ${info.label} icons`}</span>
    <input id={searchId} className="ds-input" type="search" value={typed} maxLength={60} placeholder={`Search ${info.label}`} aria-describedby={helpId}
     onChange={e=>setTyped(e.target.value)}
     onKeyDown={e=>{if(e.key==='ArrowDown'){const first=grid.current?.querySelector<HTMLButtonElement>('button.icons-add');if(first){e.preventDefault();first.focus()}}}}/>
   </label>
  </form>
  <p className="ds-help" id={helpId} role="status">{loaded.kind==='loading'?`Loading ${info.label}…`
   :loaded.kind==='error'?`${info.label} didn’t load.`
   :query&&!found.length?`No ${info.label} icons match “${query}”.`
   :query?`${found.length.toLocaleString('en')} ${found.length===1?'icon matches':'icons match'} “${query}”.`
   :`${info.style} · ${info.count.toLocaleString('en')} icons. Click one to add it, or drag it onto the canvas.`}</p>
  {loaded.kind==='loading'?<ul className="icons-grid" aria-busy="true" aria-label={`Loading ${info.label}`}>{Array.from({length:24},(_,i)=><li key={i} aria-hidden="true"><span className="ds-skel icons-skeleton"/></li>)}</ul>
   :loaded.kind==='error'?<State kind="error" title={`${info.label} didn’t load`} actions={<Button size="sm" onClick={()=>setAttempt(a=>a+1)}>Try again</Button>}>Check your connection and try again.</State>
   :query&&!found.length?<State kind="empty" title={`No icons match “${query}”`}>Try a shorter word, or another set above.</State>
   :set&&<>
    <ul ref={grid} className="icons-grid" aria-label={query?`${info.label} icons for ${query}`:`${info.label} icons`} onKeyDown={onGridKey}>
     {visible.map(icon=>{const label=iconLabel(icon.name);return <li key={icon.name}>
      <button type="button" className="icons-add" aria-label={`Add the ${label.toLowerCase()} icon`} title={label} data-icon={icon.name}
       draggable onDragStart={e=>carryToCanvas(e,label,point=>add(icon,point))} onDragEnd={endCarry} onClick={()=>add(icon)}>
       <IconArt icon={icon} grid={set.grid}/>
      </button>
     </li>})}
    </ul>
    <div ref={sentinel} className="photos-end">{more&&<Button size="sm" kind="quiet" onClick={()=>setShown(n=>n+PAGE)}>Show more icons</Button>}</div>
   </>}
  <p className="ds-help">{info.label}: <a className="ds-link" href={info.licenceFile} target="_blank" rel="noopener noreferrer">{info.licence} licence</a></p>
 </div>;
}
