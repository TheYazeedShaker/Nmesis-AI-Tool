// Text effects (one at a time, the owner's decision): what each one is called,
// its controls (2–5 each, every one the shared slider or a colour), its first
// settings, and how the canvas draws it. The canvas and the export draw the
// same Konva nodes from these numbers (components/canvas/stage.tsx), and every
// amount is in proportion to the text's size, so an effect looks the same on
// the canvas, in the PNG/JPG at full resolution, and on any picture.
// Plain module: the panel, the canvas and the tests share it.
import type {TextEffect,TextEffectKind,TextLayer} from './doc';
import {mix,parseHex} from './colour';

export type EffectControl=
 |{key:string;kind:'slider';label:string;min:number;max:number;step?:number;unit?:string}
 |{key:string;kind:'colour';label:string};
export const EFFECTS:Record<TextEffectKind,{label:string;controls:EffectControl[]}>={
 shadow:{label:'Shadow',controls:[
  {key:'offset',kind:'slider',label:'Offset',min:0,max:100},
  {key:'direction',kind:'slider',label:'Direction',min:-180,max:180,unit:'°'},
  {key:'blur',kind:'slider',label:'Blur',min:0,max:100},
  {key:'transparency',kind:'slider',label:'Transparency',min:0,max:100,unit:'%'},
  {key:'colour',kind:'colour',label:'Shadow colour'},
 ]},
 outline:{label:'Outline',controls:[
  {key:'thickness',kind:'slider',label:'Thickness',min:1,max:100},
  {key:'colour',kind:'colour',label:'Outline colour'},
 ]},
 lift:{label:'Lift',controls:[{key:'intensity',kind:'slider',label:'Intensity',min:0,max:100}]},
 neon:{label:'Neon',controls:[
  {key:'intensity',kind:'slider',label:'Intensity',min:0,max:100},
  {key:'colour',kind:'colour',label:'Glow colour'},
 ]},
 background:{label:'Background',controls:[
  {key:'padding',kind:'slider',label:'Padding',min:0,max:100},
  {key:'corner',kind:'slider',label:'Corner',min:0,max:100},
  {key:'transparency',kind:'slider',label:'Transparency',min:0,max:100,unit:'%'},
  {key:'colour',kind:'colour',label:'Background colour'},
 ]},
 curve:{label:'Curve',controls:[{key:'curve',kind:'slider',label:'Curve',min:-100,max:100}]},
};

/** Light text gets a dark shadow or box, dark text a light one. */
const contrasting=(c:string)=>{const p=parseHex(c);return p&&(0.299*p.r+0.587*p.g+0.114*p.b)>150?'#000000':'#FFFFFF'};
const solid=(c:string)=>(parseHex(c)?c.slice(0,7).toUpperCase():'#FFFFFF');
/** An effect's first settings on this text (its colour decides the shadow's, the box's and the glow's). */
export function effectDefaults(kind:TextEffectKind,layer:Pick<TextLayer,'color'>):TextEffect{
 const ink=solid(layer.color);
 switch(kind){
  case 'shadow':return {kind,offset:40,direction:45,blur:30,colour:contrasting(ink),transparency:50};
  case 'outline':return {kind,thickness:30,colour:contrasting(ink)};
  case 'lift':return {kind,intensity:50};
  case 'neon':return {kind,intensity:50,colour:ink==='#FFFFFF'?'#38E8FF':ink};
  case 'background':return {kind,colour:contrasting(ink),padding:50,corner:30,transparency:0};
  case 'curve':return {kind,curve:50};
 }
}

/** What the canvas sets on the text itself for an effect: fill, outline and shadow (Konva's Text settings, in picture pixels). */
export type TextPaint={fill:string;stroke?:string;strokeWidth?:number;fillAfterStrokeEnabled?:boolean;lineJoin?:'round';
 shadowEnabled:boolean;shadowColor?:string;shadowBlur?:number;shadowOffsetX?:number;shadowOffsetY?:number;shadowOpacity?:number};
