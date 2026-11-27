'use client';
import * as React from 'react';
import {Arrow,Ellipse,Group,Image as KImage,Layer as KLayer,Line,Path,Rect,Shape,Stage,Text,TextPath,Transformer} from 'react-konva';
import {drawTatweel,hasArabic,joinPieces,placeOnArc,shapePieces,visualOrder,withJoiner} from '@/lib/editor/curve-shaping';
import Konva from 'konva';
import {assetSrc,boundsOf,descendants,drawOrder,hiddenIn,ICON_GRID,lineHeightOf,lockedIn,opacityOf,pageOf,snapBox,topOf,type DrawnLayer,type EditorDoc,type Gap,type Guide} from '@/lib/editor/doc';
import {backgroundBox,curveGeometry,neonGlow,textPaint} from '@/lib/editor/effects';
import {konvaGradient} from '@/lib/editor/colour';
import {useCanvasImage} from './images';
import type {CanvasFonts} from './fonts';
import {isRtl,lineWidth,oneLine} from './measure';
import {drawnTextToken,renderStateOf,RENDER_ATTR,TEXT_DRAWN_ATTR,type DrawnText,type FontState,type TextDrawer} from '@/lib/editor/render-signal';

// The canvas (Konva, drawn by react-konva). The stage is scaled to fit the
// space it is given; every layer keeps the picture's own pixels, so exporting
// at 1 / scale is the picture's full resolution. It draws one page of the
// design (format v2, lib/editor/doc.ts): its background and its layers in
// drawing order; hidden layers (or layers in a hidden group) are not drawn,
// locked ones do not move.
//
// Selecting: a click selects what was clicked; a layer inside a group selects
// the group (the Layers list selects a single layer inside one). Shift-click
// adds or removes. Moving: drag. One layer drags itself; a group or several
// layers drag together through one "mover" over the selection, so they snap
// as one box and land as one undo step. Snapping: to the page's edges and
// centre lines, to the other layers' edges and centres (smart guides, drawn
// between the boxes they join), and to equal spacing (spacing marks); holding
// Ctrl or Cmd while dragging turns it off. Alt-drag on one layer leaves a copy
// behind, in the same undo step. The handles resize and rotate the whole
// selection (one undo step). Double-click text to type in it, in place
// (components/canvas/text-editor.tsx). Guides and handles live on their own
// layer, hidden while exporting. Text effects (lib/editor/effects.ts), gradients
// (lib/editor/colour.ts) and the fonts are Konva settings on these same nodes, so
// the export (the same stage at the picture's pixel ratio) draws exactly what the
// canvas shows. Right-to-left text (Arabic) is drawn in one run, so its letters join.

export type StageHandle={stage:Konva.Stage|null;ui:Konva.Layer|null;
 /** The colour drawn at a point of the page (picture pixels), without the handles: the eyedropper's fallback. */
 colourAt:(x:number,y:number)=>string|null;
 /** The page's background under a box (picture pixels), averaged: what a text over a picture is read against. */
 averageUnder:(box:{x:number;y:number;width:number;height:number})=>string|null};
type Props={
 doc:EditorDoc;pageId:string;shownWidth:number;
 /** What is selected: layers and groups on this page. */selected:readonly string[];
 reducedMotion:boolean;fonts:CanvasFonts;
 /** The text layer being typed in (drawn by the text box over the canvas, not here). */editing:string|null;
 /** Read only (someone else is editing, or a viewer): nothing moves. */readOnly?:boolean;
 onSelect:(id:string|null,mode:'replace'|'toggle')=>void;onChange:(id:string,patch:Partial<DrawnLayer>,gesture?:string)=>void;onEditText:(id:string)=>void;
 /** Alt held as a drag starts: the editor makes a copy where the layer is (in this drag's gesture) and gives its id. */onAltDrag:(id:string,gesture:string)=>string|null;
 /** A drag, resize or rotation is over: its undo step is closed. */onGestureEnd:()=>void;
 handle:React.RefObject<StageHandle>;
};

