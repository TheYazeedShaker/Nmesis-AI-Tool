'use client';
import * as React from 'react';
import type {Draft} from 'immer';
import {AlignCenterHorizontal,AlignCenterVertical,AlignEndHorizontal,AlignEndVertical,AlignHorizontalSpaceAround,AlignStartHorizontal,AlignStartVertical,AlignVerticalSpaceAround,ArrowDown,ArrowUp,BringToFront,Copy,Group,SendToBack,Trash2,Type,Ungroup} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Select,Textarea} from '@/components/ds/field';
import {ActionRow,ChoiceRow,InspectorRow,InspectorSection,NumberField,NumberPair,SliderField,SwatchRow,ToggleRow,type Swatch} from '@/components/ds/inspector';
import {useBrandKit} from '@/components/brand/brand-kit';
import {cleanHex} from '@/lib/brand-kit';
import {BLANK_PAGE,boundsOf,descendants,edit,lineHeightOf,lockedIn,opacityOf,pageOf,pictureKey,TEXT_MAX,type Align,type DrawnLayer,type EditorDoc,type Layer,type TextLayer} from '@/lib/editor/doc';
import {fontChoices,knownFont,TEXT_WEIGHTS} from '@/lib/editor/fonts';

// The Design tab of the right panel (docs/editor-rules.md): what is selected
// decides which sections show, always in the fixed order Position & size →
// Appearance → Text → Effects → Arrange (a section that doesn't apply is left
// out). Nothing selected: the page and the brand. Built only from the shared
// panel pieces (components/ds/inspector.tsx). Every field's changes join one
// undo step until focus leaves it; a slider's drag is one step.

type Recipe=(d:Draft<EditorDoc>)=>void;
export type PanelActions={
 change:(recipe:Recipe,gesture?:string)=>boolean;
 endGesture:()=>void;
 duplicate:()=>void;remove:()=>void;group:()=>void;ungroup:()=>void;
 order:(to:'forward'|'backward'|'front'|'back')=>void;
 align:(how:Align)=>void;distribute:(axis:'x'|'y')=>void;
 typeOnCanvas:(id:string)=>void;
};
export const LAYER_KIND:Record<Layer['kind'],string>={image:'Picture',text:'Text',shape:'Shape',line:'Line',frame:'Frame',icon:'Icon',group:'Group'};
const WEIGHT_WORDS:Record<number,string>={400:'Regular',600:'Semibold',700:'Bold'};
const round=(n:number,d=0)=>Math.round(n*10**d)/10**d;

/** The brand kit's colours, then white and black, as swatches. */
function useSwatches(){
 const {kit}=useBrandKit();
 return React.useMemo(()=>{
  const list:Swatch[]=(kit?.colours??[]).flatMap(c=>{const hex=cleanHex(c?.hex);return hex?[{hex,name:c.name?.trim()||hex}]:[]});
  for(const [hex,name] of [['#FFFFFF','White'],['#000000','Black']] as const)if(!list.some(s=>s.hex.toUpperCase()===hex))list.push({hex,name});
  return list;
 },[kit]);
}

export function DesignPanel({doc,page,ids,readOnly,mod,actions,baseTitle}:{doc:EditorDoc;page:string;ids:string[];readOnly:boolean;mod:string;actions:PanelActions;baseTitle:string}){
 const layers=ids.map(id=>doc.layers[id]).filter((l):l is Layer=>!!l);
 // Leaving a field closes its undo step: typing in one field, then another, is two steps.
 return <div className="canvas-design" onBlur={actions.endGesture}>
  {layers.length===0?<PagePanel doc={doc} page={page} readOnly={readOnly} actions={actions} baseTitle={baseTitle}/>
   :layers.length===1&&layers[0].kind!=='group'?<OnePanel layer={layers[0] as DrawnLayer} doc={doc} readOnly={readOnly} mod={mod} actions={actions}/>
   :<ManyPanel doc={doc} layers={layers} readOnly={readOnly} mod={mod} actions={actions}/>}
 </div>;
}

