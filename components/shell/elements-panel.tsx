'use client';
import * as React from 'react';
import Link from 'next/link';
import {Award,BatteryCharging,Camera,Car,CarFront,Flag,Fuel,Gauge,KeyRound,Leaf,MapPin,Moon,Mountain,Navigation,Percent,PlugZap,Route,ShieldCheck,Snowflake,Sparkles,Star,Sun,Tag,Timer,Trophy,Wrench,Zap,type LucideIcon} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Loading,SkeletonTile} from '@/components/ds/feedback';
import {useToast} from '@/components/ds/toast';
import {useBrandKit} from '@/components/brand/brand-kit';
import {useAccount} from '@/components/studio-account';
import {can} from '@/lib/accounts/can';
import {NOT_YET,type BrandKit} from '@/lib/brand-kit';
import {ALL_PREVIEW,ELEMENT_CATEGORIES,canvasAddFor,canvasAddSaid,elementsIn,imageSize,logoCanvasAdd,textStyleFont,type ElementCategory,type ElementGroup,type ElementGroupId,type ElementItem,type FrameElement,type IconId,type LineId,type ShapeId} from '@/lib/elements';
import {addToCanvas,useShell} from './shell-state';

// The Elements panel's body (the shell around it draws the "Elements" header,
// the close button and, on phones, the drawer). A category bar that scrolls
// sideways inside itself and stays at the top, and a grid under it: "All" in
// labelled groups with "See all", or one category. Logos are the company's
// brand-kit logos. Outside the canvas editor the panel only shows and filters,
// so the elements are pictures with names, not buttons. Inside it (a canvas
// sink is registered, components/shell/shell-state.ts) it lists what the
// editor can add, and one press adds it; icons are shown but not added yet.
// Data, the filter and what each element adds: lib/elements.ts.
// Styles: app/elements.css.

const NOTE='Adding elements to a picture comes with the editor.';
const DESIGN_NOTE='Click an element to add it to your design.';
const ICONS_NOTE='Icons can’t be added to a design yet.';

const ICON:Record<IconId,LucideIcon>={
 car:Car,'car-front':CarFront,gauge:Gauge,fuel:Fuel,zap:Zap,'battery-charging':BatteryCharging,'plug-zap':PlugZap,
 'map-pin':MapPin,route:Route,navigation:Navigation,'key-round':KeyRound,'shield-check':ShieldCheck,wrench:Wrench,
 timer:Timer,trophy:Trophy,award:Award,star:Star,sparkles:Sparkles,sun:Sun,moon:Moon,mountain:Mountain,
 snowflake:Snowflake,camera:Camera,tag:Tag,percent:Percent,flag:Flag,leaf:Leaf,
};

// Drawn on a 48 × 48 grid in the text colour (currentColor), so they follow the theme.
const SHAPE:Record<ShapeId,React.ReactNode>={
 rectangle:<rect x="4" y="11" width="40" height="26"/>,
 'rounded-rectangle':<rect x="4" y="11" width="40" height="26" rx="7"/>,
 circle:<circle cx="24" cy="24" r="20"/>,
 triangle:<polygon points="24,5 44,41 4,41"/>,
 diamond:<polygon points="24,3 45,24 24,45 3,24"/>,
 pentagon:<polygon points="24,4 44,18.5 36.3,42 11.7,42 4,18.5"/>,
 hexagon:<polygon points="45,24 34.5,42.2 13.5,42.2 3,24 13.5,5.8 34.5,5.8"/>,
 star:<polygon points="24,4 29,18.1 44,18.5 32.1,27.6 36.3,42 24,33.5 11.7,42 15.9,27.6 4,18.5 19,18.1"/>,
 arrow:<polygon points="4,18 26,18 26,8 44,24 26,40 26,30 4,30"/>,
 'speech-bubble':<path d="M10 7h28a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H22l-10 8v-8h-2a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6z"/>,
 heart:<path d="M24 42C10 32 4 25 4 17a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 8-6 15-20 25z"/>,
 cross:<path d="M18 4h12v14h14v12H30v14H18V30H4V18h14z"/>,
};
const LINE:Record<LineId,React.ReactNode>={
 line:<path d="M4 24h40"/>,
 'thick-line':<path d="M6 24h36" strokeWidth={6}/>,
 'dashed-line':<path d="M4 24h40" strokeDasharray="7 5" strokeLinecap="butt"/>,
 'dotted-line':<path d="M6 24h36" strokeDasharray="0 6"/>,
 'arrow-line':<path d="M4 24h38M33 15l9 9-9 9"/>,
 'double-arrow-line':<path d="M6 24h36M15 15l-9 9 9 9M33 15l9 9-9 9"/>,
 'curved-line':<path d="M4 36C14 8 34 40 44 12"/>,
 'elbow-line':<path d="M4 12h20v24h20"/>,
 'wavy-line':<path d="M4 24q5-10 10 0t10 0t10 0t10 0"/>,
};
function FrameShape({frame}:{frame:FrameElement}){
 if(frame.shape==='circle')return <circle cx="24" cy="24" r="19"/>;
 const [w,h]=frame.ratio,scale=38/Math.max(w,h),fw=w*scale,fh=h*scale;
 return <rect x={24-fw/2} y={24-fh/2} width={fw} height={fh} rx={frame.shape==='rounded'?8:1.5}/>;
}

