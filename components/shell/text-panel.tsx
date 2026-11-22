'use client';
import * as React from 'react';
import {Plus} from 'lucide-react';
import {useToast} from '@/components/ds/toast';
import {useBrandKit} from '@/components/brand/brand-kit';
import {cleanHex,type BrandKit} from '@/lib/brand-kit';
import {TEXT_STYLES as STYLE,type TextStyle} from '@/lib/editor/doc';
import {canvasAddSaid,textCanvasAdd,textStyleFont} from '@/lib/elements';
import {cssFontFamily} from '@/lib/editor/fonts';
import {loadCanvasFont} from '@/components/canvas/fonts';
import {addToCanvas,useShell} from './shell-state';

// The Text panel's body, listed only inside the canvas editor (lib/shell-nav.ts):
// "Add a text box" first (a plain box of body text), then the brand's text
// styles as one-click buttons, Heading, Subheading and Body, each previewed in
// the brand kit's font (heading font for the first two, body font for the
// third) and added in that font and the kit's first colour (lib/elements.ts
// textCanvasAdd). Under them the brand colours, named, for reference. The
// previews load the brand fonts from the Studio's own files, as the canvas
// does (components/canvas/fonts.ts). The shell draws the panel around it
// (components/shell/panels.tsx). Styles: app/elements.css.

export const TEXT_PANEL_STYLES:readonly TextStyle[]=['heading','subheading','body'];
export const NO_EDITOR='Open a picture in the editor to add text.';
const TEXT_BOX='Your text';

/** The preview's font: the brand font itself, as the canvas draws it. */
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
 const {kit}=useBrandKit(),{toast}=useToast(),stylesId=React.useId();
 const heading=textStyleFont({font:'heading'},kit),body=textStyleFont({font:'body'},kit);
 // The previews' fonts, from the Studio's own files (nothing else loads them on this panel).
 React.useEffect(()=>{for(const [font,weight] of [[heading,STYLE.heading.weight],[heading,STYLE.subheading.weight],[body,STYLE.body.weight]] as const)if(font)void loadCanvasFont({font,weight,italic:false})},[heading,body]);
 const add=(style:TextStyle,text?:string)=>{const a={...textCanvasAdd(style,kit),...(text?{text}:{})};toast(canvasAddSaid(a,addToCanvas(a)))};
 return <div className="text-panel">
  <button type="button" className="ds-btn text-panel-box" data-text-box onClick={()=>add('body',TEXT_BOX)}><Plus aria-hidden="true"/>Add a text box</button>
  <section className="text-panel-styles" aria-labelledby={stylesId}>
   <h3 className="ds-label-caps" id={stylesId}>Brand text styles</h3>
   <ul className="text-panel-adds" aria-label="Add text">
    {TEXT_PANEL_STYLES.map(style=>{
     const font=style==='body'?body:heading,family=previewFamily(font);
     return <li key={style}>
      <button type="button" className="text-panel-add" data-style={style} onClick={()=>add(style)}>
       <span className="text-panel-sample" style={family?{fontFamily:family}:undefined}>{STYLE[style].sample}</span>
       {font&&<span className="text-panel-font"><span className="ds-sr-only">in </span>{font}</span>}
      </button>
     </li>;
    })}
   </ul>
  </section>
  <Colours kit={kit}/>
 </div>;
}

export function TextPanel(){
 const {canvas}=useShell();
 if(!canvas)return <p className="ds-help">{NO_EDITOR}</p>;
 return <TextAdds/>;
}
