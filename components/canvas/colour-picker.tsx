'use client';
import * as React from 'react';
import {Check,Pipette,Plus,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Input,Slider} from '@/components/ds/field';
import {dsClass} from '@/components/ds/button';
import {alphaOf,cleanTypedHex,cssFill,gradientFrom,GRADIENT_STOPS,hsvToRgb,isHex,parseHex,rgbToHsv,solidOf,sortedStops,toHex,withAlpha,type HSV} from '@/lib/editor/colour';
import type {EditorDoc,Gradient} from '@/lib/editor/doc';
import {Popover} from './popover';
import {useRecent} from './recent';

// The one colour picker (owner's brief): the same popover for a text's colour,
// a shape's fill and outline, an icon, a line or frame, an effect's colour and
// the page's background. Brand colours → In this design → Recent → the full
// picker (saturation and brightness, hue, hex) and the colour's transparency on
// the shared slider. The eyedropper takes a colour from anywhere on the screen
// where the browser has one (EyeDropper, after a click), else from the canvas
// itself (the next click on it), so it works in every browser. Shapes and the
// page may also be a linear or radial gradient of 2–4 stops.
// Each gesture is one undo step: a swatch, one drag of the picker or a slider,
// typing a hex (until the field is left).

export type Paint={colour:string;gradient?:Gradient|null};
export type Swatch={hex:string;name:string};
type EyeDropperCtor=new()=>{open:()=>Promise<{sRGBHex:string}>};
const eyeDropper=()=>typeof window!=='undefined'?(window as unknown as {EyeDropper?:EyeDropperCtor}).EyeDropper:undefined;

/** Every colour the design uses (text, fills, outlines, icons, effects, page backgrounds), solid, each once. */
export function coloursInDesign(doc:EditorDoc):string[]{
 const out:string[]=[];
 const add=(c:unknown)=>{if(typeof c==='string'&&isHex(c)){const s=solidOf(c);if(!out.includes(s))out.push(s)}};
 for(const p of doc.pages)if(p.background.kind==='colour'){add(p.background.colour);for(const s of p.background.gradient?.stops??[])add(s.colour)}
 for(const l of Object.values(doc.layers)){
  if(l.kind==='text'){add(l.color);if(l.effect&&'colour' in l.effect)add(l.effect.colour)}
  else if(l.kind==='shape'){add(l.fill);add(l.stroke);for(const s of l.gradient?.stops??[])add(s.colour)}
  else if(l.kind==='icon')add(l.color);
  else if(l.kind==='line'||l.kind==='frame')add(l.stroke);
 }
 return out.slice(0,16);
}

/** A labelled row with the colour (or gradient) shown and named, opening the picker. */
export function ColourField({label,value,onChange,onEnd,brand,doc,gradients,none,disabled,hint,pickFromCanvas,gesture}:{
 label:string;value:Paint;onChange:(p:Paint,gesture?:string)=>void;onEnd:()=>void;brand:Swatch[];doc:EditorDoc;
 /** Linear and radial fills may be chosen (shapes, the page). */gradients?:boolean;/** "No colour" may be chosen (an outline). */none?:boolean;
 disabled?:boolean;hint?:React.ReactNode;
 /** The canvas's own eyedropper: resolves with the colour of the next click on it (null: cancelled). */pickFromCanvas:()=>Promise<string|null>;
 /** The undo key of this setting (each gesture inside it is its own step). */gesture:string}){
 const [open,setOpen]=React.useState(false),button=React.useRef<HTMLButtonElement>(null),id=React.useId(),hintId=id+'-hint';
 const words=value.gradient?(value.gradient.type==='radial'?'Radial gradient':'Linear gradient'):value.colour==='transparent'?'No colour':value.colour.toUpperCase();
 const alpha=value.colour!=='transparent'&&!value.gradient?Math.round(alphaOf(value.colour)*100):100;
 return <div className="ds-inspector-row" data-editor-row>
  <span className="ds-inspector-label" data-editor-label id={id}>{label}</span>
  <button ref={button} type="button" className="ds-colour-button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${id} ${id}-value`} aria-describedby={hint?hintId:undefined} disabled={disabled} onClick={()=>setOpen(o=>!o)}>
   <span className={dsClass('ds-colour-chip',value.colour==='transparent'&&!value.gradient&&'ds-swatch-none')} style={{['--swatch' as string]:cssFill(value.colour,value.gradient)} as React.CSSProperties} aria-hidden="true"/>
   <span id={`${id}-value`}>{words}{alpha<100?`, ${alpha}%`:''}</span>
  </button>
  {hint&&<div id={hintId}>{hint}</div>}
  <ColourPopover open={open} anchor={button} title={label} value={value} brand={brand} doc={doc} gradients={gradients} none={none}
   onChange={onChange} onEnd={onEnd} onClose={()=>setOpen(false)} pickFromCanvas={pickFromCanvas} gesture={gesture}/>
 </div>;
}