type Drawn=Exclude<ElementItem,{kind:'text'|'logo'}>;
function Art({item}:{item:Drawn}){
 switch(item.kind){
  case 'shape':return <svg className="elements-art" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" focusable="false">{SHAPE[item.id]}</svg>;
  case 'line':return <svg className="elements-art" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{LINE[item.id]}</svg>;
  case 'frame':return <>
   <svg className="elements-art" viewBox="0 0 48 48" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" aria-hidden="true" focusable="false"><FrameShape frame={item}/></svg>
   <span className="elements-frame-label" aria-hidden="true">{item.label}</span>
  </>;
  case 'icon':{const Icon=ICON[item.id];return <Icon className="elements-icon" aria-hidden="true" focusable="false"/>}
 }
}

/** One element inside the editor: a button that adds it to the design (icons
 *  stay a picture with a name, as outside). The preview inside is the same. */
function AddElement({item,kit}:{item:ElementItem;kit:BrandKit|null}){
 const {toast}=useToast();
 const add=canvasAddFor(item,kit);
 if(!add)return <Element item={item} kit={kit}/>;
 function press(e:React.MouseEvent<HTMLButtonElement>){
  // A logo goes on at its own size once its picture has loaded.
  const now=item.kind==='logo'?logoCanvasAdd(item,imageSize(e.currentTarget.querySelector('img'))):add;
  if(now)toast(canvasAddSaid(now,addToCanvas(now)));
 }
 if(item.kind==='text'){
  const font=textStyleFont(item,kit);
  return <li className="elements-item">
   <button type="button" className="elements-text elements-text-add"aria-label={`Add ${item.name.toLowerCase()} text${font?` in ${font}`:''} to the design`} onClick={press}>
    <span className="elements-text-sample" data-style={item.id}>{item.name}</span>
    {font&&<span className="elements-text-font">{font}</span>}
   </button>
  </li>;
 }
 return <li className="elements-item">
  <button type="button" className="elements-add" aria-label={`Add ${item.name} to the design`} title={item.name} onClick={press}>
   {item.kind==='logo'
    ?<span className="elements-tile" data-kind="logo" data-theme="light">
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed same-origin link */}
     <img src={item.url} alt="" loading="lazy" decoding="async"/>
    </span>
    :<span className="elements-tile" data-kind={item.kind}><Art item={item}/></span>}
  </button>
 </li>;
}

/** One element: a preview with a name (role="img" + aria-label, or the logo's alt). Not a button. */
function Element({item,kit}:{item:ElementItem;kit:BrandKit|null}){
 if(item.kind==='text'){
  const font=textStyleFont(item,kit);
  return <li className="elements-text">
   <span className="elements-text-sample" data-style={item.id}>{item.name}</span>
   <span className="ds-sr-only"> text style</span>
   {font&&<span className="elements-text-font">{font}</span>}
  </li>;
 }
 if(item.kind==='logo')return <li className="elements-item">
  {/* Light in both themes, as on the Brand kit page: most logos are dark. */}
  <div className="elements-tile" data-kind="logo" data-theme="light" title={item.name}>
   {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed same-origin link */}
   <img src={item.url} alt={item.name} loading="lazy" decoding="async"/>
  </div>
 </li>;
 return <li className="elements-item">
  <div className="elements-tile" data-kind={item.kind} role="img" aria-label={item.name} title={item.name}><Art item={item}/></div>
 </li>;
}

