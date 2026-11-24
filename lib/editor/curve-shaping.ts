// Curved text that keeps Arabic letters joined (editor Phase 4, a follow-up
// from Phase 3). Konva's TextPath draws one character at a time, so the
// browser never sees a letter's neighbours and draws each in its isolated
// form. Here the text is shaped first and then placed: each letter (with its
// marks; lam with the alef after it as their one ligature) is drawn with a
// joiner on each side that joins a neighbour, so the browser's own shaping
// picks the same initial, medial or final form it would in one run (joinPieces
// says which joiner this browser and font draw exactly). Those shaped pieces
// are then laid on the arc, right to left.
// Plain module: the canvas (components/canvas/stage.tsx) and the tests share it.

const ZWJ='‍',TATWEEL='ـ';
export const hasArabic=(s:string)=>/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(s);

type Joining='D'|'R'|'C'|'U'|'T';
const inRanges=(c:number,ranges:readonly (readonly [number,number])[])=>ranges.some(([a,b])=>c>=a&&c<=b);
// Unicode's ArabicShaping joining types for the Arabic blocks (dual, right, causing, transparent; anything else doesn't join).
const RIGHT=[[0x0622,0x0625],[0x0627,0x0627],[0x0629,0x0629],[0x062f,0x0632],[0x0648,0x0648],[0x0671,0x0673],[0x0675,0x0677],[0x0688,0x0699],[0x06c0,0x06c0],[0x06c3,0x06cb],[0x06cd,0x06cd],[0x06cf,0x06cf],[0x06d2,0x06d3],[0x06d5,0x06d5],[0x06ee,0x06ef],[0x0759,0x075b],[0x076b,0x076c],[0x0771,0x0771],[0x0773,0x0774],[0x0778,0x0779]] as const;
const DUAL=[[0x0620,0x0620],[0x0626,0x0626],[0x0628,0x0628],[0x062a,0x062e],[0x0633,0x063f],[0x0641,0x0647],[0x0649,0x064a],[0x066e,0x066f],[0x0678,0x0687],[0x069a,0x06bf],[0x06c1,0x06c2],[0x06cc,0x06cc],[0x06ce,0x06ce],[0x06d0,0x06d1],[0x06fa,0x06fc],[0x06ff,0x06ff],[0x0750,0x0758],[0x075c,0x076a],[0x076d,0x0770],[0x0772,0x0772],[0x0775,0x0777],[0x077a,0x077f],[0x08a0,0x08a9],[0x08af,0x08b0],[0x08b3,0x08b4],[0x08b6,0x08c8]] as const;
const MARKS=[[0x0610,0x061a],[0x064b,0x065f],[0x0670,0x0670],[0x06d6,0x06dc],[0x06df,0x06e4],[0x06e7,0x06e8],[0x06ea,0x06ed],[0x08d3,0x08ff]] as const;
function joining(ch:string):Joining{
 const c=ch.codePointAt(0)!;
 if(c===0x0640||c===0x200d)return 'C';
 if(inRanges(c,MARKS))return 'T';
 if(inRanges(c,DUAL))return 'D';
 if(inRanges(c,RIGHT))return 'R';
 return 'U';
}
/** The joining of a piece's first and last letters (its marks don't count). */
function ends(piece:string):{first:Joining;last:Joining}{
 const letters=[...piece].map(joining).filter(j=>j!=='T');
 return {first:letters[0]??'U',last:letters[letters.length-1]??'U'};
}
const ALEFS=new Set(['ا','آ','أ','إ','ٱ']);
const LAM='ل';
const isMark=(ch:string)=>joining(ch)==='T';

/** The pieces of one line, in reading order: a letter with its marks, lam-alef together, or any other character. */
export function piecesOf(line:string):string[]{
 const out:string[]=[];
 for(const ch of line){
  const last=out[out.length-1];
  if(last!==undefined&&(isMark(ch)||/\p{M}/u.test(ch)))out[out.length-1]=last+ch;
  // Lam then alef (marks between allowed) are one ligature the font must draw together.
  else if(last!==undefined&&ALEFS.has(ch)&&[...last].filter(c=>!isMark(c)).join('')===LAM)out[out.length-1]=last+ch;
  else out.push(ch);
 }
 return out;
}

/** A piece of the line; `draw` is it with a zero-width joiner on each side that joins a neighbour. */
export type ShapedPiece={text:string;draw:string;rtl:boolean;joinsPrev:boolean;joinsNext:boolean};
/** Each piece with the joiners its neighbours give it: what to draw so it shows the form it has in the whole word. */
export function shapePieces(line:string):ShapedPiece[]{
 const pieces=piecesOf(line),info=pieces.map(ends);
 return pieces.map((text,i)=>{
  const me=info[i],prev=info[i-1],next=info[i+1];
  const joinsPrev=!!prev&&(prev.last==='D'||prev.last==='C')&&(me.first==='D'||me.first==='R'||me.first==='C');
  const joinsNext=!!next&&(me.last==='D'||me.last==='C')&&(next.first==='D'||next.first==='R'||next.first==='C');
  return {text,draw:(joinsPrev?ZWJ:'')+text+(joinsNext?ZWJ:''),rtl:hasArabic(text),joinsPrev,joinsNext};
 });
}