/** The design system's colours for the handles and guides, read from the page (Konva draws on a canvas). */
function useTokenColours(){
 // The stage only renders in the browser (loaded with ssr: false), so the page's styles can be read at once.
 const [c]=React.useState(()=>{const s=getComputedStyle(document.documentElement);return {accent:s.getPropertyValue('--ds-accent').trim(),ring:s.getPropertyValue('--ds-ring').trim(),ink:s.getPropertyValue('--ds-accent-ink').trim()}});
 return c;
}

const star=(w:number,h:number)=>Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?0.42:1;return [w/2+Math.cos(a)*r*w/2,h/2+Math.sin(a)*r*h/2]}).flat();
const polygon=(w:number,h:number,sides:number)=>Array.from({length:sides},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/sides;return [w/2+Math.cos(a)*w/2,h/2+Math.sin(a)*h/2]}).flat();
const round2=(n:number)=>Math.round(n*100)/100;
const noSnap=(e:{evt?:unknown})=>{const v=e.evt as MouseEvent|undefined;return !!(v&&(v.ctrlKey||v.metaKey))};

/** The pieces the shaping drawer placed in its last drawing, per shape (what `data-text-drawn` reports). */
const shapedMarks=new WeakMap<Konva.Node,number>();
/** The attributes that say which drawer draws a text layer (read after each drawing, lib/editor/render-signal.ts). */
const drawnAs=(layer:{id:string;effect?:{kind:string}},drawer:TextDrawer,font:FontState)=>({'data-text-of':layer.id,'data-effect':layer.effect?.kind??'none','data-drawer':drawer,'data-font-state':font});

function TextBody({layer,fonts}:{layer:Extract<DrawnLayer,{kind:'text'}>;fonts:CanvasFonts}){
 // A new key when the font arrives (or is missing): the text is measured again in the font it is drawn in.
 const {family,key,state}=fonts.family(layer.font,layer.fontWeight,layer.italic);
 const fontStyle=(layer.italic?'italic ':'')+layer.fontWeight,direction=isRtl(layer.text)?'rtl':'ltr';
 const e=layer.effect;
 if(e?.kind==='curve'){
  const line=oneLine(layer.text),geo=curveGeometry(lineWidth(layer,family),layer.fontSize,e.curve,layer.width);
  // A full-size box behind the arc, so a click anywhere on it picks the text (the letters alone are thin).
  if(hasArabic(line)){
   // Arabic: shaped first (each letter with the joiners its neighbours give it), then placed on the arc (lib/editor/curve-shaping.ts).
   // The joiner is the one this browser draws exactly in this font (joinPieces): measured where it is drawn, the export too.
   const pieces=visualOrder(shapePieces(line)),font=`${fontStyle} ${layer.fontSize}px ${family}`,bleed=Math.max(0.5,layer.fontSize*0.015);
   return <>
    <Rect width={layer.width} height={geo.height} fill="transparent"/>
    <Shape key={key} listening={false} width={layer.width} height={geo.height} data-curve-shaped data-font={font} {...drawnAs(layer,'shaped',state)} sceneFunc={(ctx,shape)=>{
     ctx.setAttr('font',font);ctx.setAttr('fillStyle',layer.color);ctx.setAttr('textBaseline','middle');ctx.setAttr('textAlign','center');
     const {joiner,widths,tatweel}=joinPieces(pieces,line,(s,rtl)=>{ctx.setAttr('direction',rtl?'rtl':'ltr');return ctx.measureText(s).width});
     const placed=placeOnArc(pieces,{widths,letterSpacing:layer.letterSpacing??0,fontSize:layer.fontSize,curve:e.curve,boxWidth:layer.width,height:geo.height,radius:geo.radius});
     for(const g of placed){
      ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rotation);ctx.setAttr('direction',g.piece.rtl?'rtl':'ltr');
      if(joiner==='tatweel'&&(g.piece.joinsPrev||g.piece.joinsNext)){
       // The tatweels' own strokes are cut away: the letter is drawn in its joined form, to its own width.
       const t=drawTatweel(g.piece,g.width,tatweel,bleed),far=layer.fontSize*4,left=Math.max(t.left,-far),right=Math.min(t.right,far);
       ctx.beginPath();ctx.rect(left,-far,right-left,far*2);ctx.clip();
       ctx.fillText(withJoiner(g.piece,'tatweel'),t.x,0);
      }else ctx.fillText(g.piece.draw,0,0);
      ctx.restore();
     }
     shapedMarks.set(shape,placed.length);
    }}/>
   </>;
  }
  return <>
   <Rect width={layer.width} height={geo.height} fill="transparent"/>
   <TextPath key={key} {...drawnAs(layer,'path',state)} data={geo.path} text={line} fontSize={layer.fontSize} fontFamily={family} fontStyle={fontStyle} letterSpacing={layer.letterSpacing??0} fill={layer.color} align="center" textBaseline="middle" direction={direction}/>
  </>;
 }
 const common={width:layer.width,text:layer.text,fontSize:layer.fontSize,fontFamily:family,fontStyle,align:layer.align,lineHeight:lineHeightOf(layer),letterSpacing:layer.letterSpacing??0,wrap:'word',direction};
 // The Background effect's box follows the text's own drawn height (its wrapped lines).
 const height=e?.kind==='background'?new Konva.Text(common).height():0;
 const box=backgroundBox(layer,layer.width,height),glow=neonGlow(layer);
 return <>
  {box&&<Rect {...box}/>}
  {glow&&<Text {...common} {...glow} listening={false}/>}
  <Text key={key} {...drawnAs(layer,'text',state)} {...common} {...textPaint(layer)}/>
 </>;
}

