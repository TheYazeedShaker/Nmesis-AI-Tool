'use client';
import * as React from 'react';
import {ChevronLeft,ChevronRight,CopyPlus,Plus,Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {assetSrc,drawOrder,MAX_PAGES,type EditorDoc} from '@/lib/editor/doc';

// The pages under the canvas: every page of the design (all the same size),
// the current one marked; add, duplicate, move and delete the current page.
// Each tile shows its background and says how many layers it holds. The strip
// scrolls sideways on its own when the pages don't fit (it is not the panel).
export function PageStrip({doc,current,readOnly,onPick,onAdd,onDuplicate,onMove,onRemove}:{
 doc:EditorDoc;current:string;readOnly:boolean;onPick:(id:string)=>void;onAdd:()=>void;onDuplicate:()=>void;onMove:(by:-1|1)=>void;onRemove:()=>void;
}){
 const list=React.useRef<HTMLOListElement>(null),at=doc.pages.findIndex(p=>p.id===current),full=doc.pages.length>=MAX_PAGES;
 // The current page is always in view (after a duplicate, the copy is scrolled to).
 React.useEffect(()=>{list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'})},[current,doc.pages.length]);
 return <nav className="canvas-pages" aria-label="Pages">
  <ol ref={list} className="canvas-page-list">{doc.pages.map((p,i)=>{
   const n=drawOrder(doc,p.id).length,bg=p.background;
   return <li key={p.id}><button type="button" className="canvas-page" aria-current={p.id===current?'page':undefined} onClick={()=>onPick(p.id)} aria-label={`Page ${i+1}, ${n} ${n===1?'layer':'layers'}`}
    style={{['--canvas-ratio' as string]:String(doc.width/doc.height)} as React.CSSProperties}>
    <span className="canvas-page-thumb" style={bg.kind==='colour'?{background:bg.colour}:undefined}>{bg.kind==='picture'&&<>
     {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed link */}
     <img src={assetSrc(bg.asset)+'?thumb=1'} alt="" loading="lazy" decoding="async"/>
    </>}</span>
    <span className="canvas-page-words">Page {i+1}</span>
   </button></li>;
  })}</ol>
  {!readOnly&&<span className="canvas-page-actions">
   <Button size="sm" icon={<Plus aria-hidden="true"/>} disabled={full} onClick={onAdd} title={full?`A design holds up to ${MAX_PAGES} pages.`:undefined}>Add page</Button>
   <Button size="sm" kind="quiet" icon={<CopyPlus aria-hidden="true"/>} disabled={full} onClick={onDuplicate}>Duplicate page</Button>
   <Button size="sm" kind="quiet" icon={<ChevronLeft aria-hidden="true"/>} disabled={at<=0} onClick={()=>onMove(-1)}>Move earlier</Button>
   <Button size="sm" kind="quiet" icon={<ChevronRight aria-hidden="true"/>} disabled={at<0||at>=doc.pages.length-1} onClick={()=>onMove(1)}>Move later</Button>
   <Button size="sm" kind="danger-quiet" icon={<Trash2 aria-hidden="true"/>} disabled={doc.pages.length<=1} onClick={onRemove}>Delete page</Button>
  </span>}
 </nav>;
}
