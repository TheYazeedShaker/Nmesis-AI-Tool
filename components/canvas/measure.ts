'use client';
import {curveGeometry} from '@/lib/editor/effects';
import {lineHeightOf,type TextLayer} from '@/lib/editor/doc';

// Measuring a line of text as the canvas draws it (the same family, size, weight
// and letter spacing), for curved text: the arc is as long as the line, and the
// layer's box grows to hold the arc. The panel and the canvas both measure here,
// so the box the panel sets is the box the canvas draws.

let ctx:CanvasRenderingContext2D|null=null;
const context=()=>{if(!ctx&&typeof document!=='undefined')ctx=document.createElement('canvas').getContext('2d');return ctx};
/** The font as the canvas's context reads it ("italic 700 64px "nm-poppins", sans-serif"). */
export const contextFont=(l:Pick<TextLayer,'fontSize'|'fontWeight'|'italic'>,family:string)=>`${l.italic?'italic ':''}${l.fontWeight} ${l.fontSize}px ${family}`;
/** Curved text is one line: its line breaks are spaces. */
export const oneLine=(text:string)=>text.replace(/\s*\n\s*/g,' ').trim();
/**
 * The width of the text drawn as one line along a path, in picture pixels: letter by letter, as
 * Konva's TextPath lays it out (no kerning between letters), with a little room to spare, since a
 * letter that doesn't fit on the path entirely is not drawn at all.
 */
export function lineWidth(l:Pick<TextLayer,'text'|'fontSize'|'fontWeight'|'italic'|'letterSpacing'>,family:string):number{
 const c=context(),chars=[...oneLine(l.text)];
 if(!c)return chars.length*l.fontSize*0.6;
 c.font=contextFont(l,family);
 const own=chars.reduce((s,ch)=>s+c.measureText(ch).width,0)+(l.letterSpacing??0)*chars.length;
 return own*1.03+l.fontSize*0.1;
}
/** Whether the text reads right to left (its first letter that has a direction is Arabic, Hebrew…). */
export function isRtl(text:string){
 for(const ch of text){
  if(/[֐-ࣿיִ-﷿ﹰ-ﻼ]/.test(ch))return true;
  if(/\p{L}/u.test(ch))return false;
 }
 return false;
}
/** The box height a text needs: its lines, or the arc of curved text. */
export function fitTextHeight(l:TextLayer,family:string):number{
 if(l.effect?.kind==='curve')return Math.round(curveGeometry(lineWidth(l,family),l.fontSize,l.effect.curve,l.width).height*100)/100;
 return Math.max(1,l.text.split('\n').length)*l.fontSize*lineHeightOf(l);
}