const k=(n:number)=>Math.max(0,Math.min(100,n))/100;
export function textPaint(layer:Pick<TextLayer,'color'|'fontSize'|'effect'>):TextPaint{
 const e=layer.effect,s=layer.fontSize,fill=layer.color;
 if(!e)return {fill,shadowEnabled:false};
 if(e.kind==='shadow'){
  const d=k(e.offset)*s*0.3,a=e.direction*Math.PI/180;
  return {fill,shadowEnabled:true,shadowColor:e.colour,shadowBlur:k(e.blur)*s*0.5,shadowOffsetX:Math.cos(a)*d,shadowOffsetY:Math.sin(a)*d,shadowOpacity:1-k(e.transparency)};
 }
 // The outline sits outside the letters (drawn under the fill), so twice its width is stroked.
 if(e.kind==='outline')return {fill,stroke:e.colour,strokeWidth:2*k(e.thickness)*s*0.12,fillAfterStrokeEnabled:true,lineJoin:'round',shadowEnabled:false};
 if(e.kind==='lift'){const i=k(e.intensity);return {fill,shadowEnabled:true,shadowColor:'#000000',shadowBlur:s*(0.08+0.35*i),shadowOffsetX:0,shadowOffsetY:s*(0.02+0.06*i),shadowOpacity:0.15+0.5*i}}
 if(e.kind==='neon'){const i=k(e.intensity);return {fill:mix(solid(e.colour),'#FFFFFF',0.55),shadowEnabled:true,shadowColor:e.colour,shadowBlur:s*(0.05+0.4*i),shadowOffsetX:0,shadowOffsetY:0,shadowOpacity:1}}
 return {fill,shadowEnabled:false};
}
/** Neon's second, wider glow, drawn under the text (null for every other effect). */
export function neonGlow(layer:Pick<TextLayer,'fontSize'|'effect'>):TextPaint|null{
 const e=layer.effect;if(e?.kind!=='neon')return null;
 const i=k(e.intensity);
 return {fill:e.colour,shadowEnabled:true,shadowColor:e.colour,shadowBlur:layer.fontSize*(0.2+0.9*i),shadowOffsetX:0,shadowOffsetY:0,shadowOpacity:0.4+0.6*i};
}
/** The Background effect's box around the text (picture pixels, from the text's top-left corner); null for other effects. */
export function backgroundBox(layer:Pick<TextLayer,'fontSize'|'effect'>,width:number,height:number){
 const e=layer.effect;if(e?.kind!=='background')return null;
 const pad=k(e.padding)*layer.fontSize*0.6,w=width+pad*2,h=height+pad*2;
 return {x:-pad,y:-pad,width:w,height:h,cornerRadius:k(e.corner)*Math.min(w,h)/2,fill:e.colour,opacity:1-k(e.transparency)};
}

/**
 * Curved text: the line laid along an arc of a circle. `textWidth` is the line's own width; at 100
 * the arc is nearly a whole circle, near 0 it is almost straight; up curves over the top of the
 * circle, down (negative) under it. The arc's middle sits on the box's centre line; the box grows
 * to hold the arc. Returns the arc as SVG path data in the box, and the box's new height.
 */
export function curveGeometry(textWidth:number,fontSize:number,curve:number,boxWidth:number){
 const c=Math.max(-100,Math.min(100,curve)),width=Math.max(1,textWidth);
 if(Math.abs(c)<0.5){const y=fontSize/2;return {path:`M ${(boxWidth-width)/2} ${y} L ${(boxWidth+width)/2} ${y}`,height:fontSize,radius:Infinity}}
 const theta=Math.abs(c)/100*Math.PI*1.9,R=width/theta,cx=boxWidth/2,half=theta/2;
 // How far the arc bows from its ends (its sagitta), so the box holds every letter.
 const bow=R*(1-Math.cos(half)),height=fontSize+bow;
 const sx=cx-R*Math.sin(half),ex=cx+R*Math.sin(half),large=theta>Math.PI?1:0;
 if(c>0){
  // Over the top: the circle's centre below the arc's highest point (fontSize / 2 from the top).
  const cy=fontSize/2+R,y=cy-R*Math.cos(half);
  return {path:`M ${sx} ${y} A ${R} ${R} 0 ${large} 1 ${ex} ${y}`,height,radius:R};
 }
 const cy=height-fontSize/2-R,y=cy+R*Math.cos(half);
 return {path:`M ${sx} ${y} A ${R} ${R} 0 ${large} 0 ${ex} ${y}`,height,radius:R};
}

/** How a tile previews an effect in the panel (CSS on a sample of the text's own font and colour). */
export function effectCss(kind:TextEffectKind|'none',colour:string):Record<string,string>{
 const ink=solid(colour),shade=contrasting(ink);
 switch(kind){
  case 'shadow':return {textShadow:`0.08em 0.08em 0.1em ${shade}99`};
  case 'outline':return {WebkitTextStroke:`0.08em ${shade}`,paintOrder:'stroke fill'};
  case 'lift':return {textShadow:'0 0.06em 0.18em rgba(0,0,0,0.55)'};
  case 'neon':{const glow=ink==='#FFFFFF'?'#38E8FF':ink;return {color:mix(glow,'#FFFFFF',0.55),textShadow:`0 0 0.08em ${glow}, 0 0 0.3em ${glow}`}}
  case 'background':return {background:shade,color:ink,padding:'0 0.2em',borderRadius:'0.15em'};
  default:return {};
 }
}
