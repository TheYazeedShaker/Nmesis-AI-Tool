'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
const PAGE_SIZE=6;
export function ProgressiveGallery({children,loading=false}:{children:ReactNode[];loading?:boolean}){
 const [limit,setLimit]=useState(PAGE_SIZE);
 const sentinel=useRef<HTMLDivElement>(null);
 const shown=Math.min(limit,children.length),more=shown<children.length;
 useEffect(()=>{
  if(loading||!more||!sentinel.current||typeof IntersectionObserver==='undefined')return;
  let advanced=false;
  const observer=new IntersectionObserver(entries=>{
   if(advanced||!entries.some(entry=>entry.isIntersecting))return;
   advanced=true;observer.disconnect();setLimit(value=>value+PAGE_SIZE);
  },{rootMargin:'120px 0px'});
  observer.observe(sentinel.current);return()=>observer.disconnect();
 },[loading,more,shown]);
 if(loading)return <div className="gallery-loading" role="status"><span className="gallery-skeleton"/><span className="gallery-skeleton"/><span className="gallery-skeleton"/><p>Loading your gallery…</p></div>;
 return <><div className="results-grid">{children.slice(0,shown)}</div><div className="gallery-pagination" ref={sentinel}><span aria-live="polite">{shown} of {children.length} visuals</span>{more?<button type="button" className="secondary" onClick={()=>setLimit(value=>value+PAGE_SIZE)}>Load more images</button>:children.length>PAGE_SIZE?<span>You’re all caught up.</span>:null}</div></>;
}
