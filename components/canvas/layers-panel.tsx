'use client';
import * as React from 'react';
import {Group as GroupIcon,Image as ImageIcon} from 'lucide-react';
import {State} from '@/components/ds/feedback';
import {assetSrc,ICON_GRID,siblings,TEXT_STYLES,type EditorDoc,type Layer} from '@/lib/editor/doc';
import {LAYER_KIND} from './design-panel';

// The Layers tab of the right panel: every layer on the page, front first,
// groups with their layers inside. Its own words on every control (the name,
// "Hide", "Lock"). One Tab stop: the arrow keys move, Enter or Space selects,
// Shift with an arrow adds the next layer, Ctrl/Cmd+Space adds or removes one,
// Alt with an arrow moves a layer one place, F2 renames, Delete deletes.
// With a mouse: click selects, Shift or Ctrl/Cmd-click adds or removes, drag
// a row to reorder it among its neighbours.

export type SelectMode='replace'|'toggle'|'add';
type Props={
 doc:EditorDoc;page:string;selected:ReadonlySet<string>;readOnly:boolean;mod:string;baseLabel:string;
 onSelect:(id:string,mode:SelectMode)=>void;
 onFlag:(id:string,flag:'hidden'|'locked',on:boolean)=>void;
 onRename:(id:string,name:string)=>boolean;
 /** One place towards the front (up in the list) or the back. */onStep:(id:string,dir:'front'|'back')=>void;
 /** Dropped among its neighbours: `index` in back-to-front order. */onPlace:(id:string,index:number)=>void;
 onDelete:()=>void;
};
type Row={layer:Layer;depth:number};

/** The page's layers as the list shows them: front first, a group's layers right under it. */
function rowsOf(doc:EditorDoc,page:string):Row[]{
 const out:Row[]=[];
 const walk=(parent:string|null,depth:number)=>{for(const l of [...siblings(doc,page,parent)].reverse()){out.push({layer:l,depth});if(l.kind==='group')walk(l.id,depth+1)}};
 walk(null,0);return out;
}