/** After a drawing of the content layer: what it drew, on the stage's element (lib/editor/render-signal.ts). */
function sayDrawn(layer:Konva.Layer,el:HTMLElement){
 const texts=layer.find((n:Konva.Node)=>!!n.getAttr('data-drawer')).map((n):DrawnText=>{
  const drawer=n.getAttr('data-drawer') as TextDrawer;
  return {id:String(n.getAttr('data-text-of')),effect:String(n.getAttr('data-effect')),drawer,font:n.getAttr('data-font-state') as FontState,
   marks:drawer==='shaped'?shapedMarks.get(n)??0:String(n.getAttr('text')??'').length};
 });
 const said=texts.map(drawnTextToken).filter(Boolean).join(' '),state=renderStateOf(texts);
 if(el.getAttribute(TEXT_DRAWN_ATTR)!==said)el.setAttribute(TEXT_DRAWN_ATTR,said);
 if(el.getAttribute(RENDER_ATTR)!==state)el.setAttribute(RENDER_ATTR,state);
}

function Body({layer,scale,fonts}:{layer:DrawnLayer;scale:number;fonts:CanvasFonts}){
 const {width:w,height:h}=layer,hit=Math.max(12/scale,1);
 if(layer.kind==='image')return <PictureBody layer={layer}/>;
 if(layer.kind==='text')return <TextBody layer={layer} fonts={fonts}/>;
 if(layer.kind==='icon'){
  // The icon's own grid (24 x 24 unless it says) scaled to the layer: vector paths, drawn sharp at any size and at
  // export; lines in its colour, or filled with it (a solid set).
  const grid=layer.grid??ICON_GRID;
  return <Group scaleX={w/grid} scaleY={h/grid}>
   <Rect width={grid} height={grid} fill="transparent"/>
   {layer.paths.map((d,i)=>layer.fill
    ?<Path key={i} data={d} fill={layer.color} strokeEnabled={false}/>
    :<Path key={i} data={d} stroke={layer.color} strokeWidth={layer.strokeWidth} lineCap="round" lineJoin="round" fillEnabled={false} hitStrokeWidth={Math.max(layer.strokeWidth,hit*grid/Math.max(w,1))}/>)}
  </Group>;
 }
 if(layer.kind==='line'){
  const points=[0,h/2,w,h/2];
  return layer.arrow==='none'
   ?<Line points={points} stroke={layer.stroke} strokeWidth={layer.strokeWidth} dash={layer.dash?[layer.strokeWidth*3,layer.strokeWidth*2]:undefined} lineCap="round" hitStrokeWidth={hit}/>
   :<Arrow points={points} stroke={layer.stroke} fill={layer.stroke} strokeWidth={layer.strokeWidth} pointerLength={layer.strokeWidth*4} pointerWidth={layer.strokeWidth*4} pointerAtBeginning={layer.arrow==='both'} dash={layer.dash?[layer.strokeWidth*3,layer.strokeWidth*2]:undefined} hitStrokeWidth={hit}/>;
 }
 if(layer.kind==='frame')return <Rect width={w} height={h} stroke={layer.stroke} strokeWidth={layer.strokeWidth} cornerRadius={layer.radius} hitStrokeWidth={hit} fillEnabled={false}/>;
 const paint=(ox=0,oy=0)=>({fill:layer.fill,stroke:layer.stroke==='transparent'?undefined:layer.stroke,strokeWidth:layer.strokeWidth,...(layer.gradient?konvaGradient(layer.gradient,w,h,ox,oy):{})});
 if(layer.shape==='circle')return <Ellipse x={w/2} y={h/2} radiusX={w/2} radiusY={h/2} {...paint(w/2,h/2)}/>;
 if(layer.shape==='rect'||layer.shape==='rounded')return <Rect width={w} height={h} cornerRadius={layer.shape==='rounded'?Math.min(w,h)*0.18:0} {...paint()}/>;
 const points=layer.shape==='triangle'?[w/2,0,w,h,0,h]:layer.shape==='star'?star(w,h):polygon(w,h,6);
 return <Line points={points} closed {...paint()}/>;
}