function SwatchGroup({label,swatches,value,onPick}:{label:string;swatches:Swatch[];value:string;onPick:(hex:string)=>void}){
 const id=React.useId(),refs=React.useRef<(HTMLButtonElement|null)[]>([]);
 const now=value.toUpperCase(),at=Math.max(0,swatches.findIndex(s=>s.hex.toUpperCase()===now));
 if(!swatches.length)return null;
 const onKeyDown=(e:React.KeyboardEvent)=>{
  const i=refs.current.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;
  const step=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(!step)return;
  e.preventDefault();const to=(i+step+swatches.length)%swatches.length;refs.current[to]?.focus();
 };
 return <div className="ds-popover-group">
  <span className="ds-label-caps" id={id}>{label}</span>
  <div className="ds-swatches" role="radiogroup" aria-labelledby={id} onKeyDown={onKeyDown}>
   {swatches.map((s,i)=>{const on=s.hex.toUpperCase()===now;
    return <button key={s.hex+i} ref={n=>{refs.current[i]=n}} type="button" role="radio" aria-checked={on} tabIndex={i===at?0:-1}
     className={dsClass('ds-swatch',s.hex==='transparent'&&'ds-swatch-none')} aria-label={s.hex==='transparent'?'No colour':s.name!==s.hex?`${s.name}, ${s.hex}`:s.hex} title={s.name}
     style={{['--swatch' as string]:s.hex} as React.CSSProperties} onClick={()=>onPick(s.hex)}>{on&&<Check aria-hidden="true"/>}</button>})}
  </div>
 </div>;
}

/** Saturation (across) and brightness (up) for one hue: drag, or the arrow keys (Shift: by 10). */
function ColourArea({hsv,onChange,label}:{hsv:HSV;onChange:(next:HSV)=>void;label:string}){
 const ref=React.useRef<HTMLDivElement>(null);
 const at=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();onChange({h:hsv.h,s:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),v:Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height))})};
 return <div ref={ref} className="ds-colour-area" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s*100)}
  aria-valuetext={`Saturation ${Math.round(hsv.s*100)}%, brightness ${Math.round(hsv.v*100)}%`}
  style={{['--hue' as string]:`hsl(${Math.round(hsv.h)} 100% 50%)`} as React.CSSProperties}
  onPointerDown={e=>{(e.target as HTMLElement).setPointerCapture(e.pointerId);at(e)}} onPointerMove={e=>{if(e.buttons)at(e)}}
  onKeyDown={e=>{
   const by=e.shiftKey?0.1:0.01,d:Record<string,[number,number]>={ArrowLeft:[-by,0],ArrowRight:[by,0],ArrowUp:[0,by],ArrowDown:[0,-by]},m=d[e.key];
   if(!m)return;e.preventDefault();onChange({h:hsv.h,s:Math.min(1,Math.max(0,hsv.s+m[0])),v:Math.min(1,Math.max(0,hsv.v+m[1]))});
  }}>
  <span className="ds-colour-thumb" style={{left:`${hsv.s*100}%`,top:`${(1-hsv.v)*100}%`}} aria-hidden="true"/>
 </div>;
}

