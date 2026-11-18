'use client';
import * as React from 'react';
import Link from 'next/link';
import {ArrowRight,Coins,Search,Sparkles} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {SkeletonTile} from '@/components/ds/feedback';
import {MediaTile} from '@/components/ds/media';
import {ToolTile} from '@/components/ds/tool-tile';
import {HowItWorks} from '@/components/shell/how-it-works';
import type {WorkItem} from './items';
import {briefPlaceholder} from '@/lib/tool-samples';
import {CarPicture,SamplePicture} from './car-picture';

// Home: a greeting, "What do you want to make?" (a brief that opens Key visual),
// the five tools in one row of equal tiles (components/ds/tool-tile.tsx: the
// open ones, then the locked ones with a small "Coming soon" badge), how it
// works, the work to continue, and the credits left. Calm: no banners, no
// carousels. Each tile shows a picture of the company's own work or cars
// (lib/tool-samples.ts), never stock imagery; Car lineup shows two or three of
// the company's cars side by side on one ground line, so it reads as a lineup.
export type HomeTool={key:string;name:string;line:string;href:string;icon:React.ReactNode;cost?:string;
 /** Why it can't be opened: its plan, or "Coming soon" (lib/tools.ts). */locked?:string;soon?:boolean;
 /** Its sample picture (lib/tool-samples.ts); none: the neutral placeholder. */sample?:string;
 /** Several cars side by side (Car lineup), drawn instead of the sample. */cars?:(string|undefined)[]};
export type HomeCredits={left:number;resetsOn?:string|null;href?:string}|null;
export const CONTINUE_MAX=6;

/** Car lineup's picture: the company's cars, each its configurator's opening frame, full size on one
 *  ground line, overlapping a little, the middle one in front (neutral cars while they load). */
export function LineupArt({cars}:{cars:(string|undefined)[]}){
 const shown=cars.slice(0,3);
 return <span className="ds-tool-art workspace-lineup-art" aria-hidden="true" data-count={shown.length}>
  <span className="workspace-lineup-ground"/>
  {shown.map((src,i)=><CarPicture key={i} src={src} className="workspace-lineup-car"/>)}
 </span>;
}

function ToolArt({tool}:{tool:HomeTool}){
 const mark=<span className="workspace-tool-mark" aria-hidden="true">{tool.icon}</span>;
 if(tool.cars?.length)return <><LineupArt cars={tool.cars}/>{mark}</>;
 return <><SamplePicture src={tool.sample} className="ds-tool-art" fallback={tool.icon}/>{tool.sample&&mark}</>;
}

function ToolCard({t}:{t:HomeTool}){
 return <ToolTile name={t.name} line={t.line} href={t.locked?undefined:t.href} locked={t.locked} soon={t.soon} cost={t.cost} art={<ToolArt tool={t}/>}/>;
}

export function HomeScreen({greeting,tools,recent,onStart,credits,placeholder=briefPlaceholder([]),libraryHref='/library'}:{greeting?:string;placeholder?:string;tools:HomeTool[];/** null while loading: the row keeps its height. */recent:WorkItem[]|null;onStart:(brief:string)=>void;credits?:HomeCredits;libraryHref?:string;
 /** @deprecated Home no longer lists the cars; they are in each tool's car picker. */cars?:unknown}){
 const [brief,setBrief]=React.useState('');
 // One row: the tools that open first, then the ones coming soon.
 const row=[...tools.filter(t=>!t.soon),...tools.filter(t=>t.soon)];
 const shown=recent?.slice(0,CONTINUE_MAX)??null;
 return <div className="ds-blocks workspace-home">
  <div className="ds-hero">
   {greeting&&<p className="workspace-greeting">{greeting}</p>}
   <h1 className="ds-hero-title">What do you want to make?</h1>
   <form className="ds-ask" role="search" onSubmit={e=>{e.preventDefault();onStart(brief.trim())}}>
    <Search aria-hidden="true"/>
    <label className="ds-sr-only" htmlFor="home-brief">Describe the key visual you want</label>
    <input id="home-brief" className="ds-ask-input" value={brief} onChange={e=>setBrief(e.target.value)} placeholder={placeholder} autoComplete="off" maxLength={600}/>
    <Button type="submit" kind="primary" icon={<Sparkles aria-hidden="true"/>}>Start</Button>
   </form>
   <p className="ds-muted workspace-hint">Describe a scene to start a key visual, or pick a tool below. Nothing is charged until you press Generate.</p>
  </div>

  <section aria-labelledby="home-tools">
   <div className="ds-block-head" id="tools"><h2 className="ds-block-title" id="home-tools">Tools</h2></div>
   <ul className="ds-tools workspace-list workspace-tools-row" aria-labelledby="home-tools" data-count={row.length}>
    {row.map(t=><li key={t.key}><ToolCard t={t}/></li>)}
   </ul>
  </section>

  <HowItWorks/>

  <section aria-labelledby="home-recent">
   <div className="ds-block-head"><h2 className="ds-block-title" id="home-recent">Continue where you left off</h2><Link className="ds-link" href={libraryHref}>All projects<ArrowRight aria-hidden="true" className="workspace-link-icon"/></Link></div>
   {shown===null?<div className="ds-grid workspace-continue" aria-busy="true" aria-label="Loading your recent work">{Array.from({length:CONTINUE_MAX},(_,i)=><SkeletonTile key={i}/>)}</div>
    :shown.length
    ?<div className="ds-grid workspace-continue" role="list" aria-label="Recent work">{shown.map(m=><MediaTile key={m.id} item={m} onOpen={()=>{location.href=m.href||libraryHref}}/>)}</div>
    :<p className="ds-muted">Nothing yet. What you make appears here and in Projects.</p>}
  </section>

  {credits&&<p className="workspace-credits"><Coins aria-hidden="true"/><span><b>{credits.left.toLocaleString('en-US')}</b> credits left this month{credits.resetsOn?` · they reset on ${credits.resetsOn}`:''}.</span>{credits.href&&<Link className="ds-link" href={credits.href}>Plans and credits</Link>}</p>}
 </div>;
}

