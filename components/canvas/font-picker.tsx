'use client';
import * as React from 'react';
import {ChevronDown,Search} from 'lucide-react';
import {Input} from '@/components/ds/field';
import {brandRole,FONT_KINDS,fontSections,type CatalogueFont} from '@/lib/editor/fonts';
import type {EditorDoc} from '@/lib/editor/doc';
import {Popover} from './popover';
import {loadPreview,useFontFace} from './fonts';
import {useRecent} from './recent';

// The font list (owner's brief), opened from the Text section's Font row: Brand
// fonts (the brand kit's) → In this design → Recent (this person's) → All
// fonts, with one search across all of them. Each name is shown in its own
// font from a tiny file of its own glyphs, loaded only when its row is on
// screen, so the list never downloads whole fonts; the chosen font's files load
// when it is picked. Keyboard: the search field keeps the focus, the arrow keys
// move through the list (Home and End too), Enter picks, Escape closes.

const MISSING='Missing font';

/** The Font row: the font's name, in its font, opening the list. A missing font says so here and on its layer. */
export function FontField({value,missing,disabled,kit,doc,onPick}:{value:string;missing:boolean;disabled?:boolean;kit:{headingFont:string;bodyFont:string}|null;doc:EditorDoc;onPick:(family:string)=>void}){
 const [open,setOpen]=React.useState(false),button=React.useRef<HTMLButtonElement>(null),id=React.useId();
 const face=useFontFace(value);
 return <div className="ds-inspector-row" data-editor-row>
  <span className="ds-inspector-label" data-editor-label id={id}>Font</span>
  <button ref={button} type="button" className="ds-font-button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${id} ${id}-value`} disabled={disabled} onClick={()=>setOpen(o=>!o)}>
   <span id={`${id}-value`} className="ds-truncate" style={{fontFamily:face.family}}>{value}</span>
   {missing&&<span className="ds-badge warn" data-missing-font>{MISSING}</span>}
   <ChevronDown aria-hidden="true"/>
  </button>
  {missing&&<p className="ds-help" role="status">{value} couldn’t load. It shows in Inter on the canvas and in downloads until it can; pick another font to change it.</p>}
  {open&&<FontPopover open anchor={button} value={value} kit={kit} doc={doc} onClose={()=>setOpen(false)} onPick={f=>{onPick(f);setOpen(false);button.current?.focus({preventScroll:true})}}/>}
 </div>;
}

function Option({font,id,active,chosen,role,onPick,onHover}:{font:CatalogueFont;id:string;active:boolean;chosen:boolean;role:string|null;onPick:()=>void;onHover:()=>void}){
 const ref=React.useRef<HTMLLIElement>(null),[shown,setShown]=React.useState(false);
 React.useEffect(()=>{
  const el=ref.current;if(!el)return;
  const io=new IntersectionObserver(([e])=>{if(e.isIntersecting){io.disconnect();void loadPreview(font).then(r=>{if(r.ok)setShown(true)})}},{rootMargin:'120px'});
  io.observe(el);return()=>io.disconnect();
 },[font]);
 React.useEffect(()=>{if(active)ref.current?.scrollIntoView({block:'nearest'})},[active]);
 return <li ref={ref} id={id} role="option" aria-selected={chosen} data-active={active||undefined} data-font={font.family} className="ds-font-option"
  onPointerDown={e=>e.preventDefault()} onClick={onPick} onPointerMove={onHover}>
  <span className="ds-font-name" style={shown?{fontFamily:`"nm-preview-${font.id}", var(--ds-font-sans)`}:undefined}>{font.family}</span>
  <span className="ds-font-meta">{role||FONT_KINDS[font.kind]}{font.arabic&&<span className="ds-font-arabic" lang="ar" style={shown?{fontFamily:`"nm-preview-${font.id}", var(--ds-font-sans)`}:undefined}> · أبجد<span className="ds-sr-only"> (Arabic)</span></span>}</span>
 </li>;
}

function FontPopover({open,anchor,value,kit,doc,onClose,onPick}:{open:boolean;anchor:React.RefObject<HTMLButtonElement|null>;value:string;kit:{headingFont:string;bodyFont:string}|null;doc:EditorDoc;onClose:()=>void;onPick:(family:string)=>void}){
 const [query,setQuery]=React.useState(''),recent=useRecent('fonts'),search=React.useRef<HTMLInputElement>(null),base=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const sections=React.useMemo(()=>fontSections({kit,doc,recent:recent.list,query}),[kit,doc,recent.list,query]);
 const flat=sections.flatMap(s=>s.fonts.map(f=>({section:s.id,font:f})));
 // It opens on the chosen font; a new search puts the list on its first match.
 const [at,setAt]=React.useState(()=>Math.max(0,flat.findIndex(x=>x.font.family===value)));
 const pick=(family:string)=>{recent.add(family);setQuery('');onPick(family)};
 const optionId=(i:number)=>`${base}-o${i}`;
 // Options may repeat across sections (a brand font is in All fonts too): the count is of families.
 const n=flat.length,families=sections.find(x=>x.id==='all')?.fonts.length??0,count=families===1?'1 font':`${families} fonts`;
 let i=-1;
 return <Popover open={open} anchor={anchor} title="Fonts" onClose={()=>{setQuery('');onClose()}} initialFocus={search} className="ds-font-popover">
  <label className="ds-popover-field ds-font-search">
   <span className="ds-inspector-label">Search fonts</span>
   <span className="ds-font-search-box">
    <Search aria-hidden="true"/>
    <Input ref={search} type="search" role="combobox" aria-expanded="true" aria-controls={`${base}-list`} aria-activedescendant={n?optionId(Math.min(at,n-1)):undefined} aria-autocomplete="list"
     placeholder="A name, “serif”, “script” or “Arabic”" value={query} autoComplete="off" spellCheck={false}
     onChange={e=>{setQuery(e.target.value);setAt(0)}}
     onKeyDown={e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(n)setAt(x=>(Math.min(x,n-1)+(e.key==='ArrowDown'?1:-1)+n)%n)}
      else if(e.key==='Home'&&n){e.preventDefault();setAt(0)}
      else if(e.key==='End'&&n){e.preventDefault();setAt(n-1)}
      else if(e.key==='PageDown'&&n){e.preventDefault();setAt(x=>Math.min(n-1,x+8))}
      else if(e.key==='PageUp'&&n){e.preventDefault();setAt(x=>Math.max(0,x-8))}
      else if(e.key==='Enter'&&n){e.preventDefault();pick(flat[Math.min(at,n-1)].font.family)}
     }}/>
   </span>
  </label>
  <p className="ds-help" role="status" aria-live="polite">{query?(n?`${count} ${families===1?'matches':'match'} “${query}”.`:`No font matches “${query}”. Try a shorter name, or “serif”, “script” or “Arabic”.`):`${count}, every one free to use.`}</p>
  <div id={`${base}-list`} role="listbox" aria-label="Fonts" className="ds-font-list">
   {sections.map(s=>{const hid=`${base}-${s.id}`;
    return <ul key={s.id} role="group" aria-labelledby={hid} className="ds-font-group">
     <li role="presentation" id={hid} className="ds-label-caps ds-font-group-title">{s.title}</li>
     {s.fonts.map(f=>{i++;const me=i;
      return <Option key={s.id+f.id} font={f} id={optionId(me)} active={me===Math.min(at,n-1)} chosen={f.family===value} role={s.id==='brand'?brandRole(f.family,kit):null}
       onHover={()=>{if(at!==me)setAt(me)}} onPick={()=>pick(f.family)}/>})}
    </ul>})}
  </div>
 </Popover>;
}
