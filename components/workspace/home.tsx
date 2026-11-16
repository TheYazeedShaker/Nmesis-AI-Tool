'use client';
import * as React from 'react';
import Link from 'next/link';
import {ArrowRight,Lock,Search,Sparkles} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge,SkeletonTile} from '@/components/ds/feedback';
import {MediaTile} from '@/components/ds/media';
import type {WorkItem} from './items';
import {CarPicture} from './car-picture';

// Home (Phase 3 group 1, the approved wireframe): what to make, the tools,
// recent work, and the company's cars.
export type HomeTool={key:string;name:string;line:string;href:string;icon:React.ReactNode;cost?:string;locked?:string};
export type HomeCar={name:string;href:string;/** Its picture (/api/cars/<id>/picture); none: the neutral car. */picture?:string};

export function HomeScreen({greeting,tools,recent,cars,onStart,libraryHref='/library'}:{greeting?:string;tools:HomeTool[];/** null while loading: the row keeps its height. */recent:WorkItem[]|null;cars:HomeCar[];onStart:(brief:string)=>void;libraryHref?:string}){
 const [brief,setBrief]=React.useState('');
 return <div className="ds-blocks workspace-home">
  <div className="ds-hero">
   {greeting&&<p className="ds-label-caps">{greeting}</p>}
   <h1 className="ds-hero-title">What do you want to make?</h1>
   <form className="ds-ask" role="search" onSubmit={e=>{e.preventDefault();onStart(brief.trim())}}>
    <Search aria-hidden="true"/>
    <label className="ds-sr-only" htmlFor="home-brief">Describe the key visual you want</label>
    <input id="home-brief" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="The Demo SUV on a coast road at dusk…" autoComplete="off" maxLength={600}/>
    <Button type="submit" kind="primary" icon={<Sparkles aria-hidden="true"/>}>Start</Button>
   </form>
   <p className="ds-muted workspace-hint">Opens a key visual with your words. Nothing is charged until you press Generate.</p>
  </div>

  <section aria-labelledby="home-tools">
   <div className="ds-block-head" id="tools"><h2 className="ds-block-title" id="home-tools">Tools</h2></div>
   <ul className="ds-tools workspace-list" aria-labelledby="home-tools">
    {tools.map(t=><li key={t.key}>
     {t.locked
      ?<span className="ds-tool" data-locked="true" aria-disabled="true">
        <span className="ds-tool-art" aria-hidden="true">{t.icon}</span>
        <span className="ds-tool-name">{t.name}</span><span className="ds-tool-line">{t.line}</span>
        <span className="ds-tool-foot"><Badge icon={<Lock aria-hidden="true"/>}>{t.locked}</Badge></span>
       </span>
      :<Link className="ds-tool" href={t.href}>
        <span className="ds-tool-art" aria-hidden="true">{t.icon}</span>
        <span className="ds-tool-name">{t.name}</span><span className="ds-tool-line">{t.line}</span>
        {t.cost&&<span className="ds-tool-foot"><Badge>{t.cost}</Badge></span>}
       </Link>}
    </li>)}
   </ul>
  </section>

  <section aria-labelledby="home-recent">
   <div className="ds-block-head"><h2 className="ds-block-title" id="home-recent">Recent work</h2><Link className="ds-link" href={libraryHref}>Open the library<ArrowRight aria-hidden="true" className="workspace-link-icon"/></Link></div>
   {recent===null?<div className="ds-scroller" aria-busy="true" aria-label="Loading recent work">{Array.from({length:6},(_,i)=><SkeletonTile key={i}/>)}</div>
    :recent.length
    ?<div className="ds-scroller" role="list" aria-label="Recent work">{recent.map(m=><MediaTile key={m.id} item={m} onOpen={()=>{location.href=m.href||libraryHref}}/>)}</div>
    :<p className="ds-muted">Nothing yet. What you make appears here and in the library.</p>}
  </section>

  {cars.length>0&&<section aria-labelledby="home-cars">
   <div className="ds-block-head"><h2 className="ds-block-title" id="home-cars">Start from your cars</h2></div>
   <ul className="ds-scroller workspace-list" aria-labelledby="home-cars">
    {cars.map(c=><li key={c.name}><Link className="ds-car" href={c.href}><CarPicture src={c.picture}/><span className="ds-tile-name ds-truncate" title={c.name}>{c.name}</span></Link></li>)}
   </ul>
  </section>}
 </div>;
}