// ── Nothing selected: the page and the brand ──
function PagePanel({doc,page,readOnly,actions,baseTitle}:{doc:EditorDoc;page:string;readOnly:boolean;actions:PanelActions;baseTitle:string}){
 const swatches=useSwatches(),{kit}=useBrandKit();
 const bg=pageOf(doc,page)?.background,colour=bg?.kind==='colour'?bg.colour:BLANK_PAGE;
 const set=(next:Parameters<typeof edit.setBackground>[2],gesture?:string)=>actions.change(d=>edit.setBackground(d,page,next),gesture);
 return <>
  <InspectorSection section="page" title="Page">
   <p className="ds-help">{doc.width} × {doc.height} px. Every page is this size.</p>
   <ChoiceRow label="Background" value={bg?.kind==='colour'?'colour':'picture'} disabled={readOnly}
    choices={[{value:'picture',label:'Your picture',title:baseTitle},{value:'colour',label:'A colour'}]}
    onChange={v=>set(v==='picture'?{kind:'picture',asset:pictureKey(doc.base)}:{kind:'colour',colour})}/>
   {bg?.kind==='colour'&&<SwatchRow label="Background colour" value={bg.colour} swatches={swatches} disabled={readOnly} onPick={hex=>set({kind:'colour',colour:hex})} onCustom={hex=>set({kind:'colour',colour:hex},'background:'+page)}/>}
  </InspectorSection>
  <InspectorSection section="brand" title="Brand">
   {kit&&kit.colours.length>0
    ?<ul className="canvas-brand-colours" aria-label="Brand colours">{kit.colours.map(c=><li key={c.hex}><span className="canvas-brand-dot" style={{['--swatch' as string]:c.hex} as React.CSSProperties} aria-hidden="true"/>{c.name||c.hex} <span className="canvas-brand-hex">{c.hex}</span></li>)}</ul>
    :<p className="ds-help">No brand colours yet. Add them in Brand on the left; they then show first wherever you pick a colour.</p>}
   <p className="ds-help">{kit?`Fonts: ${kit.headingFont} for headings, ${kit.bodyFont} for body text.`:'Fonts: Inter until the brand kit sets its own.'} Select something on the canvas to change it.</p>
  </InspectorSection>
 </>;
}

