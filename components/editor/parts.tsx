'use client';
import * as React from 'react';
import {Camera,Check,Coins,FolderInput,Folder as FolderIcon,Image as ImageIcon,Inbox,RotateCw} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge} from '@/components/ds/feedback';
import {Dialog} from '@/components/ds/dialog';
import {DropZone} from '@/components/ds/drop-zone';
import {Field,Input,Radio,RadioGroup,Select,Slider,Textarea} from '@/components/ds/field';
import {credits as creditWords} from '@/lib/ds/words';
import type {ConfiguratorChoice,ConfiguratorOptions} from './configurator';
import {useConfiguratorPresets} from '@/lib/configurator-presets';
import {CarPicture} from '@/components/workspace/car-picture';

// The pieces of the one editor (Phase 3 group 2): the settings panel's
// sections, the version history, Save to project and the cost line.

export type Quality='standard'|'high';
export const QUALITY_LABEL:Record<Quality,string>={standard:'Standard',high:'High detail'};

/** The credit cost before an action ("· 4 credits") or what a result used. */
export function CostBadge({credits,used}:{credits:number|null;used?:boolean}){
 if(credits===null)return null;
 return <Badge icon={<Coins aria-hidden="true"/>}>{used?`Used ${creditWords(credits)}`:creditWords(credits)}</Badge>;
}

export function SettingsSection({title,children,id}:{title:string;children:React.ReactNode;id?:string}){
 return <section className="editor-section" aria-labelledby={id}><h3 className="editor-section-title" id={id}>{title}</h3>{children}</section>;
}

/** Car, colour, trim and view. With today's configurator the colour, trim and
 *  view are chosen inside it (`controlsInEditor` false); with remote control
 *  they are set from here. */
