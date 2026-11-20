'use client';
import * as React from 'react';
import {Arrow,Ellipse,Group,Image as KImage,Layer as KLayer,Line,Path,Rect,Stage,Text,Transformer} from 'react-konva';
import type Konva from 'konva';
import {ICON_GRID,TEXT_LINE_HEIGHT,snap,type EditorDoc,type Guide,type Layer} from '@/lib/editor/doc';
import {useCanvasImage} from './images';
import type {CanvasFonts} from './fonts';

// The canvas (Konva, drawn by react-konva). The stage is scaled to fit the
// space it is given; every layer keeps the picture's own pixels, so exporting
// at 1 / scale is the picture's full resolution. Select by clicking (or from
// the Layers list), drag to move (with alignment guides to the picture's edges
// and centre and to the other layers), the handles resize and rotate; a double
// click (or tap) on text types in it, in place (components/canvas/text-editor.tsx).
// Text is drawn in its brand font once that font has loaded (./fonts.ts): until
// then, and if it can't load, in the Studio's own sans serif, measured again
// when the font changes. Icons are vector paths, so they stay sharp at any size.
// The guides and handles live on their own layer, hidden while exporting.

export type StageHandle={stage:Konva.Stage|null;ui:Konva.Layer|null};
type Props={
 doc:EditorDoc;shownWidth:number;selected:string|null;reducedMotion:boolean;fonts:CanvasFonts;
 /** The text layer being typed in (drawn by the text box over the canvas, not here). */editing:string|null;
 onSelect:(id:string|null)=>void;onChange:(id:string,patch:Partial<Layer>)=>void;onEditText:(id:string)=>void;
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

function Body({layer,scale,fonts}:{layer:Layer;scale:number;fonts:CanvasFonts}){
 const {width:w,height:h}=layer,hit=Math.max(12/scale,1);
 if(layer.kind==='image')return <PictureBody layer={layer}/>;
 if(layer.kind==='text'){
  // A new key when the font arrives (or falls back): the text is measured again in the font it is drawn in.
  const {family,key}=fonts.family(layer.font,layer.fontWeight);
  return <Text key={key} width={w} text={layer.text} fontSize={layer.fontSize} fontFamily={family} fontStyle={String(layer.fontWeight)} fill={layer.color} align={layer.align} lineHeight={TEXT_LINE_HEIGHT} wrap="word"/>;
 }
 if(layer.kind==='icon'){
  // The icon's own 24 x 24 grid scaled to the layer: vector paths, drawn sharp at any size and at export.
  return <Group scaleX={w/ICON_GRID} scaleY={h/ICON_GRID}>
   <Rect width={ICON_GRID} height={ICON_GRID} fill="transparent"/>
   {layer.paths.map((d,i)=><Path key={i} data={d} stroke={layer.color} strokeWidth={layer.strokeWidth} lineCap="round" lineJoin="round" fillEnabled={false} hitStrokeWidth={Math.max(layer.strokeWidth,hit*ICON_GRID/Math.max(w,1))}/>)}
  </Group>;
 }
 if(layer.kind==='line'){
  const points=[0,h/2,w,h/2];
  return layer.arrow==='none'
   ?<Line points={points} stroke={layer.stroke} strokeWidth={layer.strokeWidth} dash={layer.dash?[layer.strokeWidth*3,layer.strokeWidth*2]:undefined} lineCap="round" hitStrokeWidth={hit}/>
   :<Arrow points={points} stroke={layer.stroke} fill={layer.stroke} strokeWidth={layer.strokeWidth} pointerLength={layer.strokeWidth*4} pointerWidth={layer.strokeWidth*4} pointerAtBeginning={layer.arrow==='both'} dash={layer.dash?[layer.strokeWidth*3,layer.strokeWidth*2]:undefined} hitStrokeWidth={hit}/>;
 }
 if(layer.kind==='frame')return <Rect width={w} height={h} stroke={layer.stroke} strokeWidth={layer.strokeWidth} cornerRadius={layer.radius} hitStrokeWidth={hit} fillEnabled={false}/>;
 const paint={fill:layer.fill,stroke:layer.stroke==='transparent'?undefined:layer.stroke,strokeWidth:layer.strokeWidth};
 if(layer.shape==='circle')return <Ellipse x={w/2} y={h/2} radiusX={w/2} radiusY={h/2} {...paint}/>;
 if(layer.shape==='rect'||layer.shape==='rounded')return <Rect width={w} height={h} cornerRadius={layer.shape==='rounded'?Math.min(w,h)*0.18:0} {...paint}/>;
 const points=layer.shape==='triangle'?[w/2,0,w,h,0,h]:layer.shape==='star'?star(w,h):polygon(w,h,6);
 return <Line points={points} closed {...paint}/>;
}

function PictureBody({layer}:{layer:Extract<Layer,{kind:'image'}>}){
 const {img}=useCanvasImage(layer.src);
 return img?<KImage image={img} width={layer.width} height={layer.height}/>:<Rect width={layer.width} height={layer.height} dash={[8,6]} stroke="gray" strokeWidth={2}/>;
}

function LayerNode({layer,doc,scale,reducedMotion,fonts,editing,register,onSelect,onChange,onGuides,onEditText}:{
 layer:Layer;doc:EditorDoc;scale:number;reducedMotion:boolean;fonts:CanvasFonts;editing:boolean;register:(id:string,node:Konva.Group|null)=>void;
 onSelect:(id:string)=>void;onChange:(id:string,patch:Partial<Layer>)=>void;onGuides:(g:Guide[])=>void;onEditText:(id:string)=>void;
}){
 const ref=React.useRef<Konva.Group|null>(null);
 // A new layer fades in (it appears where the eye is not yet looking); nothing else animates.
 React.useEffect(()=>{const n=ref.current;if(!n||reducedMotion)return;n.opacity(0);n.to({opacity:1,duration:0.12})},[reducedMotion]);
 return <Group ref={node=>{ref.current=node;register(layer.id,node)}} name="layer" x={layer.x} y={layer.y} rotation={layer.rotation} draggable={!editing} visible={!editing}
  onMouseDown={()=>onSelect(layer.id)} onTap={()=>onSelect(layer.id)}
  onDblClick={()=>{if(layer.kind==='text')onEditText(layer.id)}} onDblTap={()=>{if(layer.kind==='text')onEditText(layer.id)}}
  onDragMove={e=>{
   const n=e.target;if(layer.rotation){onGuides([]);return}
   const s=snap(doc,{id:layer.id,x:n.x(),y:n.y(),width:layer.width,height:layer.height,rotation:0},6/scale);
   n.position({x:s.x,y:s.y});onGuides(s.guides);
  }}
  onDragEnd={e=>{onGuides([]);onChange(layer.id,{x:Math.round(e.target.x()*100)/100,y:Math.round(e.target.y()*100)/100})}}
  onTransformEnd={e=>{
   const n=e.target,sx=n.scaleX(),sy=n.scaleY();n.scale({x:1,y:1});
   const base={x:n.x(),y:n.y(),rotation:Math.round(n.rotation()*10)/10,width:Math.max(4,layer.width*sx),height:Math.max(2,layer.height*sy)};
   onChange(layer.id,layer.kind==='text'?{...base,fontSize:Math.max(4,Math.round(layer.fontSize*sy))}:base);
  }}>
  <Body layer={layer} scale={scale} fonts={fonts}/>
 </Group>;
}

function Background({src,doc}:{src:string;doc:EditorDoc}){
 const {img}=useCanvasImage(src);
 return img?<KImage name="background" image={img} width={doc.width} height={doc.height}/>:<Rect name="background" width={doc.width} height={doc.height} fill="gray" opacity={0.2}/>;
}

export default function CanvasStage({doc,shownWidth,selected,reducedMotion,fonts,editing,onSelect,onChange,onEditText,handle}:Props){
 const scale=shownWidth/doc.width,colours=useTokenColours();
 // Handles big enough for a finger on a touch screen (WCAG 2.5.8), small with a mouse.
 const [touch]=React.useState(()=>window.matchMedia('(pointer: coarse)').matches);
 const stageRef=React.useRef<Konva.Stage|null>(null),uiRef=React.useRef<Konva.Layer|null>(null),trRef=React.useRef<Konva.Transformer|null>(null);
 const nodes=React.useRef(new Map<string,Konva.Group>());
 const [guides,setGuides]=React.useState<Guide[]>([]);
 const register=React.useCallback((id:string,node:Konva.Group|null)=>{if(node)nodes.current.set(id,node);else nodes.current.delete(id)},[]);
 React.useImperativeHandle(handle,()=>({get stage(){return stageRef.current},get ui(){return uiRef.current}}),[]);
 const layer=doc.layers.find(l=>l.id===selected);
 React.useEffect(()=>{
  const tr=trRef.current;if(!tr)return;
  const node=selected?nodes.current.get(selected):undefined;
  tr.nodes(node&&selected!==editing?[node]:[]);tr.getLayer()?.batchDraw();
 },[selected,doc,editing,fonts]);
 // Pictures and icons keep their shape: corners only.
 const fixedShape=layer?.kind==='image'||layer?.kind==='icon';
 const anchors=layer?.kind==='line'?['middle-left','middle-right']:fixedShape?['top-left','top-right','bottom-left','bottom-right']:undefined;
 return <Stage ref={stageRef} width={shownWidth} height={Math.round(doc.height*scale)} scaleX={scale} scaleY={scale}
  onMouseDown={e=>{if(e.target===e.target.getStage()||e.target.name()==='background')onSelect(null)}}
  onTouchStart={e=>{if(e.target===e.target.getStage()||e.target.name()==='background')onSelect(null)}}>
  <KLayer>
   <Background src={doc.background.src} doc={doc}/>
   {doc.layers.map(l=><LayerNode key={l.id} layer={l} doc={doc} scale={scale} reducedMotion={reducedMotion} fonts={fonts} editing={l.id===editing} register={register} onSelect={onSelect} onChange={onChange} onGuides={setGuides} onEditText={onEditText}/>)}
  </KLayer>
  <KLayer ref={uiRef}>
   {guides.map((g,i)=><Line key={i} listening={false} points={g.orientation==='v'?[g.at,0,g.at,doc.height]:[0,g.at,doc.width,g.at]} stroke={colours.ring||'magenta'} strokeWidth={1/scale} dash={[6/scale,4/scale]}/>)}
   <Transformer ref={trRef} rotateEnabled keepRatio={fixedShape} enabledAnchors={anchors} flipEnabled={false}
    anchorSize={touch?22:10} anchorCornerRadius={touch?11:5} anchorStroke={colours.ring||undefined} anchorFill={colours.accent||undefined} borderStroke={colours.ring||undefined} borderStrokeWidth={1.5}
    rotationSnaps={[0,45,90,135,180,225,270,315]} rotationSnapTolerance={4}
    boundBoxFunc={(oldBox,box)=>box.width<6||box.height<2?oldBox:box}/>
  </KLayer>
 </Stage>;
}
