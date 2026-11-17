'use client';
import * as React from 'react';
import {Clapperboard,Film,ImageIcon,Layers,Replace} from 'lucide-react';
import {EditorLayout,GenerateButton,GenerateNotice,type GenerateBlocker} from '@/components/ds/editor';
import {Fold} from '@/components/ds/layout';
import type {StudioPage} from '@/components/studio-topbar';
import {KEY_VISUAL_HREF} from '@/components/studio-topbar';
import {providerNames,useAccount} from '@/components/studio-account';
import {useCredits} from '@/components/credits';
import type {AccountSummary} from '@/lib/accounts/summary';
import type {CreditOverview} from '@/lib/credits/usage';
import type {CreditProvider} from '@/lib/credits/pricing';
import {dayDate} from '@/lib/ds/words';

// The one editor for all five tools (Phase 3 group 2, the approved
// wireframe): the tools on the rail, the canvas or preview in the middle with
// the version history under it, one settings panel on the right with Generate
// and its credit cost, Save to project in the canvas bar. On phones the tools
// are a strip, the settings a bottom sheet, Generate a sticky bar.

export type EditorTool='visuals'|'lineup'|'films'|'swap'|'storyboard';
export const EDITOR_TOOLS:{id:EditorTool;label:string;href:string;icon:React.ReactNode}[]=[
 {id:'visuals',label:'Key visual',href:KEY_VISUAL_HREF,icon:<ImageIcon/>},
 {id:'lineup',label:'Line-up',href:'/lineup',icon:<Layers/>},
 {id:'films',label:'Film',href:'/films',icon:<Film/>},
 {id:'swap',label:'Swap',href:'/swap',icon:<Replace/>},
 {id:'storyboard',label:'Story',href:'/storyboard',icon:<Clapperboard/>},
];
export const toolPage=(t:EditorTool):StudioPage=>t;
export type {GenerateBlocker};

/** Why Generate cannot run, the same in every tool: the account first (no
 *  plan, plan ended, only looking), then the tool's own reason (no AI set up),
 *  then credits. The words never name a provider (F-050). */
export function generateBlocker(account:AccountSummary|null,credits:CreditOverview|null,cost:number|null,tool?:GenerateBlocker|null,payer?:CreditProvider):GenerateBlocker|null{
 if(account){
  const w=account.workspace;
  if(!w.open&&w.noPlan)return {title:'Your Studio isn’t part of your plan yet',body:'Ask Nmesis to add it.'};
  if(!w.open)return {title:'Your plan has ended',body:'New work is paused; your library is still here. Ask Nmesis to renew it.'};
  if(account.viewingAs)return {title:'Read-only support view',body:'Generating is off while you view a client’s Studio.'};
  if(account.role==='viewer')return {title:'You can look, not generate',body:'Ask your company’s owner for creator access.'};
 }
 if(tool)return tool;
 const m=credits&&!credits.unlimited?credits.meter:null;
 if(m&&m.level===100&&cost!==0&&!(payer&&credits?.billing[payer]==='own key'))return {title:'No credits left this month',body:`${m.resetsOn?`They reset on ${dayDate(m.resetsOn)||m.resetsOn}. `:''}Ask Nmesis to add a pack.`};
 return null;
}

/** Engine and model choices: only for Nmesis staff and companies with their own
 *  keys (F-050), folded away under Advanced. Clients choose Quality only. */
export function Advanced({name,summary='Engine and model',children}:{name:string;summary?:React.ReactNode;children:React.ReactNode}){
 if(!providerNames(useAccount()))return null;
 return <Fold name={`editor-advanced-${name}`} title="Advanced" summary={summary} className="editor-advanced"><div className="ds-stack">{children}</div></Fold>;
}

export function EditorScreen({tool,onTool,bar,stage,history,jobs,settings,cost,verb='Generate',busy,disabled,onGenerate,note,blocked,payer,loading}:{
 tool:EditorTool;onTool:(t:EditorTool)=>void;
 /** Name, project, the result's own actions (each with its cost). */bar:React.ReactNode;
 stage:React.ReactNode;history:React.ReactNode;jobs?:React.ReactNode;settings:React.ReactNode;
 cost:number|null;verb?:string;busy?:boolean;disabled?:boolean;onGenerate:()=>void;note?:React.ReactNode;
 /** The tool's own reason Generate cannot run (no AI set up for it). */blocked?:GenerateBlocker|null;
 /** Who the work is billed through: with the company's own key, credits never stop it. */payer?:CreditProvider;
 /** The tool's first data is still loading (the frame draws at once; the content when it is ready). */loading?:boolean;
}){
 const why=generateBlocker(useAccount(),useCredits(),cost,blocked,payer);
 return <EditorLayout loading={loading} name={`editor-${tool}`} tools={EDITOR_TOOLS.map(t=>({id:t.id,label:t.label,icon:t.icon}))} tool={tool} onTool={id=>onTool(id as EditorTool)}
  canvasBar={bar}
  canvas={<div className="editor-stage"><div className="editor-stage-main">{stage}</div><div className="editor-stage-history">{history}</div></div>}
  jobs={jobs}
  notice={why&&<GenerateNotice blocked={why}/>}
  settings={settings}
  generate={<GenerateButton cost={cost} verb={verb} busy={busy} disabled={disabled} onGenerate={onGenerate} note={note} blocked={why}/>}/>;
}