export function LayersPanel({doc,page,selected,readOnly,mod,baseLabel,onSelect,onFlag,onRename,onStep,onPlace,onDelete}:Props){
 const rows=React.useMemo(()=>rowsOf(doc,page),[doc,page]);
 const [focus,setFocus]=React.useState<string|null>(null);
 const [renaming,setRenaming]=React.useState<string|null>(null);
 const [drop,setDrop]=React.useState<{id:string;where:'above'|'below'}|null>(null);
 const dragging=React.useRef<string|null>(null);
 const place=React.useMemo(()=>new Map(rows.map((r,i)=>[r.layer.id,i])),[rows]);
 const names=React.useRef(new Map<string,HTMLButtonElement>());
 // The row that takes the Tab stop: the one last focused, else the first selected, else the first.
 const current=rows.find(r=>r.layer.id===focus)?.layer.id??rows.find(r=>selected.has(r.layer.id))?.layer.id??rows[0]?.layer.id;
 const moveFocus=(id:string)=>{setFocus(id);requestAnimationFrame(()=>names.current.get(id)?.focus())};

 function onKey(e:React.KeyboardEvent,row:Row,at:number){
  const id=row.layer.id,mod=e.ctrlKey||e.metaKey;
  const next=e.key==='ArrowDown'?rows[at+1]:e.key==='ArrowUp'?rows[at-1]:e.key==='Home'?rows[0]:e.key==='End'?rows[rows.length-1]:undefined;
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&e.altKey){e.preventDefault();if(!readOnly){onStep(id,e.key==='ArrowUp'?'front':'back');moveFocus(id)}return}
  if(next){e.preventDefault();moveFocus(next.layer.id);if(e.shiftKey)onSelect(next.layer.id,'add');return}
  if(e.key==='Enter'||(e.key===' '&&!mod)){e.preventDefault();onSelect(id,'replace');return}
  if(e.key===' '&&mod){e.preventDefault();onSelect(id,'toggle');return}
  if(e.key==='F2'&&!readOnly){e.preventDefault();setRenaming(id);return}
  if((e.key==='Delete'||e.key==='Backspace')&&!readOnly&&selected.size){e.preventDefault();onDelete();return}
  if(e.key==='ArrowRight'){e.preventDefault();(e.currentTarget.parentElement?.querySelector('.canvas-layer-toggle') as HTMLElement|null)?.focus()}
 }
 /** Left and Right move between a row's own buttons (its name, Hide, Lock). */
 function onToggleKey(e:React.KeyboardEvent){
  const own=[...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.canvas-layer-name, .canvas-layer-toggle')??[])],at=own.indexOf(e.currentTarget as HTMLElement);
  if(e.key==='ArrowRight'&&own[at+1]){e.preventDefault();own[at+1].focus()}
  if(e.key==='ArrowLeft'&&own[at-1]){e.preventDefault();own[at-1].focus()}
 }
 function dropAt(target:Row){
  const id=dragging.current;dragging.current=null;const where=drop?.where;setDrop(null);
  if(!id||id===target.layer.id||!where||readOnly)return;
  const l=doc.layers[id];if(!l||l.parentId!==target.layer.parentId)return;
  const order=siblings(doc,page,l.parentId).map(x=>x.id).filter(x=>x!==id);
  // The list shows front first: "above" a row is in front of it, one place higher in back-to-front order.
  onPlace(id,order.indexOf(target.layer.id)+(where==='above'?1:0));
 }

 /** One row: its line (name, Hide, Lock) and, for a group, its own layers in a list inside it. */
 function renderRow(row:Row):React.ReactNode{
  const l=row.layer,on=selected.has(l.id),words=shownWords(l),at=place.get(l.id)??0;
  const inside=l.kind==='group'?rows.filter(r=>r.layer.parentId===l.id):[];
  return <li key={l.id} className="canvas-layer-row" data-layer-id={l.id} data-hidden={l.hidden||undefined}>
   <div className="canvas-layer-line" data-drop={drop?.id===l.id?drop.where:undefined} style={{['--depth' as string]:row.depth} as React.CSSProperties}
    draggable={!readOnly&&renaming!==l.id} onDragStart={e=>{dragging.current=l.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.name)}}
    onDragOver={e=>{const from=dragging.current&&doc.layers[dragging.current];if(!from||from.parentId!==l.parentId||from.id===l.id)return;e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setDrop({id:l.id,where:e.clientY<r.top+r.height/2?'above':'below'})}}
    onDragLeave={()=>setDrop(d=>d?.id===l.id?null:d)} onDrop={e=>{e.preventDefault();e.stopPropagation();dropAt(row)}} onDragEnd={()=>{dragging.current=null;setDrop(null)}}>
    {renaming===l.id
     ?<RenameBox name={l.name} onDone={name=>{const ok=name===null||name===l.name||onRename(l.id,name);if(ok){setRenaming(null);moveFocus(l.id)}}}/>
     :<button type="button" className="canvas-layer-name" aria-pressed={on} tabIndex={l.id===current?0:-1}
       ref={n=>{if(n)names.current.set(l.id,n);else names.current.delete(l.id)}} onFocus={()=>setFocus(l.id)}
       onClick={e=>onSelect(l.id,e.shiftKey||e.ctrlKey||e.metaKey?'toggle':'replace')} onDoubleClick={()=>{if(!readOnly)setRenaming(l.id)}} onKeyDown={e=>onKey(e,row,at)}
       title={`${words}. F2 renames; Alt with an arrow moves it.`}>
      <LayerThumb layer={l}/>
      <span className="canvas-layer-words ds-truncate">{words}</span>
      <span className="canvas-layer-kind">{LAYER_KIND[l.kind]}</span>
     </button>}
    <button type="button" className="canvas-layer-toggle" aria-pressed={!!l.hidden} tabIndex={-1} disabled={readOnly} aria-label={`Hide ${words}`} title={l.hidden?'Hidden: press to show it again':'Hide it on the canvas and in exports'}
     onClick={()=>onFlag(l.id,'hidden',!l.hidden)} onKeyDown={onToggleKey}>Hide</button>
    <button type="button" className="canvas-layer-toggle" aria-pressed={!!l.locked} tabIndex={-1} disabled={readOnly} aria-label={`Lock ${words}`} title={l.locked?'Locked: press to let it move again':'Keep it from moving'}
     onClick={()=>onFlag(l.id,'locked',!l.locked)} onKeyDown={onToggleKey}>Lock</button>
   </div>
   {inside.length>0&&<ol className="canvas-layers" aria-label={`In ${words}`}>{inside.map(renderRow)}</ol>}
  </li>;
 }
 if(!rows.length)return <div className="canvas-layers-empty">
  <State kind="empty" title="No layers on this page yet">Press T to add text, or open Brand, Elements, Text or Uploads on the left and click what you want. Each thing you add is a layer here.</State>
 </div>;
 return <div className="canvas-layers-panel">
  <ol className="canvas-layers" aria-label="Layers on this page, front first">
   {rows.filter(r=>r.depth===0).map(renderRow)}
   <li className="canvas-layer-row canvas-layer-base"><span className="canvas-layer-thumb" aria-hidden="true"><ImageIcon/></span><span className="canvas-layer-words ds-truncate" title={baseLabel}>{baseLabel}</span><span className="canvas-layer-kind">Background</span></li>
  </ol>
  <p className="ds-help">Arrows move, Enter selects, Shift+arrows add, Alt+arrows reorder, F2 renames. Or drag a row. {mod}G groups.</p>
 </div>;
}

