'use client';
import * as React from 'react';
import {useToast} from '@/components/ds/toast';
import {useBrandKit} from '@/components/brand/brand-kit';
import {cleanHex,type BrandKit} from '@/lib/brand-kit';
import {TEXT_STYLES as STYLE,type TextStyle} from '@/lib/editor/doc';
import {canvasAddSaid,textCanvasAdd,textStyleFont} from '@/lib/elements';
import {cssFontFamily} from '@/lib/editor/fonts';
import {addToCanvas,useShell} from './shell-state';

// The Text panel's body, listed only inside the canvas editor (lib/shell-nav.ts):
// three large buttons that add a heading, a subheading or body text to the
// design, each previewed in the brand kit's font (heading font for the first
// two, body font for the third) and added in that font and the kit's first
// colour (lib/elements.ts textCanvasAdd). Under them the brand colours, named,
// for reference. The shell draws the panel around it (components/shell/panels.tsx).
// Styles: app/elements.css.

export const TEXT_PANEL_STYLES:readonly TextStyle[]=['heading','subheading','body'];
export const NO_EDITOR='Open a picture in the editor to add text.';

/** The preview's font: the brand font itself (served by the Studio, app/brand-fonts.ts), as the canvas draws it. */
function previewFamily(font:string|null){
 return font?cssFontFamily(font):undefined;
}

function Colours({kit}:{kit:BrandKit|null}){
 const id=React.useId();
 const shown=(kit?.colours??[]).flatMap(c=>{const hex=cleanHex(c?.hex);return hex?[{hex,name:typeof c.name==='string'?c.name.trim():''}]:[]});
 if(!shown.length)return null;
 return <section className="text-panel-colours" aria-labelledby={id}>
  <h3 className="ds-label-caps" id={id}>Brand colours</h3>
  <ul className="text-panel-swatches">{shown.map((c,i)=><li key={i} className="text-panel-swatch">
   <span className="text-panel-chip" style={{background:c.hex}} aria-hidden="true"/>
   <span className="text-panel-swatch-text"><b className="ds-truncate">{c.name||c.hex}</b>{c.name&&<span className="text-panel-hex">{c.hex}</span>}</span>
  </li>)}</ul>
 </section>;
}

function TextAdds(){
 const {kit}=useBrandKit(),{toast}=useToast();
 return <div className="text-panel">
  <ul className="text-panel-adds" aria-label="Add text">
   {TEXT_PANEL_STYLES.map(style=>{
    const font=textStyleFont({font:style==='body'?'body':'heading'},kit),family=previewFamily(font);
    return <li key={style}>
     <button type="button" className="text-panel-add" data-style={style} onClick={()=>{const add=textCanvasAdd(style,kit);toast(canvasAddSaid(add,addToCanvas(add)))}}>
      <span className="text-panel-sample" style={family?{fontFamily:family}:undefined}>{STYLE[style].sample}</span>
      {font&&<span className="text-panel-font"><span className="ds-sr-only">in </span>{font}</span>}
     </button>
    </li>;
   })}
  </ul>
  <Colours kit={kit}/>
 </div>;
}

export function TextPanel(){
 const {canvas}=useShell();
 if(!canvas)return <p className="ds-help">{NO_EDITOR}</p>;
 return <TextAdds/>;
}
