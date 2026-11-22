'use client';
import * as React from 'react';
import {lineHeightOf,TEXT_MAX,type TextLayer} from '@/lib/editor/doc';

// Typing on the canvas: a double click (or tap, or Enter on a selected text
// layer) opens this box exactly over the text, in the same font (the brand
// font the canvas draws, ./fonts.ts), size, colour, alignment and rotation,
// while the canvas hides its own copy. Enter adds a line; Esc, or clicking
// away, finishes. Every change goes to the design as it is typed and joins one
// undo step (lib/editor/doc.ts commit with `merge`), so Ctrl+Z after typing
// takes the whole edit back. Keys typed here never reach the canvas's own
// shortcuts (arrows, Delete, Ctrl+Z inside the box are the box's).

export function TextEditor({layer,scale,family,onType,onDone}:{layer:TextLayer;scale:number;family:string;onType:(text:string)=>void;onDone:()=>void}){
 const ref=React.useRef<HTMLTextAreaElement>(null);
 const done=React.useRef(false);
 const finish=React.useCallback(()=>{if(done.current)return;done.current=true;onDone()},[onDone]);
 // Opens with the words selected, ready to be typed over (the sample text, mostly).
 React.useEffect(()=>{const el=ref.current;if(!el)return;el.focus({preventScroll:true});el.select()},[]);
 // The box grows with its lines, as the text on the canvas does.
 React.useLayoutEffect(()=>{const el=ref.current;if(!el)return;el.style.height='0px';el.style.height=el.scrollHeight+'px'},[layer.text,scale,family,layer.fontSize,layer.lineHeight,layer.letterSpacing]);
 const style:React.CSSProperties={
  left:layer.x*scale,top:layer.y*scale,width:Math.max(layer.width*scale,8),
  transform:layer.rotation?`rotate(${layer.rotation}deg)`:undefined,
  fontFamily:family,fontSize:layer.fontSize*scale,fontWeight:layer.fontWeight,lineHeight:lineHeightOf(layer),letterSpacing:(layer.letterSpacing??0)*scale,
  color:layer.color,textAlign:layer.align,
 };
 return <textarea ref={ref} className="canvas-text-editor" style={style} value={layer.text} maxLength={TEXT_MAX} rows={1} spellCheck
  aria-label="Text on the canvas. Enter adds a line, Esc finishes."
  onChange={e=>onType(e.target.value)}
  onBlur={finish}
  onKeyDown={e=>{
   e.stopPropagation();
   if(e.key==='Escape'){e.preventDefault();finish()}
  }}/>;
}
