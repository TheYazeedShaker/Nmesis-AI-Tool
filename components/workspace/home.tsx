'use client';
import * as React from 'react';
import Link from 'next/link';
import {ArrowRight,Coins,Lock,Search,Sparkles} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge,SkeletonTile} from '@/components/ds/feedback';
import {MediaTile} from '@/components/ds/media';
import {HowItWorks} from '@/components/shell/how-it-works';
import type {WorkItem} from './items';
import {briefPlaceholder} from '@/lib/tool-samples';
import {CarPicture,SamplePicture} from './car-picture';

// Home: a greeting, "What do you want to make?" (a brief that opens Key visual,
// and the tool cards), how it works, the work to continue, and the credits
// left. No banners, no carousels. Each card shows a picture of the company's
// own work or cars (lib/tool-samples.ts), never stock imagery; Car lineup shows
// two or three of the company's cars side by side, so it reads as "several cars".
export type HomeTool={key:string;name:string;line:string;href:string;icon:React.ReactNode;cost?:string;
 /** Why it can't be opened: its plan, or "Coming soon" (lib/tools.ts). */locked?:string;soon?:boolean;
 /** Its sample picture (lib/tool-samples.ts); none: the neutral placeholder. */sample?:string;
 /** Several cars side by side (Car lineup), drawn instead of the sample. */cars?:(string|undefined)[]};
export type HomeCredits={left:number;resetsOn?:string|null;href?:string}|null;
export const CONTINUE_MAX=6;

function ToolArt({tool}:{tool:HomeTool}){
 if(tool.cars?.length)return <span className="workspace-tool-art">
  <span className="ds-tool-art workspace-lineup-art" aria-hidden="true">{tool.cars.slice(0,3).map((src,i)=><CarPicture key={i} src={src} className="workspace-lineup-car"/>)}</span>
  <span className="workspace-tool-mark" aria-hidden="true">{tool.icon}</span>
 </span>;
 return <span className="workspace-tool-art">
  <SamplePicture src={tool.sample} className="ds-tool-art" fallback={tool.icon}/>
  {tool.sample&&<span className="workspace-tool-mark" aria-hidden="true">{tool.icon}</span>}
 </span>;
}

function ToolCard({t}:{t:HomeTool}){
 if(t.locked)return <span className="ds-tool" data-locked="true" data-soon={t.soon||undefined} aria-disabled="true">
  <ToolArt tool={t}/>
  <span className="ds-tool-name">{t.name}</span><span className="ds-tool-line">{t.line}</span>
  <span className="ds-tool-foot"><Badge icon={t.soon?undefined:<Lock aria-hidden="true"/>}>{t.locked}</Badge></span>
 </span>;
 return <Link className="ds-tool" href={t.href}>
  <ToolArt tool={t}/>
  <span className="ds-tool-name">{t.name}</span><span className="ds-tool-line">{t.line}</span>
  {t.cost&&<span className="ds-tool-foot"><Badge>{t.cost}</Badge></span>}
 </Link>;
}

export function HomeScreen({greeting,tools,recent,onStart,credits,placeholder=briefPlaceholder([]),libraryHref='/library'}:{greeting?:string;placeholder?:string;tools:HomeTool[];/** null while loading: the row keeps its height. */recent:WorkItem[]|null;onStart:(brief:string)=>void;credits?:HomeCredits;libraryHref?:string;
 /** @deprecated Home no longer lists the cars; they are in each tool's car picker. */cars?:unknown}){
 const [brief,setBrief]=React.useState('');
 const open=tools.filter(t=>!t.soon),soon=tools.filter(t=>t.soon);
 const shown=recent?.slice(0,CONTINUE_MAX)??null;
 return <div className="ds-blocks workspace-home">
  <div className="ds-hero">
   {greeting&&<p className="workspace-greeting">{greeting}</p>}
   <h1 className="ds-hero-title">What do you want to make?</h1>
   <form className="ds-ask" role="search" onSubmit={e=>{e.preventDefault();onStart(brief.trim())}}>
    <Search aria-hidden="true"/>
    <label className="ds-sr-only" htmlFor="home-brief">Describe the key visual you want</label>
    <input id="home-brief" value={brief} onChange={e=>setBrief(e.target.value)} placeholder={placeholder} autoComplete="off" maxLength={600}/>
    <Button type="submit" kind="primary" icon={<Sparkles aria-hidden="true"/>}>Start</Button>
   </form>
   <p className="ds-muted workspace-hint">Describe a scene to start a key visual, or pick a tool below. Nothing is charged until you press Generate.</p>
  </div>

  <section aria-labelledby="home-tools">
   <div className="ds-block-head" id="tools"><h2 className="ds-block-title" id="home-tools">Tools</h2></div>
   <ul className="ds-tools workspace-list workspace-tools-open" aria-labelledby="home-tools">
    {open.map(t=><li key={t.key}><ToolCard t={t}/></li>)}
   </ul>
   {soon.length>0&&<ul className="ds-tools workspace-list workspace-tools-soon" aria-label="Coming soon">
    {soon.map(t=><li key={t.key}><ToolCard t={t}/></li>)}
   </ul>}
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