type Kit={kit:BrandKit|null;error:string;reload:()=>Promise<void>};

/** The Logos group with nothing to show: loading, not loaded, not ready, or empty. */
function LogosState({kit,error,reload,count,mayEdit}:Kit&{count:number;mayEdit:boolean}){
 if(!kit&&error)return <div className="elements-empty">
  <p>The brand kit didn’t load.</p>
  <Button size="sm" onClick={()=>void reload()}>Try again</Button>
 </div>;
 if(!kit)return <Loading label="Loading your logos" className="elements-grid">{Array.from({length:count},(_,i)=><SkeletonTile key={i}/>)}</Loading>;
 if(!kit.ready)return <div className="elements-empty"><p>{NOT_YET}</p></div>;
 return <div className="elements-empty">
  <p>No logos in your brand kit yet.</p>
  {mayEdit&&<Link className="ds-link" href="/company/brand">Add logos in Settings → Brand kit</Link>}
 </div>;
}

function GroupGrid({group,kit,labelledBy,mayEdit,preview,design}:{group:ElementGroup;kit:Kit;labelledBy?:string;mayEdit:boolean;preview:boolean;design:boolean}){
 if(group.category==='logos'&&!group.items.length)return <LogosState {...kit} count={preview?ALL_PREVIEW:6} mayEdit={mayEdit}/>;
 const One=design?AddElement:Element;
 return <>
  {design&&group.category==='icons'&&<p className="ds-help">{ICONS_NOTE}</p>}
  <ul className="elements-grid" data-group={group.category} aria-labelledby={labelledBy} aria-label={labelledBy?undefined:group.label}>
   {group.items.map(item=><One key={`${item.kind}:${item.id}`} item={item} kit={kit.kit}/>)}
  </ul>
 </>;
}

/** The nearest box that scrolls (the panel's body, or the drawer's) back to its top. */
function scrollToTop(from:HTMLElement|null){
 for(let box=from?.parentElement;box;box=box.parentElement){
  const y=getComputedStyle(box).overflowY;
  if(y==='auto'||y==='scroll'){box.scrollTop=0;return}
 }
}

export function ElementsPanel({initialCategory='all'}:{initialCategory?:ElementCategory}={}){
 const kit=useBrandKit(),account=useAccount(),design=!!useShell().canvas;
 const mayEdit=can(account,'brand.edit');
 const [category,setCategory]=React.useState<ElementCategory>(initialCategory);
 const root=React.useRef<HTMLDivElement>(null);
 const chips=React.useRef<Partial<Record<ElementCategory,HTMLButtonElement|null>>>({});
 const ids=React.useId();
 const view=elementsIn(category,kit.kit?.logos??null,{forDesign:design});
 function choose(next:ElementCategory){
  setCategory(next);
  scrollToTop(root.current);
 }
 // "See all" goes away with the groups: focus moves to its category in the bar.
 function seeAll(next:ElementGroupId){
  choose(next);
  chips.current[next]?.focus();
 }
 return <div className="elements-panel" ref={root}>
  <div className="elements-bar" role="group" aria-label="Element categories">
   {ELEMENT_CATEGORIES.map(c=><button key={c.id} type="button" className="ds-chip" aria-pressed={view.category===c.id}
    ref={el=>{chips.current[c.id]=el}} onClick={()=>choose(c.id)}>{c.label}</button>)}
  </div>
  <p className="ds-help">{design?DESIGN_NOTE:NOTE}</p>
  {view.category==='all'
   ?view.groups.map(group=>{
    const head=`${ids}-${group.category}`;
    return <section key={group.category} className="elements-group" aria-labelledby={head}>
     <div className="elements-group-head">
      <h3 id={head} className="elements-group-title">{group.label}</h3>
      <Button kind="quiet" size="sm" aria-label={`See all ${group.label.toLowerCase()}`} onClick={()=>seeAll(group.category)}>See all</Button>
     </div>
     <GroupGrid group={group} kit={kit} labelledBy={head} mayEdit={mayEdit} preview design={design}/>
    </section>;
   })
   :view.groups.map(group=><GroupGrid key={group.category} group={group} kit={kit} mayEdit={mayEdit} preview={false} design={design}/>)}
 </div>;
}