function PictureBody({layer}:{layer:Extract<DrawnLayer,{kind:'image'}>}){
 const {img}=useCanvasImage(assetSrc(layer.asset));
 const {width:w,height:h}=layer;
 // A flip mirrors the picture inside its own box: the box (and the handles) stay where they are.
 return img?<KImage image={img} width={w} height={h} cornerRadius={layer.radius||0} scaleX={layer.flipX?-1:1} scaleY={layer.flipY?-1:1} x={layer.flipX?w:0} y={layer.flipY?h:0}/>
  :<Rect width={w} height={h} dash={[8,6]} stroke="gray" strokeWidth={2}/>;
}

let gestures=0;
type NodeProps={
 layer:DrawnLayer;doc:EditorDoc;pageId:string;scale:number;reducedMotion:boolean;fonts:CanvasFonts;editing:boolean;readOnly:boolean;
 /** It moves by itself (on the page, or the one layer picked inside a group, and not part of a selection of several). */draggable:boolean;
 register:(id:string,node:Konva.Group|null)=>void;
 onPress:(id:string,shift:boolean)=>void;onChange:(id:string,patch:Partial<DrawnLayer>,gesture?:string)=>void;onGuides:(g:Guide[],gaps:Gap[])=>void;onEditText:(id:string)=>void;
 onAltDrag:(id:string,gesture:string)=>string|null;onGestureEnd:()=>void;transformGesture:()=>string|undefined;
};
function LayerNode({layer,doc,pageId,scale,reducedMotion,fonts,editing,readOnly,draggable,register,onPress,onChange,onGuides,onEditText,onAltDrag,onGestureEnd,transformGesture}:NodeProps){
 const ref=React.useRef<Konva.Group|null>(null);
 // This drag: its undo step (one per gesture) and, with Alt, the copy left where the layer was.
 const drag=React.useRef<{gesture:string;copy:string|null}|null>(null);
 const opacity=opacityOf(layer);
 // A new layer fades in (it appears where the eye is not yet looking); nothing else animates.
 React.useEffect(()=>{const n=ref.current;if(!n||reducedMotion)return;const to=n.opacity();n.opacity(0);n.to({opacity:to,duration:0.12})},[reducedMotion]);
 return <Group ref={node=>{ref.current=node;register(layer.id,node)}} name="layer" x={layer.x} y={layer.y} rotation={layer.rotation} opacity={opacity} draggable={draggable&&!editing&&!readOnly} visible={!editing}
  onMouseDown={e=>onPress(layer.id,!!(e.evt as MouseEvent).shiftKey)} onTap={()=>onPress(layer.id,false)}
  onDblClick={()=>{if(layer.kind==='text')onEditText(layer.id)}} onDblTap={()=>{if(layer.kind==='text')onEditText(layer.id)}}
  onDragStart={e=>{
   // Shift-click picks; it doesn't move.
   if((e.evt as MouseEvent|undefined)?.shiftKey){e.target.stopDrag();return}
   const gesture=`drag:${layer.id}:${++gestures}`,alt=!!(e.evt as MouseEvent|undefined)?.altKey;
   drag.current={gesture,copy:alt?onAltDrag(layer.id,gesture):null};
  }}
  onDragMove={e=>{
   const n=e.target;if(noSnap(e)){onGuides([],[]);return}
   const b=boundsOf(doc,[layer.id]);if(!b)return;
   const dx=n.x()-layer.x,dy=n.y()-layer.y;
   const s=snapBox(doc,pageId,{...b,x:b.x+dx,y:b.y+dy},new Set([layer.id]),6/scale);
   n.position({x:n.x()+s.dx,y:n.y()+s.dy});onGuides(s.guides,s.gaps);
  }}
  onDragEnd={e=>{
   onGuides([],[]);
   const d=drag.current;drag.current=null;if(!d)return;
   const at={x:round2(e.target.x()),y:round2(e.target.y())};
   // Alt-drag: the copy goes where the layer was dropped; the original stays where it was.
   if(d.copy){e.target.position({x:layer.x,y:layer.y});onChange(d.copy,at,d.gesture)}
   else onChange(layer.id,at,d.gesture);
   onGestureEnd();
  }}
  onTransformEnd={e=>{
   // The handles moved this node (alone, or with the rest of the selection): its new box, in the transform's one undo step.
   const n=e.target,sx=Math.abs(n.scaleX()),sy=Math.abs(n.scaleY());n.scale({x:1,y:1});n.skew({x:0,y:0});
   const base={x:round2(n.x()),y:round2(n.y()),rotation:Math.round(n.rotation()*10)/10,width:Math.max(4,round2(layer.width*sx)),height:Math.max(2,round2(layer.height*sy))};
   onChange(layer.id,layer.kind==='text'?{...base,fontSize:Math.max(4,Math.round(layer.fontSize*sy))}:base,transformGesture());
  }}>
  <Body layer={layer} scale={scale} fonts={fonts}/>
 </Group>;
}