// ── One layer ──
function OnePanel({layer,doc,readOnly,mod,actions}:{layer:DrawnLayer;doc:EditorDoc;readOnly:boolean;mod:string;actions:PanelActions}){
 const swatches=useSwatches(),{kit}=useBrandKit();
 const locked=lockedIn(doc,layer.id),off=readOnly||locked;
 const patch=(p:Partial<DrawnLayer>,field?:string)=>actions.change(d=>edit.update(d,layer.id,p),field?`${field}:${layer.id}`:undefined);
 const keepRatio=layer.kind==='image'||layer.kind==='icon';
 const isText=layer.kind==='text';
 const opacity=<SliderField label="Opacity" unit="%" min={0} max={100} value={round(opacityOf(layer)*100)} disabled={off} onChange={n=>patch({opacity:n/100},'opacity')}/>;
 return <>
  <InspectorSection section="position" title="Position & size" more={<AlignToPage disabled={off} actions={actions}/>}>
   <NumberPair disabled={off}
    first={{label:'W',unit:'px',min:1,max:doc.width*4,value:layer.width,onChange:w=>patch(keepRatio&&layer.width>0?{width:w,height:round(w*layer.height/layer.width,2)}:{width:w},'w'),title:keepRatio?'Height follows, to keep its shape':undefined}}
    second={{label:'H',unit:'px',min:1,max:doc.height*4,value:layer.height,onChange:h=>patch(keepRatio&&layer.height>0?{height:h,width:round(h*layer.width/layer.height,2)}:{height:h},'h'),title:isText?'Set by the text and its size':undefined}}/>
   <NumberPair disabled={off}
    first={{label:'X',unit:'px',min:-doc.width*4,max:doc.width*4,value:layer.x,onChange:x=>patch({x},'x')}}
    second={{label:'Y',unit:'px',min:-doc.height*4,max:doc.height*4,value:layer.y,onChange:y=>patch({y},'y')}}/>
   <NumberField label="Rotation" unit="°" min={-360} max={360} value={layer.rotation} disabled={off} onChange={rotation=>patch({rotation},'rotation')}/>
  </InspectorSection>
  {layer.kind==='image'&&<InspectorSection section="appearance" title="Appearance">
   {opacity}
   <SliderField label="Corner radius" unit="px" min={0} max={Math.round(Math.min(layer.width,layer.height)/2)} value={round(layer.radius??0)} disabled={off} onChange={radius=>patch({radius},'radius')}/>
   <ToggleRow label="Flip left to right" checked={!!layer.flipX} disabled={off} onChange={flipX=>patch({flipX})}/>
   <ToggleRow label="Flip upside down" checked={!!layer.flipY} disabled={off} onChange={flipY=>patch({flipY})}/>
  </InspectorSection>}
  {(layer.kind==='shape'||layer.kind==='icon'||layer.kind==='line'||layer.kind==='frame')&&<InspectorSection section="appearance" title="Appearance">
   {layer.kind==='shape'&&<>
    <SwatchRow label="Fill" value={layer.fill} swatches={swatches} disabled={off} onPick={fill=>patch({fill})} onCustom={fill=>patch({fill},'fill')}/>
    <SwatchRow label="Outline" value={layer.stroke} swatches={[{hex:'transparent',name:'None'},...swatches]} disabled={off} onPick={stroke=>patch(stroke!=='transparent'&&!layer.strokeWidth?{stroke,strokeWidth:Math.max(2,Math.round(Math.min(doc.width,doc.height)*0.004))}:{stroke})} onCustom={stroke=>patch({stroke},'stroke')}/>
    {layer.stroke!=='transparent'&&<SliderField label="Outline width" unit="px" min={0} max={Math.max(40,Math.round(Math.min(layer.width,layer.height)/4))} value={round(layer.strokeWidth)} disabled={off} onChange={strokeWidth=>patch({strokeWidth},'strokeWidth')}/>}
   </>}
   {layer.kind==='icon'&&<>
    <SwatchRow label="Colour" value={layer.color} swatches={swatches} disabled={off} onPick={color=>patch({color})} onCustom={color=>patch({color},'color')}/>
    <SliderField label="Line weight" min={0.5} max={4} step={0.25} value={layer.strokeWidth} disabled={off} onChange={strokeWidth=>patch({strokeWidth},'strokeWidth')}/>
   </>}
   {(layer.kind==='line'||layer.kind==='frame')&&<>
    <SwatchRow label="Colour" value={layer.stroke} swatches={swatches} disabled={off} onPick={stroke=>patch({stroke})} onCustom={stroke=>patch({stroke},'stroke')}/>
    <SliderField label="Line weight" unit="px" min={1} max={Math.max(40,Math.round(Math.min(doc.width,doc.height)*0.05))} value={round(layer.strokeWidth)} disabled={off} onChange={strokeWidth=>patch({strokeWidth},'strokeWidth')}/>
   </>}
   {layer.kind==='line'&&<>
    <ToggleRow label="Dashed" checked={layer.dash} disabled={off} onChange={dash=>patch({dash})}/>
    <ChoiceRow label="Arrowheads" value={layer.arrow} disabled={off} choices={[{value:'none',label:'None'},{value:'end',label:'One end'},{value:'both',label:'Both ends'}]} onChange={arrow=>patch({arrow})}/>
   </>}
   {layer.kind==='frame'&&<SliderField label="Corner radius" unit="px" min={0} max={Math.round(Math.min(layer.width,layer.height)/2)} value={round(layer.radius)} disabled={off} onChange={radius=>patch({radius},'radius')}/>}
   {opacity}
  </InspectorSection>}
  {isText&&<>
   <InspectorSection section="appearance" title="Appearance">{opacity}</InspectorSection>
   <TextSection layer={layer} swatches={swatches} kit={kit} off={off} mod={mod} actions={actions} patch={patch}/>
   <EffectsSection/>
  </>}
  <ArrangeSection one={layer} doc={doc} readOnly={readOnly} mod={mod} actions={actions}/>
 </>;
}