/** What the list calls a layer: its name; a text keeps showing its words until it is given a name of its own. */
const STYLE_NAMES=new Set(Object.values(TEXT_STYLES).map(t=>t.label));
function shownWords(l:Layer){return l.kind==='text'&&STYLE_NAMES.has(l.name)?l.text:l.name}

function RenameBox({name,onDone}:{name:string;onDone:(name:string|null)=>void}){
 const ref=React.useRef<HTMLInputElement>(null);
 React.useEffect(()=>{ref.current?.focus();ref.current?.select()},[]);
 return <input ref={ref} className="ds-input canvas-layer-rename" aria-label="Layer name" defaultValue={name} maxLength={80}
  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onDone(e.currentTarget.value.trim()||name)}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onDone(null)}}}
  onBlur={e=>onDone(e.currentTarget.value.trim()||name)}/>;
}

/** A small picture of the layer: the picture itself, the text's letters in its colour, the shape or icon drawn. */
/** Light or dark, for the backdrop behind a colour (its relative luminance, WCAG): null for no colour. */
function backdropFor(colour:string):'light'|'dark'|undefined{
 const m=/^#([0-9a-f]{6})$/i.exec(colour);if(!m)return undefined;
 const n=parseInt(m[1],16),[r,g,b]=[n>>16,(n>>8)&255,n&255].map(v=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4});
 return 0.2126*r+0.7152*g+0.0722*b>0.4?'dark':'light';
}
/** A layer's own colour: what its thumbnail shows. */
const colourOf=(l:Layer)=>l.kind==='text'||l.kind==='icon'?l.color:l.kind==='line'||l.kind==='frame'?l.stroke:l.kind==='shape'?(l.fill==='transparent'?l.stroke:l.fill):'';
function LayerThumb({layer:l}:{layer:Layer}){
 const backdrop=backdropFor(colourOf(l));
 if(l.kind==='group')return <span className="canvas-layer-thumb" aria-hidden="true"><GroupIcon/></span>;
 // eslint-disable-next-line @next/next/no-img-element -- a small thumbnail from the Studio's own address; next/image adds nothing here
 if(l.kind==='image')return <span className="canvas-layer-thumb" aria-hidden="true"><img src={assetSrc(l.asset)+'?thumb=1'} alt="" loading="lazy" decoding="async"/></span>;
 if(l.kind==='text')return <span className="canvas-layer-thumb canvas-layer-thumb-text" aria-hidden="true" data-backdrop={backdrop} style={{color:l.color}}>Aa</span>;
 const svg=(body:React.ReactNode,box=`0 0 ${ICON_GRID} ${ICON_GRID}`)=><span className="canvas-layer-thumb" aria-hidden="true" data-backdrop={backdrop}><svg viewBox={box} preserveAspectRatio="xMidYMid meet">{body}</svg></span>;
 if(l.kind==='icon')return svg(l.paths.map((d,i)=><path key={i} d={d} fill="none" stroke={l.color} strokeWidth={l.strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>));
 if(l.kind==='line')return svg(<line x1="2" y1="12" x2="22" y2="12" stroke={l.stroke} strokeWidth="2" strokeDasharray={l.dash?'4 3':undefined}/>);
 if(l.kind==='frame')return svg(<rect x="3" y="5" width="18" height="14" rx={l.radius?3:0} fill="none" stroke={l.stroke} strokeWidth="2"/>);
 const fill=l.fill==='transparent'?'none':l.fill,stroke=l.stroke==='transparent'?undefined:l.stroke;
 const body=l.shape==='circle'?<ellipse cx="12" cy="12" rx="9" ry="9" fill={fill} stroke={stroke} strokeWidth="1.5"/>
  :l.shape==='triangle'?<polygon points="12,3 21,21 3,21" fill={fill} stroke={stroke} strokeWidth="1.5"/>
  :<rect x="3" y="3" width="18" height="18" rx={l.shape==='rounded'?4:0} fill={fill} stroke={stroke} strokeWidth="1.5"/>;
 return svg(body);
}