function ColourPopover({open,anchor,title,value,brand,doc,gradients,none,onChange,onEnd,onClose,pickFromCanvas,gesture}:{
 open:boolean;anchor:React.RefObject<HTMLButtonElement|null>;title:string;value:Paint;brand:Swatch[];doc:EditorDoc;gradients?:boolean;none?:boolean;
 onChange:(p:Paint,gesture?:string)=>void;onEnd:()=>void;onClose:()=>void;pickFromCanvas:()=>Promise<string|null>;gesture:string}){
 const recent=useRecent('colours');
 const [stop,setStop]=React.useState(0);
 const [picking,setPicking]=React.useState(false);
 const g=value.gradient||null,stops=g?sortedStops(g):[],active=g?stops[Math.min(stop,stops.length-1)]:null;
 const colour=active?active.colour:value.colour==='transparent'?'#000000':value.colour;
 const rgba=parseHex(colour)||{r:0,g:0,b:0,a:1};
 // The hue is kept while the colour is grey (a grey has none of its own).
 const [hue,setHue]=React.useState<number|null>(null);
 const hsv0=rgbToHsv(rgba),hsv={...hsv0,h:hsv0.s===0&&hue!==null?hue:hsv0.h};
 const [hexText,setHexText]=React.useState<string|null>(null);
 const key=(part:string)=>`${gesture}:${part}`;
 /** Sets the colour being edited: the solid colour, or the chosen stop of the gradient. */
 const set=(hex:string,part?:string)=>{
  if(g){const next={...g,stops:stops.map((s,i)=>i===Math.min(stop,stops.length-1)?{...s,colour:solidOf(hex)}:s)};onChange({colour:next.stops[0].colour,gradient:next},part&&key(part))}
  else onChange({colour:hex,gradient:null},part&&key(part));
 };
 const pick=(hex:string)=>{set(hex==='transparent'?hex:withAlpha(hex,g?1:alphaOf(colour)));if(hex!=='transparent')recent.add(solidOf(hex))};
 const setType=(t:'solid'|'linear'|'radial')=>{
  if(t==='solid'){onChange({colour:g?stops[0].colour:value.colour,gradient:null});return}
  setStop(0);onChange({colour:g?stops[0].colour:solidOf(colour),gradient:g?{...g,type:t}:gradientFrom(colour,t)});
 };
 async function eyedrop(){
  const Dropper=eyeDropper();
  try{
   let hex:string|null=null;
   if(Dropper)hex=(await new Dropper().open()).sRGBHex;
   else{setPicking(true);hex=await pickFromCanvas()}
   const clean=hex&&cleanTypedHex(hex);
   if(clean){set(g?clean:withAlpha(clean,alphaOf(colour)));recent.add(clean)}
  }catch(e){
   // Escape in the browser's own eyedropper: nothing picked, nothing to say.
   if(!(e instanceof DOMException&&e.name==='AbortError'))console.warn('[editor] the eyedropper did not pick a colour',{reason:e instanceof Error?e.name:'unknown'});
  }finally{setPicking(false)}
 }
 const swatches=[...(none?[{hex:'transparent',name:'No colour'}]:[]),...brand];
 const inDesign=coloursInDesign(doc).filter(c=>!brand.some(b=>b.hex.toUpperCase()===c)).map(hex=>({hex,name:hex}));
 const recentSwatches=recent.list.map(hex=>({hex,name:hex}));
 const typeId=React.useId();
 return <Popover open={open} anchor={anchor} title={title} onClose={()=>{setHexText(null);onClose()}} onEnd={onEnd} hidden={picking} className="ds-colour-popover">
  {gradients&&<div className="ds-popover-group">
   <span className="ds-label-caps" id={typeId}>Fill</span>
   <div className="ds-segmented" role="radiogroup" aria-labelledby={typeId}>
    {(['solid','linear','radial'] as const).map(t=>{const on=(g?g.type:'solid')===t;
     return <button key={t} type="button" role="radio" aria-checked={on} tabIndex={on?0:-1} onClick={()=>setType(t)}
      onKeyDown={e=>{const order=['solid','linear','radial'] as const,i=order.indexOf(t),d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){e.preventDefault();setType(order[(i+d+3)%3]);(e.currentTarget.parentElement?.children[(i+d+3)%3] as HTMLElement)?.focus()}}}>
      {t==='solid'?'Solid':t==='linear'?'Linear':'Radial'}</button>})}
   </div>
  </div>}
  {g&&<GradientStops gradient={g} stop={Math.min(stop,stops.length-1)} onStop={setStop} onChange={(next,part)=>onChange({colour:sortedStops(next)[0].colour,gradient:next},part&&key(part))}/>}
  <SwatchGroup label="Brand colours" swatches={swatches} value={g?colour:value.colour} onPick={pick}/>
  {!brand.length&&<p className="ds-help">No brand colours yet. Add them in Brand on the left.</p>}
  <SwatchGroup label="In this design" swatches={inDesign} value={g?colour:value.colour} onPick={pick}/>
  <SwatchGroup label="Recent" swatches={recentSwatches} value={g?colour:value.colour} onPick={pick}/>
  <div className="ds-popover-group">
   <span className="ds-label-caps">Any colour</span>
   <ColourArea hsv={hsv} label={g?'Saturation and brightness of the chosen stop':'Saturation and brightness'} onChange={n=>{setHue(n.h);set(toHex(hsvToRgb(n,g?1:rgba.a)),'area')}}/>
   <label className="ds-popover-field"><span className="ds-inspector-label">Hue</span>
    <input type="range" className="ds-hue" min={0} max={360} step={1} value={Math.round(hsv.h)} aria-valuetext={`${Math.round(hsv.h)}°`}
     onChange={e=>{const h=Number(e.target.value);setHue(h);set(toHex(hsvToRgb({...hsv,h,s:hsv.s||1,v:hsv.v||1},g?1:rgba.a)),'hue')}}/>
   </label>
   <div className="ds-popover-hex">
    <label className="ds-popover-field"><span className="ds-inspector-label">Hex</span>
     <Input value={hexText??solidOf(colour)} spellCheck={false} autoComplete="off" maxLength={9} aria-invalid={hexText!==null&&!cleanTypedHex(hexText)}
      onChange={e=>{setHexText(e.target.value);const c=cleanTypedHex(e.target.value);if(c)set(g?solidOf(c):e.target.value.replace('#','').length===8?c:withAlpha(c,alphaOf(colour)),'hex')}}
      onBlur={()=>{setHexText(null);onEnd()}}/>
    </label>
    <Button size="sm" icon={<Pipette aria-hidden="true"/>} onClick={()=>void eyedrop()} title={eyeDropper()?'Pick a colour from anywhere on the screen':'Pick a colour from the canvas'}>{eyeDropper()?'Eyedropper':'From the canvas'}</Button>
   </div>
   {!g&&value.colour!=='transparent'&&<label className="ds-popover-field"><span className="ds-inspector-label">Transparency</span>
    <Slider value={100-Math.round(rgba.a*100)} min={0} max={100} step={1} editable={{label:'Transparency, %',unit:'%'}} onValueChange={n=>set(withAlpha(colour,1-n/100),'alpha')}/>
   </label>}
  </div>
 </Popover>;
}