export function CarSettings({cars,car,onCar,options,state,onColour,onTrim,onView,controlsInEditor,idPrefix='car'}:{
 cars:string[];car:string;onCar:(c:string)=>void;options:ConfiguratorOptions;state:{colour?:string;trim?:string;view?:string};
 onColour:(id:string)=>void;onTrim:(id:string)=>void;onView:(id:string)=>void;controlsInEditor:boolean;idPrefix?:string}){
 return <SettingsSection title="Car" id={`${idPrefix}-title`}>
  <CarChoicePicture car={car}/>
  <Field label="Car" help="From your company’s configurators."><Select value={car} onChange={e=>onCar(e.target.value)}>{cars.map(c=><option key={c}>{c}</option>)}</Select></Field>
  {controlsInEditor&&options.colours.length>0&&<fieldset className="editor-swatches"><legend className="ds-label">Colour</legend>
   {options.colours.map(c=><label key={c.id} className="editor-swatch" title={c.name}><input className="editor-choice-input" type="radio" name={`${idPrefix}-colour`} checked={state.colour===c.id} onChange={()=>onColour(c.id)}/><span className="editor-swatch-chip" style={{background:c.swatch}} aria-hidden="true"/><span className="ds-sr-only">{c.name}</span></label>)}
   <span className="ds-help editor-swatch-name">{options.colours.find(c=>c.id===state.colour)?.name||'Choose a colour'}</span>
  </fieldset>}
  {controlsInEditor&&options.trims.length>0&&<Field label="Trim"><Select value={state.trim} onChange={e=>onTrim(e.target.value)}>{options.trims.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
  {controlsInEditor&&options.views.length>0&&<ChoiceChips legend="View" name={`${idPrefix}-view`} choices={options.views} value={state.view} onChange={onView}/>}
  {!controlsInEditor&&<p className="ds-help">Choose the colour, trim and view in the configurator, then press Use this view.</p>}
 </SettingsSection>;
}

export function ChoiceChips({legend,name,choices,value,onChange}:{legend:string;name:string;choices:ConfiguratorChoice[];value?:string;onChange:(id:string)=>void}){
 return <fieldset className="editor-chips"><legend className="ds-label">{legend}</legend>
  {choices.map(c=><label key={c.id} className="editor-chip"><input className="editor-choice-input" type="radio" name={name} checked={value===c.id} onChange={()=>onChange(c.id)}/><span>{c.name}</span></label>)}
 </fieldset>;
}

export function PromptSettings({label='Scene',value,onChange,placeholder,max=600,inspiration=true,onInspiration}:{label?:string;value:string;onChange:(v:string)=>void;placeholder?:string;max?:number;inspiration?:boolean;onInspiration?:(file:File)=>unknown}){
 return <SettingsSection title="Prompt" id="prompt-title">
  <Field label={label} count={{value:value.length,max}}><Textarea value={value} onChange={e=>onChange(e.target.value.slice(0,max))} rows={4} placeholder={placeholder}/></Field>
  {/* The tools' own inspiration is components/editor/inspiration-card.tsx; this preview (the gallery) takes a picture only when given onInspiration. */}
  {inspiration&&<DropZone name="reference picture" label="Drop, paste or upload a reference picture" hint="Optional" onFile={onInspiration} disabled={!onInspiration}/>}
 </SettingsSection>;
}

/** costs: the price of each choice when it is known before an estimate (null: priced by the estimate). */
export function QualitySettings({value,onChange,costs}:{value:Quality;onChange:(q:Quality)=>void;costs?:Record<Quality,number|null>}){
 return <SettingsSection title="Quality" id="quality-title">
  <RadioGroup legend="Quality" className="editor-quality">
   {(['standard','high'] as Quality[]).map(q=><Radio key={q} name="quality" checked={value===q} onChange={()=>onChange(q)} label={<span className="editor-quality-label">{QUALITY_LABEL[q]}{typeof costs?.[q]==='number'&&<span className="ds-muted">{creditWords(costs[q] as number)}</span>}</span>} help={q==='standard'?'Quicker; good for trying ideas.':'Sharper details for the final.'}/>)}
  </RadioGroup>
 </SettingsSection>;
}

export function LengthSettings({value,onChange,choices}:{value:number;onChange:(v:number)=>void;choices:number[]}){
 return <Field label="Length"><Select value={String(value)} onChange={e=>onChange(Number(e.target.value))}>{choices.map(s=><option key={s} value={s}>{s} seconds</option>)}</Select></Field>;
}

export type Version={id:string;n:number;src?:string;quality:Quality;used:number|null;at:string;status:'ready'|'working'|'failed';label?:string;
 /** While it is being made: the provider's step in words, 0–1 when known, the credits held. */stage?:string;progress?:number;held?:number;
 /** False when this version can no longer be cancelled (e.g. the render has started). */cancellable?:boolean};
/** A failed version says "nothing used" only when that is known: work a provider accepted can be charged even if it fails. */
export const failedWords=(used:number|null)=>used===0?'Didn’t finish · nothing used':used&&used>0?`Didn’t finish · used ${creditWords(used)}`:'Didn’t finish';
/** The history of versions under the canvas: newest first, each with what it used. */
export function VersionHistory({versions,current,onPick,onCancel}:{versions:Version[];current:string|null;onPick:(id:string)=>void;onCancel?:(id:string)=>void}){
 if(!versions.length)return <p className="ds-muted editor-history-empty">Your versions appear here, newest first.</p>;
 return <div className="editor-history" role="list" aria-label="Versions">
  {versions.map(v=><div key={v.id} role="listitem" className="editor-version" data-current={v.id===current||undefined}>
   <button type="button" className="editor-version-pick" onClick={()=>onPick(v.id)} aria-current={v.id===current||undefined}>
    <span className="editor-version-thumb" aria-hidden="true">
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
     {v.src?<img src={v.src} alt="" loading="lazy"/>:v.status==='working'?<RotateCw className="spin"/>:<ImageIcon/>}
    </span>
    <span className="editor-version-meta"><b>{v.label||`Version ${v.n}`}</b><span className="ds-muted">{QUALITY_LABEL[v.quality]} · {v.at}</span></span>
   </button>
   {v.status==='working'?<div className="editor-version-progress" role="status"><span>{v.stage||'In progress'}{typeof v.progress==='number'?` · ${Math.round(v.progress*100)}%`:''}</span>
     <span className="ds-progress" data-indeterminate={typeof v.progress!=='number'||undefined}><span className="ds-progress-bar" style={{transform:`scaleX(${v.progress??0.3})`}}/></span>
     <span className="editor-row">{typeof v.held==='number'&&<span>{creditWords(v.held)} held</span>}{onCancel&&v.cancellable!==false&&<Button size="sm" kind="quiet" onClick={()=>onCancel(v.id)}>Cancel</Button>}</span></div>:v.status==='failed'?<Badge kind="bad">{failedWords(v.used)}</Badge>:<CostBadge credits={v.used} used/>}
  </div>)}
 </div>;
}

export type ProjectFolder={id:string;name:string;parentId:string|null};
/** Save to project: the work goes into one of the company's folders. */
export function SaveToProject({folders,folderId,onSave,disabled}:{folders:ProjectFolder[];folderId:string|null;onSave:(id:string|null)=>void;disabled?:boolean}){
 const [open,setOpen]=React.useState(false);
 const current=folders.find(f=>f.id===folderId);
 return <>
  <Button size="sm" kind={current?'quiet':'secondary'} disabled={disabled} icon={current?<FolderIcon aria-hidden="true"/>:<FolderInput aria-hidden="true"/>} onClick={()=>setOpen(true)}>{current?current.name:'Save to project'}</Button>
  <Dialog open={open} onClose={()=>setOpen(false)} title="Save to project">
   <ul className="workspace-list workspace-move-list" aria-label="Folders">
    {folders.map(f=><li key={f.id}><button type="button" className="ds-menu-item" aria-current={f.id===folderId||undefined} onClick={()=>{setOpen(false);onSave(f.id)}}><FolderIcon aria-hidden="true"/><span className="ds-truncate" title={f.name}>{f.parentId?`${folders.find(p=>p.id===f.parentId)?.name} / `:''}{f.name}</span>{f.id===folderId&&<Check aria-label="Current"/>}</button></li>)}
    <li><button type="button" className="ds-menu-item" onClick={()=>{setOpen(false);onSave(null)}}><Inbox aria-hidden="true"/>Not in a folder</button></li>
   </ul>
  </Dialog>
 </>;
}

/** The configurator in the canvas: the live frame, a turn slider when the car
 *  has frames, and Use this view (capture). */
export function ConfiguratorStage({frame,frames,onFrame,onCapture,capturing,children}:{frame:number;frames:number;onFrame:(f:number)=>void;onCapture:()=>void;capturing?:boolean;children:React.ReactNode}){
 return <div className="editor-configurator">
  <div className="editor-configurator-frame">{children}</div>
  <div className="editor-configurator-bar">
   {frames>0&&<label className="editor-turn"><span className="ds-label">Turn</span><Slider value={frame} onValueChange={onFrame} min={0} max={frames-1} format={v=>`${Math.round(v/(frames)*360)}°`} aria-label="Turn the car"/></label>}
   <Button kind="primary" busy={capturing} icon={<Camera aria-hidden="true"/>} onClick={onCapture}>Use this view</Button>
  </div>
 </div>;
}

export function NameField({value,onChange}:{value:string;onChange:(v:string)=>void}){
 return <label className="editor-name"><span className="ds-sr-only">Name</span><Input value={value} onChange={e=>onChange(e.target.value)} maxLength={100}/></label>;
}

/** The chosen car's real picture over the car picker: the same small thumbnail Home shows (the configurator's opening frame). */
function CarChoicePicture({car}:{car:string}){
 const presets=useConfiguratorPresets();
 const picture=presets.find(c=>c.name===car)?.picture;
 return <CarPicture src={picture} className="editor-car-picture"/>;
}
