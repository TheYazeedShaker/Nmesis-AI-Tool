// The brand kit's fonts on the canvas (lib/brand-kit.ts BRAND_FONTS). Every
// font in the list has its files served by the Studio itself (app/brand-fonts.ts:
// Next's font loader keeps them under /_next/static/media on the Studio's own
// address, so no third party is asked and the canvas is never tainted), named
// by a CSS variable on <html>. The canvas draws a text layer only once its
// font has loaded (components/canvas/fonts.ts), and the export waits for every
// font in the design. A font that can't load falls back to the Studio's own
// sans serif, and the editor says so: never silently.
// Plain module, no React and no DOM at load: the editor, the panels and the
// tests share it (the page's styles are read through a resolver).
import {BRAND_FONTS,isBrandFont,type BrandFont} from '../brand-kit';
import type {EditorDoc} from './doc';

/** The CSS variable holding each font's family (app/brand-fonts.ts); null for System (the device's own). */
export const FONT_VARS:Record<BrandFont,string|null>={
 System:null,
 Inter:'--font-inter',
 Outfit:'--font-outfit',
 Poppins:'--font-poppins',
 Montserrat:'--font-montserrat',
 'Playfair Display':'--font-playfair',
 Roboto:'--font-roboto',
 Lato:'--font-lato',
 Oswald:'--font-oswald',
};
/** What the canvas draws when a font can't load, and after every family (the page's own sans serif). */
export const FALLBACK_FONT='Inter';
const SYSTEM_STACK='system-ui, -apple-system, "Segoe UI", sans-serif';
/** The weights text layers use (lib/editor/doc.ts TEXT_STYLES). */
export const TEXT_WEIGHTS=[400,600,700] as const;
/** How long a font may take before the canvas falls back (and says so). */
export const FONT_LOAD_MS=10_000;

/** A font the design names: one of the brand kit's, else the fallback (a saved design is checked, but older ones may name another). */
export const knownFont=(name:unknown):BrandFont=>isBrandFont(name)?name:FALLBACK_FONT;

/** For the page's own boxes (panel previews, the in-place text box): the font's variable, its name, then the Studio's sans serif. */
export function cssFontFamily(name:unknown){
 const font=knownFont(name),v=FONT_VARS[font];
 return v?`var(${v}, ${JSON.stringify(font)}), var(--ds-font-sans)`:SYSTEM_STACK;
}

/** The first family in a CSS font-family list, unquoted ("__Poppins_6bee3b" from "'__Poppins_6bee3b', '__Poppins_Fallback_6bee3b'"). */
export function firstFamily(list:string){
 const first=list.split(',')[0]?.trim()||'';
 return first.replace(/^(['"])(.*)\1$/,'$2').trim();
}

/** The family list the canvas draws with, from the page's variables (`resolve` reads one: getComputedStyle in the browser). */
export function canvasFontFamily(name:unknown,resolve:(cssVar:string)=>string){
 const font=knownFont(name),v=FONT_VARS[font];
 if(!v)return SYSTEM_STACK;
 const own=resolve(v).trim(),fallback=resolve(FONT_VARS[FALLBACK_FONT]!).trim();
 return [own||JSON.stringify(font),font===FALLBACK_FONT?'':fallback,'sans-serif'].filter(Boolean).join(', ');
}
/** The family the canvas uses when this font can't load. */
export const fallbackFamily=(resolve:(cssVar:string)=>string)=>canvasFontFamily(FALLBACK_FONT,resolve);

/** The font a FontFaceSet loads for one family and weight: "700 64px "__Poppins_6bee3b"". */
export const fontSpec=(family:string,weight:number)=>`${weight} 64px ${JSON.stringify(family)}`;

export type FontNeed={font:BrandFont;weight:number};
export const fontKey=(n:FontNeed)=>`${n.font}|${n.weight}`;
/** Every font and weight the design's text layers draw with, once each, in order. */
export function fontsInDoc(doc:Pick<EditorDoc,'layers'>):FontNeed[]{
 const seen=new Map<string,FontNeed>();
 for(const l of Object.values(doc.layers))if(l.kind==='text'){const n={font:knownFont(l.font),weight:l.fontWeight};seen.set(fontKey(n),n)}
 return [...seen.values()];
}

export type FontResult={ok:true}|{ok:false;reason:'missing'|'failed'|'timeout'};
/**
 * Loads every font the design needs (with `load`, components/canvas/fonts.ts in
 * the browser) and answers once all are settled: the fonts that fell back, each
 * named once. Never rejects: a font that can't load is a fallback, not an error.
 */
export async function settleFonts(doc:Pick<EditorDoc,'layers'>,load:(n:FontNeed)=>Promise<FontResult>):Promise<{failed:BrandFont[]}>{
 const needs=fontsInDoc(doc);
 const results=await Promise.all(needs.map(n=>load(n).catch(():FontResult=>({ok:false,reason:'failed'}))));
 return {failed:[...new Set(needs.filter((_,i)=>!results[i].ok).map(n=>n.font))]};
}

/**
 * The export: every font in the design is settled before anything is drawn,
 * so the picture is drawn in the brand's fonts (or, for one that can't load,
 * the named fallback). `draw` makes the file; `ready` waits until the canvas
 * shows the loaded fonts (it re-measures its text once a font arrives).
 */
export async function exportWithFonts<T>(doc:Pick<EditorDoc,'layers'>,{load,ready,draw}:{load:(n:FontNeed)=>Promise<FontResult>;ready:()=>Promise<void>;draw:()=>Promise<T>}):Promise<{file:T;failed:BrandFont[]}>{
 const {failed}=await settleFonts(doc,load);
 await ready();
 return {file:await draw(),failed};
}

/** What the person is told about fonts that fell back. */
export function fallbackNotice(failed:readonly string[]):string|null{
 if(!failed.length)return null;
 const names=failed.length===1?failed[0]:`${failed.slice(0,-1).join(', ')} and ${failed[failed.length-1]}`;
 return `${names} couldn’t load, so ${failed.length===1?'its':'their'} text shows in ${FALLBACK_FONT} here and in your downloads. Check your connection, then reopen the editor.`;
}

/** The fonts a text layer may use, the brand kit's two first (heading, then body), then the rest of the list. */
export function fontChoices(kit:{headingFont:BrandFont;bodyFont:BrandFont}|null|undefined):{font:BrandFont;label:string}[]{
 const first:{font:BrandFont;label:string}[]=[];
 if(kit&&kit.headingFont!=='System')first.push({font:kit.headingFont,label:`${kit.headingFont} (brand headings)`});
 if(kit&&kit.bodyFont!=='System'&&kit.bodyFont!==kit.headingFont)first.push({font:kit.bodyFont,label:`${kit.bodyFont} (brand body text)`});
 const rest=BRAND_FONTS.filter(f=>f!=='System'&&!first.some(c=>c.font===f)).map(font=>({font,label:font}));
 return [...first,...rest];
}
