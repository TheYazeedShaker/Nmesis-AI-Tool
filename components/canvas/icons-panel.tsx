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
import {ICON_INDEX_FILE,ICON_SETS,iconSet,readIconChunk,readIconIndex,readIconSet,searchAllSets,type IconHit,type IconIndex,type IconSetInfo,type LoadedIconSet,type SetIcon} from '@/lib/editor/icon-sets';
import type {BrandKit} from '@/lib/brand-kit';

// The editor's Icons panel (inside the shell's panel slot, components/shell/panels.tsx).
// With the search box empty: the open icon sets as categories for browsing
// (lib/editor/icon-sets.ts, docs/icons.md), the open one's icons in a grid
// that grows as it scrolls; a set's file loads only when its category opens.
// Typing searches every set at once: one list, each result labelled with its
// set, exact names first. The search reads a small index of names and tags
// (no drawings), loaded the first time someone searches; each result loads its
// drawing (its set's chunk) only when it scrolls into view. Everything comes
// from the Studio's own address (public/icons/); no icon service is ever asked.
// Click an icon to add it to the middle of the page, or drag it onto the
// canvas: it lands as the editor's icon layer (its own vector paths), in the
// brand's first colour, recoloured from the right panel. Styles: app/elements.css ("Icons").

const PAGE=96,DEBOUNCE_MS=200,LOAD_MS=20_000;
/** A file of the Studio's own, once per page visit (the panel can close and open again without asking twice). */
function once<T>(cache:Map<string,Promise<T>>,key:string,url:string,read:(raw:unknown)=>T|null):Promise<T>{
 let p=cache.get(key);
 if(!p){
  p=fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(LOAD_MS)}).then(async r=>{
   if(!r.ok)throw new Error(String(r.status));
   const v=read(await r.json());
   if(v===null)throw new Error('shape');
   return v;
  });
  p.catch(e=>{cache.delete(key);console.warn('[icons] a file did not load',key,e instanceof Error?e.message:'unknown')});
  cache.set(key,p);
 }
 return p;
}
const sets=new Map<string,Promise<LoadedIconSet>>(),indexes=new Map<string,Promise<IconIndex>>(),chunks=new Map<string,Promise<SetIcon[]>>();
const loadSet=(info:IconSetInfo)=>once(sets,info.id,info.file,raw=>readIconSet(raw,info));
const loadIndex=()=>once(indexes,'index',ICON_INDEX_FILE,readIconIndex);
/** The chunk holding a search result's drawing. */
const loadChunk=(set:string,n:number)=>once(chunks,`${set}:${n}`,`/icons/${set}/${n}.json`,raw=>{const icons=readIconChunk(raw);return icons.length?icons:null});

/** An icon drawn from its own paths on its set's grid (the same paths the design keeps). */
function IconArt({icon,grid}:{icon:SetIcon;grid:number}){
 return <svg className="icons-art" viewBox={`0 0 ${grid} ${grid}`} aria-hidden="true" focusable="false"
  {...(icon.fill?{fill:'currentColor'}:{fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const})}>
  {icon.paths.map((d,i)=><path key={i} d={d}/>)}
 </svg>;
}

function addFor(grid:number,icon:SetIcon,kit:BrandKit|null){
 const add=iconCanvasAdd({id:icon.name,name:iconLabel(icon.name)},icon.paths,kit);
 return add&&add.kind==='icon'?{...add,grid,...(icon.fill?{fill:true}:{})}:null;
}

/** One result of the search across every set: labelled with its set; its drawing loads when it scrolls into view
 *  (a click or a drag before then waits for it). */
