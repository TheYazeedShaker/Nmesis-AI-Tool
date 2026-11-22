// Colours in the editor: hex with an optional transparency ("#RRGGBB" solid,
// "#RRGGBBAA" with its alpha), the picker's hue/saturation/brightness, the
// text contrast hint (WCAG's ratio, 4.5:1 for text), and gradients (linear or
// radial, 2–4 stops) as the canvas draws them and as a CSS preview shows them.
// Plain module: the panel, the canvas and the tests share it.
import type {Gradient} from './doc';

export type RGBA={r:number;g:number;b:number;a:number};
export type HSV={h:number;s:number;v:number};
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const HEX=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** A colour the design format holds: "#RRGGBB" or "#RRGGBBAA" (and "transparent" where a field allows none). */
export const isHex=(v:unknown):v is string=>typeof v==='string'&&HEX.test(v);
export function parseHex(hex:string):RGBA|null{
 const m=HEX.exec(hex||'');if(!m)return null;
 const n=parseInt(m[1],16);
 return {r:(n>>16)&255,g:(n>>8)&255,b:n&255,a:m[2]?parseInt(m[2],16)/255:1};
}
const two=(n:number)=>Math.round(clamp(n,0,255)).toString(16).padStart(2,'0').toUpperCase();
/** "#RRGGBB" when solid, "#RRGGBBAA" with any transparency. */
export function toHex({r,g,b,a=1}:Partial<RGBA>&{r:number;g:number;b:number}):string{
 const alpha=Math.round(clamp(a,0,1)*255);
 return '#'+two(r)+two(g)+two(b)+(alpha<255?two(alpha):'');
}
/** The colour without its transparency ("#RRGGBB"). */
export const solidOf=(hex:string)=>{const c=parseHex(hex);return c?toHex({...c,a:1}):hex};
/** 0 (clear) to 1 (solid). */
export const alphaOf=(hex:string)=>parseHex(hex)?.a??1;
export const withAlpha=(hex:string,a:number)=>{const c=parseHex(hex);return c?toHex({...c,a}):hex};
/** Typed hex ("1a2b3c", "#abc", "#1A2B3C80") as the format holds it; null when it isn't one. */
export function cleanTypedHex(v:string):string|null{
 const m=/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v.trim());if(!m)return null;
 const s=m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1];
 return toHex(parseHex('#'+s)!);
}

export function rgbToHsv({r,g,b}:RGBA):HSV{
 const R=r/255,G=g/255,B=b/255,max=Math.max(R,G,B),min=Math.min(R,G,B),d=max-min;
 let h=0;
 if(d){h=max===R?((G-B)/d)%6:max===G?(B-R)/d+2:(R-G)/d+4;h*=60;if(h<0)h+=360}
 return {h,s:max?d/max:0,v:max};
}
export function hsvToRgb({h,s,v}:HSV,a=1):RGBA{
 const c=v*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=v-c;
 const [R,G,B]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return {r:Math.round((R+m)*255),g:Math.round((G+m)*255),b:Math.round((B+m)*255),a};
}
/** Between two colours: 0 is the first, 1 the second. */
export function mix(a:string,b:string,t:number):string{
 const p=parseHex(a),q=parseHex(b);if(!p||!q)return a;
 return toHex({r:p.r+(q.r-p.r)*t,g:p.g+(q.g-p.g)*t,b:p.b+(q.b-p.b)*t,a:p.a+(q.a-p.a)*t});
}

// ── The contrast hint ────────────────────────────────────────────────────
const channel=(c:number)=>{const s=c/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4};
const luminance=({r,g,b}:RGBA)=>0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
/** A colour with transparency as it shows over a solid one. */
export function over(fg:RGBA,bg:RGBA):RGBA{return {r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1}}
/** WCAG's contrast ratio of text over a background (1 to 21); the text's own transparency counts. */
export function contrastRatio(text:string,background:string):number|null{
 const t=parseHex(text),b=parseHex(background);if(!t||!b)return null;
 const bg={...b,a:1},fg=over(t,bg),L1=luminance(fg),L2=luminance(bg);
 return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}
/** Text needs 4.5:1 (WCAG AA for normal text). */
export const LOW_CONTRAST=4.5;
/** The lowest ratio of the text over any of the colours behind it (a gradient's stops, a picture's sampled colours). */
export function worstContrast(text:string,behind:readonly string[]):number|null{
 const all=behind.map(b=>contrastRatio(text,b)).filter((n):n is number=>n!==null);
 return all.length?Math.min(...all):null;
}

// ── Gradients ────────────────────────────────────────────────────────────
export const GRADIENT_STOPS={min:2,max:4};
/** A new gradient from a colour: that colour into a darker one, left to right. */
export function gradientFrom(colour:string,type:Gradient['type']='linear'):Gradient{
 const c=isHex(colour)?colour:'#FFFFFF';
 return {type,angle:90,stops:[{at:0,colour:solidOf(c)},{at:1,colour:mix(solidOf(c),'#000000',0.6)}]};
}
/** The stops in order along the gradient. */
export const sortedStops=(g:Gradient)=>[...g.stops].sort((a,b)=>a.at-b.at);
/**
 * Where a linear gradient starts and ends in a box (w × h, from its top-left corner), as CSS reads
 * an angle: 0° goes up, 90° to the right, 180° down. The line is as long as the box is along it,
 * so the first and last stops sit on its corners.
 */
export function linearPoints(angle:number,w:number,h:number){
 const a=angle*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),half=(Math.abs(w*dx)+Math.abs(h*dy))/2;
 const t=(n:number)=>Math.round(n*1e6)/1e6;
 return {start:{x:t(w/2-dx*half),y:t(h/2-dy*half)},end:{x:t(w/2+dx*half),y:t(h/2+dy*half)}};
}
/** Konva's fill settings for a gradient over a box drawn from (ox, oy) (an ellipse is drawn from its centre). */
export function konvaGradient(g:Gradient,w:number,h:number,ox=0,oy=0):Record<string,unknown>{
 const stops=sortedStops(g).flatMap(s=>[s.at,s.colour]);
 if(g.type==='radial'){
  const r=Math.hypot(w,h)/2;
  return {fillPriority:'radial-gradient',fillRadialGradientStartPoint:{x:w/2-ox,y:h/2-oy},fillRadialGradientEndPoint:{x:w/2-ox,y:h/2-oy},fillRadialGradientStartRadius:0,fillRadialGradientEndRadius:r,fillRadialGradientColorStops:stops};
 }
 const {start,end}=linearPoints(g.angle,w,h);
 return {fillPriority:'linear-gradient',fillLinearGradientStartPoint:{x:start.x-ox,y:start.y-oy},fillLinearGradientEndPoint:{x:end.x-ox,y:end.y-oy},fillLinearGradientColorStops:stops};
}
/** The same gradient as CSS (previews and swatches). */
export function cssGradient(g:Gradient):string{
 const stops=sortedStops(g).map(s=>`${s.colour} ${Math.round(s.at*100)}%`).join(', ');
 return g.type==='radial'?`radial-gradient(circle, ${stops})`:`linear-gradient(${Math.round(g.angle)}deg, ${stops})`;
}
/** A CSS background for any fill a picker shows: a colour, "transparent" (a checkerboard is drawn by the swatch), or a gradient. */
export const cssFill=(colour:string,gradient?:Gradient|null)=>gradient?cssGradient(gradient):colour;