export type Joiner='zwj'|'tatweel';
/** A piece as drawn with this joiner on each side that joins a neighbour. */
export const withJoiner=(p:ShapedPiece,joiner:Joiner)=>joiner==='zwj'?p.draw:(p.joinsPrev?TATWEEL:'')+p.text+(p.joinsNext?TATWEEL:'');
/**
 * Which joiner draws each letter's form exactly in this browser and font, and each piece's width on the line.
 * - The zero-width joiner (U+200D) is exact in Chromium and Firefox, which shape it with its letter, and in WebKit (Safari)
 *   when the font has one. In a font without one, WebKit takes it from another font: the letter is then drawn alone, or in that font.
 * - The tatweel (U+0640) is a letter of the font itself, so every browser shapes it with its neighbour; the drawer cuts its own
 *   stroke away (drawTatweel). Its width is taken off the piece's, which is exact unless the font lengthens it beside a letter.
 * Exact, the pieces' widths add up to the line as the browser draws it whole: the closer way is used, the joiner when they tie
 * (both exact, or neither: a ligature the font only draws in the whole word).
 * `measure` measures a string in the direction it is drawn in: a joiner at the edge of a string measured left to right is
 * shaped apart from its letter in Chromium, and the letter's width comes out as if it stood alone.
 */
export function joinPieces(pieces:readonly ShapedPiece[],line:string,measure:(s:string,rtl:boolean)=>number):{joiner:Joiner;widths:number[];tatweel:number}{
 const zwj=pieces.map(p=>measure(p.draw,p.rtl)),tatweel=measure(TATWEEL,true);
 if(!pieces.some(p=>p.joinsPrev||p.joinsNext))return {joiner:'zwj',widths:zwj,tatweel};
 const tat=pieces.map(p=>measure(withJoiner(p,'tatweel'),p.rtl)-tatweel*((p.joinsPrev?1:0)+(p.joinsNext?1:0)));
 const whole=measure(line,true),off=(w:number[])=>Math.abs(w.reduce((a,b)=>a+b,0)-whole);
 return off(tat)+0.5<off(zwj)?{joiner:'tatweel',widths:tat,tatweel}:{joiner:'zwj',widths:zwj,tatweel};
}
/**
 * Drawn with tatweels, a right-to-left piece is [tatweel][letter][tatweel] from left to right: where to draw it (centred) so the
 * letter's own width is centred on the piece's place, and the edges past which the tatweels are cut away (with `bleed` more, so
 * the joins meet). A side that joins nothing is never cut: a tail or swash there is the letter's own.
 */
export function drawTatweel(p:ShapedPiece,width:number,tatweel:number,bleed:number):{x:number;left:number;right:number}{
 return {x:tatweel*((p.joinsPrev?1:0)-(p.joinsNext?1:0))/2,left:p.joinsNext?-width/2-bleed:-Infinity,right:p.joinsPrev?width/2+bleed:Infinity};
}
const ltrStrong=(s:string)=>/[\p{L}\p{N}]/u.test(s)&&!hasArabic(s);
/**
 * The pieces in the order they sit on the line, left to right, for a right-to-left line:
 * Arabic (and the spaces and marks between) read right to left; a run of Latin letters or digits inside it keeps its own order.
 */
export function visualOrder(pieces:readonly ShapedPiece[]):ShapedPiece[]{
 const runs:{ltr:boolean;items:ShapedPiece[]}[]=[];
 for(const p of pieces){
  // Spaces and punctuation read with the Arabic around them.
  const ltr=ltrStrong(p.text),run=runs[runs.length-1];
  if(run&&run.ltr===ltr)run.items.push(p);
  else runs.push({ltr,items:[p]});
 }
 return runs.reverse().flatMap(r=>r.ltr?r.items:[...r.items].reverse());
}

export type Placed={piece:ShapedPiece;width:number;x:number;y:number;rotation:number};
/**
 * Where each piece goes on the curve's arc (the same circle as curveGeometry in lib/editor/effects.ts):
 * its centre at its distance along the arc, turned to the arc's direction there. `widths` are the pieces' own (joinPieces).
 */
export function placeOnArc(pieces:readonly ShapedPiece[],{widths,letterSpacing,fontSize,curve,boxWidth,height,radius}:{widths:readonly number[];letterSpacing:number;fontSize:number;curve:number;boxWidth:number;height:number;radius:number}):Placed[]{
 const total=widths.reduce((a,b)=>a+b,0)+letterSpacing*Math.max(0,pieces.length-1);
 const cx=boxWidth/2,out:Placed[]=[];let s=-total/2;
 pieces.forEach((piece,i)=>{
  const width=widths[i],mid=s+width/2;s+=width+letterSpacing;
  if(!Number.isFinite(radius)){out.push({piece,width,x:cx+mid,y:fontSize/2,rotation:0});return}
  const phi=mid/radius;
  if(curve>0){const cy=fontSize/2+radius;out.push({piece,width,x:cx+radius*Math.sin(phi),y:cy-radius*Math.cos(phi),rotation:phi})}
  else{const cy=height-fontSize/2-radius;out.push({piece,width,x:cx+radius*Math.sin(phi),y:cy+radius*Math.cos(phi),rotation:-phi})}
 });
 return out;
}
