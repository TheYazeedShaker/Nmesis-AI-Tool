'use client';
import * as React from 'react';
import {X} from 'lucide-react';
import {IconButton} from '@/components/ds/button';
import {Layer} from '@/components/ds/layer';

// A popover the right panel opens for one setting (the font list, the colour
// picker): a non-modal dialog that lies over the panel itself, under the row
// that opened it (above it when there is no room), so the canvas stays in view
// and every change shows on it as it is made. It is a person's own dialog, not
// a panel (docs/editor-rules.md, rule 1). The focus goes into it when it opens
// and back to its button when it closes: Escape, the Close button, a click
// outside it, or Tab past its last control. Its body is its one scroll area.

export type PopoverAnchor=React.RefObject<HTMLElement|null>;
const GAP=8,WIDTH=320;
/** What Tab stops on: not a control that is off, and not one a group's arrow keys reach instead (tabindex -1). */
const TABBABLE=':is(input,button,select,textarea,[tabindex]):not([disabled]):not([tabindex="-1"])';

function place(anchor:HTMLElement|null):React.CSSProperties{
 if(!anchor||typeof window==='undefined')return {};
 const r=anchor.getBoundingClientRect(),panel=anchor.closest('.canvas-inspector')?.getBoundingClientRect();
 const right=panel?Math.max(GAP,window.innerWidth-panel.right+GAP):Math.max(GAP,window.innerWidth-r.right);
 const below=window.innerHeight-r.bottom-GAP,above=r.top-GAP;
 // Below the row when it fits a useful height, else wherever there is more room.
 return below>=360||below>=above?{right,top:r.bottom+GAP/2,maxHeight:Math.max(200,below)}:{right,bottom:window.innerHeight-r.top+GAP/2,maxHeight:Math.max(200,above)};
}

export function Popover({open,anchor,title,onClose,onEnd,children,initialFocus,hidden,className}:{open:boolean;anchor:PopoverAnchor;title:string;onClose:()=>void;
 /** A gesture inside it is over (a slider let go, a field left): its undo step closes. */onEnd?:()=>void;children:React.ReactNode;
 /** What gets the focus when it opens (the search field); else its first control. */initialFocus?:React.RefObject<HTMLElement|null>;
 /** Out of the way for a moment (picking a colour from the canvas), still open. */hidden?:boolean;className?:string}){
 const ref=React.useRef<HTMLDivElement>(null),id=React.useId();
 const [style,setStyle]=React.useState<React.CSSProperties>({});
 // While it is out of the way (the next click goes to the canvas), a click outside it doesn't close it.
 const away=React.useRef(hidden),closing=React.useRef(onClose);
 React.useEffect(()=>{away.current=hidden;closing.current=onClose});
 React.useLayoutEffect(()=>{if(!open)return;const at=()=>setStyle(place(anchor.current));at();window.addEventListener('resize',at);return()=>window.removeEventListener('resize',at)},[open,anchor]);
 // The focus goes in once, as it opens (never again while it is open).
 React.useEffect(()=>{
  if(!open)return;
  const el=initialFocus?.current||ref.current?.querySelector<HTMLElement>('.ds-popover-body '+TABBABLE);
  el?.focus({preventScroll:true});
 },[open,initialFocus]);
 React.useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{const t=e.target as Node;if(away.current||ref.current?.contains(t)||anchor.current?.contains(t))return;closing.current()};
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[open,anchor]);
 if(!open)return null;
 const close=()=>{onClose();anchor.current?.focus({preventScroll:true})};
 return <Layer>
  <div ref={ref} role="dialog" aria-modal="false" aria-labelledby={id} className={'ds-popover'+(className?' '+className:'')} hidden={hidden}
   style={{...style,width:WIDTH}} data-editor-popover
   onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
    if(e.key==='Tab'){
     // Tab past the last control (or Shift+Tab before the first) closes it and goes back to its button.
     const all=[...ref.current!.querySelectorAll<HTMLElement>(TABBABLE)].filter(x=>x.offsetParent!==null);
     const at=all.indexOf(document.activeElement as HTMLElement);
     if((!e.shiftKey&&at===all.length-1)||(e.shiftKey&&at===0)){e.preventDefault();close()}
    }
   }}
   onPointerUp={()=>onEnd?.()} onBlur={e=>{if(!ref.current?.contains(e.relatedTarget as Node))onEnd?.()}}>
   <div className="ds-popover-head">
    <h2 className="ds-popover-title" id={id}>{title}</h2>
    <IconButton label="Close" size="sm" kind="quiet" onClick={close}><X aria-hidden="true"/></IconButton>
   </div>
   <div className="ds-popover-body">{children}</div>
  </div>
 </Layer>;
}
