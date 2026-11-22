'use client';
import * as React from 'react';
import {InspectorSection,SliderField} from '@/components/ds/inspector';
import {EFFECTS,effectCss,effectDefaults} from '@/lib/editor/effects';
import {TEXT_EFFECTS,type EditorDoc,type TextEffect,type TextEffectKind,type TextLayer} from '@/lib/editor/doc';
import {cssFontFamily} from '@/lib/editor/fonts';
import {ColourField,type Swatch} from './colour-picker';

// The Effects section of a text (owner's brief): one effect at a time, as in
// Canva. The effects are tiles, each a live preview on a sample in the text's
// own font and colour; picking a tile replaces the effect (one undo step), and
// None takes it off. The chosen effect's 2–5 controls follow, each the shared
// slider or the colour picker; one drag is one undo step.

type Choice=TextEffectKind|'none';
const CHOICES:Choice[]=['none',...TEXT_EFFECTS];
const words=(c:Choice)=>c==='none'?'None':EFFECTS[c].label;

function Tile({choice,on,layer,tabIndex,disabled,onPick,refCb}:{choice:Choice;on:boolean;layer:TextLayer;tabIndex:number;disabled:boolean;onPick:()=>void;refCb:(n:HTMLButtonElement|null)=>void}){
 const pathId=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const style:React.CSSProperties={fontFamily:cssFontFamily(layer.font),fontWeight:layer.fontWeight,fontStyle:layer.italic?'italic':undefined,color:layer.color,...effectCss(choice,layer.color) as React.CSSProperties};
 return <button ref={refCb} type="button" role="radio" aria-checked={on} tabIndex={tabIndex} disabled={disabled} className="canvas-effect-tile" data-effect={choice} onClick={onPick}>
  <span className="canvas-effect-sample" aria-hidden="true">
   {choice==='curve'
    ?<svg viewBox="0 0 64 32" width="56" height="28"><path id={pathId} d="M 6 26 Q 32 4 58 26" fill="none"/><text style={{fontFamily:style.fontFamily,fontWeight:style.fontWeight}} fill={layer.color} fontSize="13"><textPath href={'#'+pathId} startOffset="50%" textAnchor="middle">Abc</textPath></text></svg>
    :<span style={style}>Ag</span>}
  </span>
  <span className="canvas-effect-name">{words(choice)}</span>
 </button>;
}

export function EffectsSection({layer,doc,off,brand,onSet,onEnd,pickFromCanvas}:{layer:TextLayer;doc:EditorDoc;off:boolean;brand:Swatch[];
 /** Sets the effect (null: none), as one change, or as part of the gesture `gesture` (a slider's drag). */onSet:(e:TextEffect|null,gesture?:string)=>void;
 onEnd:()=>void;pickFromCanvas:()=>Promise<string|null>}){
 const current:Choice=layer.effect?.kind??'none',id=React.useId(),refs=React.useRef<(HTMLButtonElement|null)[]>([]);
 const pick=(c:Choice)=>{if(c===current)return;onSet(c==='none'?null:effectDefaults(c,layer))};
 const onKeyDown=(e:React.KeyboardEvent)=>{
  const at=CHOICES.indexOf(current),step=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;
  const to=e.key==='Home'?0:e.key==='End'?CHOICES.length-1:step?(at+step+CHOICES.length)%CHOICES.length:-1;
  if(to<0||off)return;e.preventDefault();pick(CHOICES[to]);refs.current[to]?.focus();
 };
 const e=layer.effect;
 const set=(key:string,v:number|string,gesture?:string)=>{if(e)onSet({...e,[key]:v} as TextEffect,gesture)};
 return <InspectorSection section="effects" title="Effects">
  <div className="ds-inspector-row" data-editor-row>
   <span className="ds-inspector-label" data-editor-label id={id}>Effect</span>
   <div className="canvas-effect-tiles" role="radiogroup" aria-labelledby={id} aria-describedby={id+'-one'} onKeyDown={onKeyDown}>
    {CHOICES.map((c,i)=><Tile key={c} choice={c} on={c===current} layer={layer} tabIndex={c===current?0:-1} disabled={off} refCb={n=>{refs.current[i]=n}} onPick={()=>pick(c)}/>)}
   </div>
   <p className="ds-help" id={id+'-one'}>One effect at a time: picking another replaces it.</p>
  </div>
  {e&&EFFECTS[e.kind].controls.map(c=>c.kind==='slider'
   ?<SliderField key={c.key} label={c.label} unit={c.unit} min={c.min} max={c.max} step={c.step} disabled={off}
     value={Number((e as Record<string,unknown>)[c.key])} onChange={n=>set(c.key,n,`effect:${layer.id}:${c.key}`)}/>
   :<ColourField key={c.key} label={c.label} value={{colour:String((e as Record<string,unknown>)[c.key])}} brand={brand} doc={doc} disabled={off}
     gesture={`effect:${layer.id}:${c.key}`} onEnd={onEnd} pickFromCanvas={pickFromCanvas}
     onChange={(p,g)=>set(c.key,p.colour.slice(0,7),g)}/>)}
  {e?.kind==='curve'&&<p className="ds-help">Double-click the curved text to change its words.</p>}
 </InspectorSection>;
}