function SearchTile({hit,info,chunk,onAdd}:{hit:IconHit;info:IconSetInfo;chunk:number;onAdd:(grid:number,icon:SetIcon|Promise<SetIcon|null>,at?:DropPoint)=>void}){
 const ref=React.useRef<HTMLButtonElement>(null),[icon,setIcon]=React.useState<SetIcon|null>(null);
 const fetchIcon=React.useCallback(()=>loadChunk(hit.set,Math.floor(hit.at/chunk)).then(list=>list.find(i=>i.name===hit.name)??null),[hit,chunk]);
 React.useEffect(()=>{
  const el=ref.current;if(!el)return;let live=true;
  const io=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;io.disconnect();fetchIcon().then(i=>{if(live)setIcon(i)},()=>{/* said when added */})},{rootMargin:'200px 0px'});
  io.observe(el);return()=>{live=false;io.disconnect()};
 },[fetchIcon]);
 const label=iconLabel(hit.name);
 return <li>
  <button ref={ref} type="button" className="icons-add" data-set={hit.set} data-icon={hit.name} aria-label={`Add the ${label.toLowerCase()} icon from ${info.label}`} title={`${label} · ${info.label}`}
   draggable onDragStart={e=>carryToCanvas(e,label,point=>onAdd(info.grid,icon??fetchIcon(),point))} onDragEnd={endCarry} onClick={()=>onAdd(info.grid,icon??fetchIcon())}>
   {icon?<IconArt icon={icon} grid={info.grid}/>:<span className="ds-skel icons-skeleton" aria-hidden="true"/>}
   <span className="icons-set" aria-hidden="true">{info.label}</span>
  </button>
 </li>;
}