function TextSection({layer,swatches,kit,off,mod,actions,patch}:{layer:TextLayer;swatches:Swatch[];kit:ReturnType<typeof useBrandKit>['kit'];off:boolean;mod:string;actions:PanelActions;patch:(p:Partial<DrawnLayer>,field?:string)=>boolean}){
 const font=knownFont(layer.font),choices=fontChoices(kit),lh=lineHeightOf(layer);
 const height=(p:{fontSize?:number;lineHeight?:number;text?:string})=>Math.max(1,(p.text??layer.text).split('\n').length)*(p.fontSize??layer.fontSize)*(p.lineHeight??lh);
 return <InspectorSection section="text" title="Text" more={<>
  <SliderField label="Line spacing" unit="×" min={0.8} max={2.5} step={0.05} value={round(lh,2)} disabled={off} onChange={lineHeight=>patch({lineHeight,height:height({lineHeight})},'lineHeight')}/>
  <SliderField label="Letter spacing" unit="px" min={-Math.round(layer.fontSize*0.1)} max={Math.round(layer.fontSize*0.5)} value={round(layer.letterSpacing??0)} disabled={off} onChange={letterSpacing=>patch({letterSpacing},'letterSpacing')}/>
 </>}>
  <InspectorRow label="Words" hint={`${layer.text.length} / ${TEXT_MAX}. Or double-click the text on the canvas.`}>
   <Textarea rows={3} maxLength={TEXT_MAX} value={layer.text} disabled={off} onChange={e=>patch({text:e.target.value,height:height({text:e.target.value})},'text')}/>
  </InspectorRow>
  <ActionRow><Button size="sm" icon={<Type aria-hidden="true"/>} disabled={off} onClick={()=>actions.typeOnCanvas(layer.id)} title="Or press Enter with the text selected">Type on the canvas</Button></ActionRow>
  <InspectorRow label="Font">
   <Select value={font} disabled={off} onChange={e=>patch({font:e.target.value})}>{!choices.some(c=>c.font===font)&&<option value={font}>{font}</option>}{choices.map(c=><option key={c.font} value={c.font}>{c.label}</option>)}</Select>
  </InspectorRow>
  <NumberField label="Size" unit="px" min={4} max={4000} value={layer.fontSize} disabled={off} onChange={fontSize=>patch({fontSize,height:height({fontSize})},'fontSize')}/>
  <ChoiceRow label="Weight" value={String(layer.fontWeight)} disabled={off} choices={[...TEXT_WEIGHTS].map(w=>({value:String(w),label:WEIGHT_WORDS[w]||String(w)}))} onChange={w=>patch({fontWeight:Number(w)})}/>
  <ChoiceRow label="Alignment" value={layer.align} disabled={off} choices={[{value:'left',label:'Left'},{value:'center',label:'Centre'},{value:'right',label:'Right'}]} onChange={align=>patch({align})}/>
  <SwatchRow label="Colour" value={layer.color} swatches={swatches} disabled={off} onPick={color=>patch({color})} onCustom={color=>patch({color},'color')}/>
  <p className="ds-help">{mod}D duplicates; Enter types on the canvas.</p>
 </InspectorSection>;
}