/** A gradient's preview, its stops (one is chosen: the picker edits it), where each sits, and the angle. */
function GradientStops({gradient,stop,onStop,onChange}:{gradient:Gradient;stop:number;onStop:(i:number)=>void;onChange:(g:Gradient,part?:string)=>void}){
 const stops=sortedStops(gradient),id=React.useId(),a=stops[stop];
 const setStops=(next:typeof stops,part?:string)=>onChange({...gradient,stops:next},part);
 return <div className="ds-popover-group">
  <span className="ds-label-caps" id={id}>Stops</span>
  <span className="ds-gradient-preview" style={{background:`linear-gradient(90deg, ${stops.map(s=>`${s.colour} ${Math.round(s.at*100)}%`).join(', ')})`}} aria-hidden="true"/>
  <div className="ds-swatches" role="radiogroup" aria-labelledby={id}>
   {stops.map((s,i)=><button key={i} type="button" role="radio" aria-checked={i===stop} tabIndex={i===stop?0:-1} className="ds-swatch" style={{['--swatch' as string]:s.colour} as React.CSSProperties}
    aria-label={`Stop ${i+1}, ${s.colour} at ${Math.round(s.at*100)}%`} onClick={()=>onStop(i)}
    onKeyDown={e=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){e.preventDefault();const to=(i+d+stops.length)%stops.length;onStop(to);(e.currentTarget.parentElement?.children[to] as HTMLElement)?.focus()}}}>{i===stop&&<Check aria-hidden="true"/>}</button>)}
  </div>
  <label className="ds-popover-field"><span className="ds-inspector-label">Stop {stop+1} position</span>
   <Slider value={Math.round(a.at*100)} min={0} max={100} step={1} editable={{label:`Stop ${stop+1} position, %`,unit:'%'}} onValueChange={n=>setStops(stops.map((s,i)=>i===stop?{...s,at:n/100}:s),'stop-at')}/>
  </label>
  {gradient.type==='linear'&&<label className="ds-popover-field"><span className="ds-inspector-label">Angle</span>
   <Slider value={Math.round(gradient.angle)} min={0} max={360} step={1} editable={{label:'Angle, degrees',unit:'°'}} onValueChange={n=>onChange({...gradient,angle:n},'angle')}/>
  </label>}
  <div className="ds-popover-actions">
   <Button size="sm" icon={<Plus aria-hidden="true"/>} disabled={stops.length>=GRADIENT_STOPS.max} onClick={()=>{
    // A new stop halfway between the chosen one and its neighbour, in their colour.
    const next=stops[stop+1]||stops[stop-1],at=(a.at+(next?.at??1))/2;
    setStops([...stops,{at,colour:a.colour}].sort((x,y)=>x.at-y.at));onStop(stops.filter(s=>s.at<=at).length);
   }}>Add a stop</Button>
   <Button size="sm" kind="danger-quiet" icon={<Trash2 aria-hidden="true"/>} disabled={stops.length<=GRADIENT_STOPS.min} onClick={()=>{setStops(stops.filter((_,i)=>i!==stop));onStop(Math.max(0,stop-1))}}>Remove stop {stop+1}</Button>
  </div>
 </div>;
}