function Background({doc,pageId}:{doc:EditorDoc;pageId:string}){
 const bg=pageOf(doc,pageId)?.background;
 const {img}=useCanvasImage(bg?.kind==='picture'?assetSrc(bg.asset):null);
 if(bg?.kind==='colour')return <Rect name="background" width={doc.width} height={doc.height} fill={bg.colour} {...(bg.gradient?konvaGradient(bg.gradient,doc.width,doc.height):{})}/>;
 return img?<KImage name="background" image={img} width={doc.width} height={doc.height}/>:<Rect name="background" width={doc.width} height={doc.height} fill="gray" opacity={0.2}/>;
}

/** The topmost drawn layer under a point of the page (its rotated box), for clicks on the mover. */
function layerAt(doc:EditorDoc,pageId:string,px:number,py:number):DrawnLayer|null{
 for(const l of [...drawOrder(doc,pageId)].reverse()){
  if(hiddenIn(doc,l.id))continue;
  const r=-l.rotation*Math.PI/180,dx=px-l.x,dy=py-l.y,lx=dx*Math.cos(r)-dy*Math.sin(r),ly=dx*Math.sin(r)+dy*Math.cos(r);
  if(lx>=0&&ly>=0&&lx<=l.width&&ly<=Math.max(l.height,1))return l;
 }
 return null;
}