/** Text effects (one at a time, the owner's decision): the row is here; the effects come in a later update. */
function EffectsSection(){
 return <InspectorSection section="effects" title="Effects">
  <ChoiceRow label="Effect" value="none" onChange={()=>{}} choices={[{value:'none',label:'None'},{value:'shadow',label:'Shadow',title:'Coming in a later update',disabled:true},{value:'outline',label:'Outline',title:'Coming in a later update',disabled:true}]}/>
  <p className="ds-help">One effect at a time. Shadow and Outline come in a later update.</p>
 </InspectorSection>;
}

function AlignToPage({disabled,actions}:{disabled:boolean;actions:PanelActions}){
 return <AlignButtons label="Align to the page" disabled={disabled} onAlign={actions.align}/>;
}
const ALIGN_BUTTONS:{how:Align;label:string;icon:React.ReactNode}[]=[
 {how:'left',label:'Left',icon:<AlignStartVertical aria-hidden="true"/>},{how:'centre',label:'Centre',icon:<AlignCenterVertical aria-hidden="true"/>},{how:'right',label:'Right',icon:<AlignEndVertical aria-hidden="true"/>},
 {how:'top',label:'Top',icon:<AlignStartHorizontal aria-hidden="true"/>},{how:'middle',label:'Middle',icon:<AlignCenterHorizontal aria-hidden="true"/>},{how:'bottom',label:'Bottom',icon:<AlignEndHorizontal aria-hidden="true"/>},
];
function AlignButtons({label,disabled,onAlign}:{label:string;disabled:boolean;onAlign:(how:Align)=>void}){
 const id=React.useId();
 return <div className="ds-inspector-row" data-editor-row>
  <span className="ds-inspector-label" data-editor-label id={id}>{label}</span>
  <div className="canvas-align-grid" role="group" aria-labelledby={id}>
   {ALIGN_BUTTONS.map(b=><Button key={b.how} size="sm" icon={b.icon} disabled={disabled} onClick={()=>onAlign(b.how)}>{b.label}</Button>)}
  </div>
 </div>;
}

// ── Several layers, or a group ──
function ManyPanel({doc,layers,readOnly,mod,actions}:{doc:EditorDoc;layers:Layer[];readOnly:boolean;mod:string;actions:PanelActions}){
 const ids=layers.map(l=>l.id),b=boundsOf(doc,ids),off=readOnly;
 const movable=ids.filter(id=>!lockedIn(doc,id));
 const drawn=ids.flatMap(id=>descendants(doc,id));
 const key=ids.join(',');
 const moveTo=(x:number|null,y:number|null)=>{if(!b)return;const dx=x===null?0:x-b.x,dy=y===null?0:y-b.y;actions.change(d=>{for(const id of movable)edit.nudge(d,id,dx,dy)},(x===null?'y:':'x:')+key)};
 const shared=drawn.length?opacityOf(drawn[0]):1,same=drawn.every(l=>opacityOf(l)===shared);
 const oneGroup=layers.length===1&&layers[0].kind==='group';
 return <>
  <InspectorSection section="position" title="Position & size">
   <p className="ds-help">{oneGroup?`A group of ${drawn.length} layers.`:`${layers.length} layers selected.`} Resize them together with the handles on the canvas.</p>
   {b&&<NumberPair disabled
    first={{label:'W',unit:'px',min:0,max:doc.width*8,value:round(b.width),onChange:()=>{},title:'Resize with the handles on the canvas'}}
    second={{label:'H',unit:'px',min:0,max:doc.height*8,value:round(b.height),onChange:()=>{},title:'Resize with the handles on the canvas'}}/>}
   {b&&<NumberPair disabled={off||!movable.length}
    first={{label:'X',unit:'px',min:-doc.width*4,max:doc.width*4,value:round(b.x),onChange:x=>moveTo(x,null)}}
    second={{label:'Y',unit:'px',min:-doc.height*4,max:doc.height*4,value:round(b.y),onChange:y=>moveTo(null,y)}}/>}
   <AlignButtons label={oneGroup?'Align to the page':'Align to each other'} disabled={off||!movable.length} onAlign={actions.align}/>
   {!oneGroup&&<div className="ds-inspector-row" data-editor-row>
    <span className="ds-inspector-label" data-editor-label id="canvas-distribute">Distribute</span>
    <ActionRow label="Distribute">
     <Button size="sm" icon={<AlignHorizontalSpaceAround aria-hidden="true"/>} disabled={off||movable.length<3} onClick={()=>actions.distribute('x')} title="Even gaps from left to right (three or more layers)">Across</Button>
     <Button size="sm" icon={<AlignVerticalSpaceAround aria-hidden="true"/>} disabled={off||movable.length<3} onClick={()=>actions.distribute('y')} title="Even gaps from top to bottom (three or more layers)">Down</Button>
    </ActionRow>
   </div>}
  </InspectorSection>
  {drawn.length>0&&<InspectorSection section="appearance" title="Appearance">
   <SliderField label={same?'Opacity':'Opacity (they differ)'} unit="%" min={0} max={100} value={round(shared*100)} disabled={off}
    onChange={n=>actions.change(d=>{for(const l of drawn)if(!lockedIn(doc,l.id))edit.update(d,l.id,{opacity:n/100})},'opacity:'+key)}/>
  </InspectorSection>}
  <ArrangeSection many={layers} doc={doc} readOnly={readOnly} mod={mod} actions={actions}/>
 </>;
}