export function IconsPanel(){
 const {kit}=useBrandKit(),{toast}=useToast();
 const [setId,setSetId]=React.useState(ICON_SETS[0]?.id??'');
 const info=ICON_SETS.find(s=>s.id===setId)??ICON_SETS[0];
 // The last answer (a set, or the search index), for the attempt it answered: anything else is still loading.
 const [got,setGot]=React.useState<{id:string;attempt:number;set:LoadedIconSet|null}|null>(null),[attempt,setAttempt]=React.useState(0);
 const [gotIndex,setGotIndex]=React.useState<{attempt:number;index:IconIndex|null}|null>(null);
 const [typed,setTyped]=React.useState(''),[query,setQuery]=React.useState(''),[shown,setShown]=React.useState(PAGE);
 const grid=React.useRef<HTMLUListElement>(null),sentinel=React.useRef<HTMLDivElement>(null);
 const searchId=React.useId(),helpId=React.useId();
 const searching=!!query;

 // Browsing: the open category's set loads now (once per page visit).
 React.useEffect(()=>{
  if(!info||searching)return;let live=true;
  loadSet(info).then(set=>{if(live)setGot({id:info.id,attempt,set})},()=>{if(live)setGot({id:info.id,attempt,set:null})});
  return()=>{live=false};
 },[info,attempt,searching]);
 // Searching: the index of every set loads the first time.
 React.useEffect(()=>{
  if(!searching)return;let live=true;
  loadIndex().then(index=>{if(live)setGotIndex({attempt,index})},()=>{if(live)setGotIndex({attempt,index:null})});
  return()=>{live=false};
 },[searching,attempt]);
 React.useEffect(()=>{const t=window.setTimeout(()=>{setQuery(typed.trim());setShown(PAGE)},DEBOUNCE_MS);return()=>window.clearTimeout(t)},[typed]);

 const loaded=searching
  ?(!gotIndex||gotIndex.attempt!==attempt?{kind:'loading' as const}:gotIndex.index?{kind:'ready' as const}:{kind:'error' as const})
  :(!info||!got||got.id!==info.id||got.attempt!==attempt?{kind:'loading' as const}:got.set?{kind:'ready' as const}:{kind:'error' as const});
 const set=!searching&&got?.set&&got.id===info?.id?got.set:null;
 const index=searching&&gotIndex?.index?gotIndex.index:null;
 const hits=React.useMemo(()=>index?searchAllSets(index,query):[],[index,query]);
 const total=searching?hits.length:set?.icons.length??0,more=total>shown;

 // More as the end of the grid scrolls into view.
 React.useEffect(()=>{
  const end=sentinel.current;if(!end||!more)return;
  const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setShown(n=>n+PAGE)},{rootMargin:'0px 0px 300px 0px'});
  io.observe(end);return()=>io.disconnect();
 },[more,shown]);

 async function add(grid:number,which:SetIcon|Promise<SetIcon|null>,at?:DropPoint){
  const icon=await Promise.resolve(which).catch(()=>null);
  const one=icon?addFor(grid,icon,kit):null;
  if(!one){toast({message:'This icon can’t be added to the design. Try again.',kind:'bad'});return}
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
 const what=searching?'the icon search':info.label;
 return <div className="icons-panel">
  <div className="elements-bar" role="group" aria-label="Icon sets">
   {ICON_SETS.map(s=><button key={s.id} type="button" className="ds-chip" aria-pressed={!searching&&s.id===info.id} onClick={()=>choose(s.id)}>{s.label}</button>)}
  </div>
  <form role="search" onSubmit={e=>{e.preventDefault();setQuery(typed.trim());setShown(PAGE)}}>
   <label className="ds-search" htmlFor={searchId}><Search aria-hidden="true"/><span className="ds-sr-only">Search icons</span>
    <input id={searchId} className="ds-input" type="search" value={typed} maxLength={60} placeholder="Search all icons" aria-describedby={helpId}
     onChange={e=>setTyped(e.target.value)}
     onKeyDown={e=>{if(e.key==='ArrowDown'){const first=grid.current?.querySelector<HTMLButtonElement>('button.icons-add');if(first){e.preventDefault();first.focus()}}}}/>
   </label>
  </form>
  <p className="ds-help" id={helpId} role="status">{loaded.kind==='loading'?(searching?'Searching every set…':`Loading ${info.label}…`)
   :loaded.kind==='error'?`${searching?'The icon search':info.label} didn’t load.`
   :searching&&!hits.length?`No icons match “${query}” in any set.`
   :searching?`${hits.length.toLocaleString('en')} ${hits.length===1?'icon matches':'icons match'} “${query}” across every set.`
   :`${info.style} · ${info.count.toLocaleString('en')} icons. Click one to add it, or drag it onto the canvas.`}</p>
  {loaded.kind==='loading'?<ul className="icons-grid" aria-busy="true" aria-label={`Loading ${what}`}>{Array.from({length:24},(_,i)=><li key={i} aria-hidden="true"><span className="ds-skel icons-skeleton"/></li>)}</ul>
   :loaded.kind==='error'?<State kind="error" title={`${searching?'The icon search':info.label} didn’t load`} actions={<Button size="sm" onClick={()=>setAttempt(a=>a+1)}>Try again</Button>}>Check your connection and try again.</State>
   :searching&&!hits.length?<State kind="empty" title={`No icons match “${query}”`}>Try a shorter or different word, such as “car” or “road”.</State>
   :<>
    <ul ref={grid} className="icons-grid" aria-label={searching?`Icons for ${query}, from every set`:`${info.label} icons`} onKeyDown={onGridKey}>
     {searching&&index?hits.slice(0,shown).map(hit=>{const from=iconSet(hit.set);return from?<SearchTile key={hit.set+':'+hit.name} hit={hit} info={from} chunk={index.chunk} onAdd={(g,i,at)=>void add(g,i,at)}/>:null})
      :set?.icons.slice(0,shown).map(icon=>{const label=iconLabel(icon.name);return <li key={icon.name}>
       <button type="button" className="icons-add" aria-label={`Add the ${label.toLowerCase()} icon`} title={label} data-icon={icon.name}
        draggable onDragStart={e=>carryToCanvas(e,label,point=>void add(set.grid,icon,point))} onDragEnd={endCarry} onClick={()=>void add(set.grid,icon)}>
        <IconArt icon={icon} grid={set.grid}/>
       </button>
      </li>})}
    </ul>
    <div ref={sentinel} className="photos-end">{more&&<Button size="sm" kind="quiet" onClick={()=>setShown(n=>n+PAGE)}>Show more icons</Button>}</div>
   </>}
  {!searching&&<p className="ds-help">{info.label}: <a className="ds-link" href={info.licenceFile} target="_blank" rel="noopener noreferrer">{info.licence} licence</a></p>}
 </div>;
}