export default function CanvasStage({doc,pageId,shownWidth,selected,reducedMotion,fonts,editing,readOnly=false,onSelect,onChange,onEditText,onAltDrag,onGestureEnd,handle}:Props){
 const scale=shownWidth/doc.width,colours=useTokenColours();
 // Handles big enough for a finger on a touch screen (WCAG 2.5.8), small with a mouse.
 const [touch]=React.useState(()=>window.matchMedia('(pointer: coarse)').matches);
 const stageRef=React.useRef<Konva.Stage|null>(null),uiRef=React.useRef<Konva.Layer|null>(null),trRef=React.useRef<Konva.Transformer|null>(null),moverRef=React.useRef<Konva.Rect|null>(null);
 const nodes=React.useRef(new Map<string,Konva.Group>());
 const [marks,setMarks]=React.useState<{guides:Guide[];gaps:Gap[]}>({guides:[],gaps:[]});
 const onGuides=React.useCallback((guides:Guide[],gaps:Gap[])=>setMarks(m=>!guides.length&&!gaps.length&&!m.guides.length&&!m.gaps.length?m:{guides,gaps}),[]);
 const register=React.useCallback((id:string,node:Konva.Group|null)=>{if(node)nodes.current.set(id,node);else nodes.current.delete(id)},[]);
 const contentRef=React.useRef<Konva.Layer|null>(null);
 // The canvas says when it has drawn what it holds now (lib/editor/render-signal.ts). Each drawing of the content
 // layer reports what it drew; each commit (the canvas nodes are already updated when this runs) says "drawing"
 // and asks for a drawing, so "ready" always follows the latest change. Pictures arrive on their own time.
 React.useLayoutEffect(()=>{
  const layer=contentRef.current,el=stageRef.current?.container();if(!layer||!el)return;
  layer.on('draw.render',()=>sayDrawn(layer,el));
  return()=>{layer.off('draw.render')};
 },[]);
 React.useLayoutEffect(()=>{
  const layer=contentRef.current,el=stageRef.current?.container();if(!layer||!el)return;
  if(el.getAttribute(RENDER_ATTR)!=='drawing')el.setAttribute(RENDER_ATTR,'drawing');
  layer.batchDraw();
 });
 React.useImperativeHandle(handle,()=>({get stage(){return stageRef.current},get ui(){return uiRef.current},
  colourAt(x:number,y:number){
   const layer=contentRef.current;if(!layer)return null;
   const c=layer.toCanvas({x:x*scale,y:y*scale,width:1,height:1,pixelRatio:1}).getContext('2d')?.getImageData(0,0,1,1).data;
   if(!c)return null;
   const hex=(n:number)=>n.toString(16).padStart(2,'0').toUpperCase();
   return '#'+hex(c[0])+hex(c[1])+hex(c[2]);
  },
  averageUnder(box){
   const bg=contentRef.current?.findOne('.background');if(!bg||!(box.width>0&&box.height>0))return null;
   try{
    const w=Math.max(1,Math.round(box.width*scale)),h=Math.max(1,Math.round(box.height*scale)),ratio=Math.min(1,24/Math.max(w,h));
    const canvas=bg.toCanvas({x:box.x*scale,y:box.y*scale,width:w,height:h,pixelRatio:ratio}),ctx=canvas.getContext('2d');
    const d=ctx?.getImageData(0,0,canvas.width,canvas.height).data;if(!d||!d.length)return null;
    let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++}
    if(!n)return null;
    const hex=(v:number)=>Math.round(v/n).toString(16).padStart(2,'0').toUpperCase();
    return '#'+hex(r)+hex(g)+hex(b);
   // The picture not drawn yet (or unreadable): no hint until it is.
   }catch{return null}
  }}),[scale]);
 const drawn=drawOrder(doc,pageId).filter(l=>!hiddenIn(doc,l.id));
 const chosen=React.useMemo(()=>new Set(selected),[selected]);
 // The layers the handles hold: everything selected, groups opened, minus what is hidden or being typed in.
 const held=selected.flatMap(id=>descendants(doc,id)).filter(l=>!hiddenIn(doc,l.id)&&l.id!==editing);
 const several=held.length>1||selected.some(id=>doc.layers[id]?.kind==='group');
 const anyLocked=selected.some(id=>lockedIn(doc,id)||descendants(doc,id).some(l=>lockedIn(doc,l.id)));
 const one=!several&&held.length===1?held[0]:null;
 const heldKey=held.map(l=>l.id).join(',');
 React.useEffect(()=>{
  const tr=trRef.current;if(!tr)return;
  const list=readOnly||anyLocked?[]:heldKey.split(',').filter(Boolean).map(id=>nodes.current.get(id)).filter((n):n is Konva.Group=>!!n);
  tr.nodes(list);tr.getLayer()?.batchDraw();
 },[heldKey,doc,fonts,readOnly,anyLocked,pageId]);

 // One transform (resize or rotate, of one layer or several) is one undo step: every node's change joins it, then it closes.
 const transform=React.useRef<string|undefined>(undefined);
 const transformGesture=React.useCallback(()=>transform.current,[]);

 // Pressing a layer: Shift adds or removes; otherwise it is picked (a layer in a group picks the group, unless it is the
 // one layer already picked). A press that picks a group starts dragging it at once, through the mover.
 const pressed=React.useRef(false),dragMover=React.useRef(false);
 const onPress=React.useCallback((id:string,shift:boolean)=>{
  const target=chosen.has(id)?id:topOf(doc,id);
  if(shift){onSelect(target,'toggle');return}
  if(chosen.has(target))return;
  onSelect(target,'replace');
  if(target!==id||doc.layers[target]?.kind==='group')dragMover.current=true;
 },[chosen,doc,onSelect]);
 const box=several?boundsOf(doc,selected as string[]):null;
 React.useEffect(()=>{
  if(!dragMover.current)return;dragMover.current=false;
  const m=moverRef.current;if(m&&pressed.current&&!m.isDragging())m.startDrag();
 });

 // The mover: dragging a group or several layers as one box (snapped as one), one undo step.
 const moving=React.useRef<{start:{x:number;y:number};nodes:Map<string,{x:number;y:number}>;gesture:string}|null>(null);
 const moverStart=()=>{
  const m=moverRef.current;if(!m)return;
  const starts=new Map(held.filter(l=>!lockedIn(doc,l.id)).map(l=>[l.id,{x:l.x,y:l.y}]));
  moving.current={start:{x:m.x(),y:m.y()},nodes:starts,gesture:`move:${heldKey}:${++gestures}`};
 };
 const moverMove=(e:Konva.KonvaEventObject<DragEvent>)=>{
  const m=moverRef.current,mv=moving.current;if(!m||!mv||!box)return;
  let dx=m.x()-mv.start.x,dy=m.y()-mv.start.y;
  if(noSnap(e))onGuides([],[]);
  else{const s=snapBox(doc,pageId,{...box,x:box.x+dx,y:box.y+dy},chosen,6/scale);dx+=s.dx;dy+=s.dy;onGuides(s.guides,s.gaps)}
  m.position({x:mv.start.x+dx,y:mv.start.y+dy});
  for(const [id,p] of mv.nodes)nodes.current.get(id)?.position({x:p.x+dx,y:p.y+dy});
 };
 const moverEnd=()=>{
  const m=moverRef.current,mv=moving.current;moving.current=null;onGuides([],[]);if(!m||!mv)return;
  const dx=m.x()-mv.start.x,dy=m.y()-mv.start.y;
  if(Math.abs(dx)>0.001||Math.abs(dy)>0.001)for(const [id,p] of mv.nodes)onChange(id,{x:round2(p.x+dx),y:round2(p.y+dy)},mv.gesture);
  onGestureEnd();
 };
 /** A click on the mover (no drag) picks what is under it: Shift adds or removes it; double-click on text types. */
 const underPointer=()=>{const p=stageRef.current?.getPointerPosition();return p?layerAt(doc,pageId,p.x/scale,p.y/scale):null};

 // Pictures and icons keep their shape: corners only. Several layers resize from the corners, keeping their shape.
 const fixedShape=several||one?.kind==='image'||one?.kind==='icon';
 const anchors=one?.kind==='line'?['middle-left','middle-right']:fixedShape?['top-left','top-right','bottom-left','bottom-right']:undefined;
 const ring=colours.ring||'magenta',thin=1/scale;
 const clearIfPage=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{if(e.target===e.target.getStage()||e.target.name()==='background')onSelect(null,'replace')};
 return <Stage ref={stageRef} width={shownWidth} height={Math.round(doc.height*scale)} scaleX={scale} scaleY={scale}
  onMouseDown={e=>{pressed.current=true;clearIfPage(e)}} onMouseUp={()=>{pressed.current=false}} onTouchStart={e=>{pressed.current=true;clearIfPage(e)}} onTouchEnd={()=>{pressed.current=false}}>
  <KLayer ref={contentRef}>
   <Background doc={doc} pageId={pageId}/>
   {drawn.map(l=><LayerNode key={l.id} layer={l} doc={doc} pageId={pageId} scale={scale} reducedMotion={reducedMotion} fonts={fonts} editing={l.id===editing} readOnly={readOnly}
    draggable={!lockedIn(doc,l.id)&&!(several&&held.some(h=>h.id===l.id))&&(l.parentId===null||chosen.has(l.id))}
    register={register} onPress={onPress} onChange={onChange} onGuides={onGuides} onEditText={onEditText} onAltDrag={onAltDrag} onGestureEnd={onGestureEnd} transformGesture={transformGesture}/>)}
  </KLayer>
  <KLayer ref={uiRef}>
   {box&&!readOnly&&!anyLocked&&<Rect ref={moverRef} name="mover" x={box.x} y={box.y} width={Math.max(box.width,1)} height={Math.max(box.height,1)} fill="transparent" draggable
    onDragStart={moverStart} onDragMove={moverMove} onDragEnd={moverEnd}
    onClick={e=>{const l=underPointer();if(!l)return;onSelect(chosen.has(l.id)?l.id:topOf(doc,l.id),(e.evt as MouseEvent).shiftKey?'toggle':'replace')}}
    onDblClick={()=>{const l=underPointer();if(l?.kind==='text')onEditText(l.id)}}/>}
   {marks.guides.map((g,i)=>{const from=g.from??0,to=g.to??(g.orientation==='v'?doc.height:doc.width);
    return <Line key={'g'+i} listening={false} points={g.orientation==='v'?[g.at,from,g.at,to]:[from,g.at,to,g.at]} stroke={ring} strokeWidth={thin} dash={g.from===undefined?[6*thin,4*thin]:undefined}/>})}
   {marks.gaps.map((g,i)=>{const t=4*thin,pts=g.axis==='x'?[g.start,g.at,g.end,g.at]:[g.at,g.start,g.at,g.end];
    const ends=g.axis==='x'?[[g.start,g.at-t,g.start,g.at+t],[g.end,g.at-t,g.end,g.at+t]]:[[g.at-t,g.start,g.at+t,g.start],[g.at-t,g.end,g.at+t,g.end]];
    return <Group key={'s'+i} listening={false}><Line points={pts} stroke={ring} strokeWidth={thin}/>{ends.map((p,j)=><Line key={j} points={p} stroke={ring} strokeWidth={thin}/>)}</Group>})}
   <Transformer ref={trRef} rotateEnabled keepRatio={fixedShape} enabledAnchors={anchors} flipEnabled={false}
    anchorSize={touch?22:10} anchorCornerRadius={touch?11:5} anchorStroke={colours.ring||undefined} anchorFill={colours.accent||undefined} borderStroke={colours.ring||undefined} borderStrokeWidth={1.5}
    rotationSnaps={[0,45,90,135,180,225,270,315]} rotationSnapTolerance={4}
    onTransformStart={()=>{transform.current=`transform:${heldKey}:${++gestures}`}}
    // Konva tells the transformer first, then each node: the step closes once every node has added its change.
    onTransformEnd={()=>{setTimeout(()=>{transform.current=undefined;onGestureEnd()},0)}}
    boundBoxFunc={(oldBox,b)=>b.width<6||b.height<2?oldBox:b}/>
  </KLayer>
 </Stage>;
}