// ── Arrange: order, group, duplicate, delete, lock ──
function ArrangeSection({one,many,doc,readOnly,mod,actions}:{one?:DrawnLayer;many?:Layer[];doc:EditorDoc;readOnly:boolean;mod:string;actions:PanelActions}){
 const list=one?[one]:many||[],ids=list.map(l=>l.id);
 const locked=ids.every(id=>doc.layers[id]?.locked);
 const groups=list.filter(l=>l.kind==='group');
 return <InspectorSection section="arrange" title="Arrange" more={<>
  <ActionRow label="Order, all the way">
   <Button size="sm" icon={<BringToFront aria-hidden="true"/>} disabled={readOnly} onClick={()=>actions.order('front')} title={`${mod}Shift+]`}>To front</Button>
   <Button size="sm" icon={<SendToBack aria-hidden="true"/>} disabled={readOnly} onClick={()=>actions.order('back')} title={`${mod}Shift+[`}>To back</Button>
  </ActionRow>
  <ToggleRow label="Lock in place" checked={locked} disabled={readOnly} onChange={on=>actions.change(d=>{for(const id of ids)edit.setFlags(d,id,{locked:on})})}/>
 </>}>
  <ActionRow label="Order">
   <Button size="sm" icon={<ArrowUp aria-hidden="true"/>} disabled={readOnly} onClick={()=>actions.order('forward')} title={`${mod}]`}>Forward</Button>
   <Button size="sm" icon={<ArrowDown aria-hidden="true"/>} disabled={readOnly} onClick={()=>actions.order('backward')} title={`${mod}[`}>Backward</Button>
  </ActionRow>
  <ActionRow label="Layer actions">
   {list.length>1&&<Button size="sm" icon={<Group aria-hidden="true"/>} disabled={readOnly} onClick={actions.group} title={`${mod}G`}>Group</Button>}
   {groups.length>0&&<Button size="sm" icon={<Ungroup aria-hidden="true"/>} disabled={readOnly} onClick={actions.ungroup} title={`${mod}Shift+G`}>Ungroup</Button>}
   <Button size="sm" icon={<Copy aria-hidden="true"/>} disabled={readOnly} onClick={actions.duplicate} title={`${mod}D`}>Duplicate</Button>
   <Button size="sm" kind="danger-quiet" icon={<Trash2 aria-hidden="true"/>} disabled={readOnly} onClick={actions.remove} title="Delete">Delete</Button>
  </ActionRow>
 </InspectorSection>;
}
