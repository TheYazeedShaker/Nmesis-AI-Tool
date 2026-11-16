'use client';
import * as React from 'react';
import {Clapperboard,Film,ImageIcon,Layers,Replace} from 'lucide-react';
import {EditorLayout,GenerateButton} from '@/components/ds/editor';
import type {StudioPage} from '@/components/studio-topbar';
import {KEY_VISUAL_HREF} from '@/components/studio-topbar';

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

export function EditorScreen({tool,onTool,bar,stage,history,jobs,settings,cost,verb='Generate',busy,disabled,onGenerate,note}:{
 tool:EditorTool;onTool:(t:EditorTool)=>void;
 /** Name, project, the result's own actions (each with its cost). */bar:React.ReactNode;
 stage:React.ReactNode;history:React.ReactNode;jobs?:React.ReactNode;settings:React.ReactNode;
 cost:number|null;verb?:string;busy?:boolean;disabled?:boolean;onGenerate:()=>void;note?:React.ReactNode;
}){
 return <EditorLayout name={`editor-${tool}`} tools={EDITOR_TOOLS.map(t=>({id:t.id,label:t.label,icon:t.icon}))} tool={tool} onTool={id=>onTool(id as EditorTool)}
  canvasBar={bar}
  canvas={<div className="editor-stage"><div className="editor-stage-main">{stage}</div><div className="editor-stage-history">{history}</div></div>}
  jobs={jobs}
  settings={settings}
  generate={<GenerateButton cost={cost} verb={verb} busy={busy} disabled={disabled} onGenerate={onGenerate} note={note}/>}/>;
}
