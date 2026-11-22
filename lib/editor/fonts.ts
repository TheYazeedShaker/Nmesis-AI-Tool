// The editor's fonts: the self-hosted catalogue (lib/editor/font-catalogue.json,
// built by scripts/fonts/build-catalogue.mjs from the official open font
// repository: about 150 families under the OFL or Apache 2.0, Latin and, for
// the Arabic-capable families, Arabic). The files are the Studio's own
// (public/fonts/<id>/), so no person's browser asks a third party for a font.
// A design names a font by its family name, which is its id in the catalogue
// ("Poppins", "Noto Kufi Arabic"); the nine fonts of the brand kit's list are
// in it under the same names, so every design saved before keeps its fonts.
// "System" is the device's own font.
//
// The canvas draws a text layer once its font has loaded (components/canvas/
// fonts.ts registers each file as a FontFace only when a design uses it or a
// person picks it) and redraws the moment it arrives; Save, Duplicate and
// Download wait for every font in the design. A font that can't load, or a
// name the catalogue doesn't have, is a "Missing font": the layer and the
// panel say so, the canvas draws it in the fallback, and an export made with
// the fallback says so too. Never a silent swap.
// Plain module, no React and no DOM: the editor, the panels and the tests share it.
import CATALOGUE from './font-catalogue.json';
import type {EditorDoc,TextLayer} from './doc';

export type FontKind='sans'|'serif'|'display'|'script'|'mono';
export type FontFile={style:'normal'|'italic';/** One weight, or a variable file's weight range. */weight:number|[number,number];file:string;bytes:number};
export type CatalogueFont={id:string;family:string;kind:FontKind;arabic:boolean;
 /** The weights a person may pick: a variable family's stops on its axis, or the weights it really has. */weights:number[];
 /** A variable family's weight axis. */variable:{min:number;max:number}|null;italic:boolean;
 licence:string;licenceFile:string;designer:string;source:string;upstream:string|null;files:FontFile[];preview:{file:string;bytes:number}};
export const FONTS:readonly CatalogueFont[]=(CATALOGUE as {families:CatalogueFont[]}).families;
const BY_NAME=new Map(FONTS.map(f=>[f.family,f]));
export const fontByName=(name:unknown):CatalogueFont|null=>typeof name==='string'?BY_NAME.get(name)??null:null;
export const SYSTEM_FONT='System';
/** What a missing font draws in (the Studio's own sans serif, from the catalogue). */
export const FALLBACK_FONT='Inter';
export const SYSTEM_STACK='system-ui, -apple-system, "Segoe UI", sans-serif';
/** How long a font may take before it counts as missing. */
export const FONT_LOAD_MS=10_000;
export const FONT_KINDS:Record<FontKind,string>={sans:'Sans serif',serif:'Serif',display:'Display',script:'Script and handwriting',mono:'Monospace'};

/** The family a font's files are registered under (never a name a device's own fonts could answer to). */
export const faceFamily=(f:Pick<CatalogueFont,'id'>)=>`nm-${f.id}`;
/** The small file of a family's name alone, for the font list. */
export const previewFamily=(f:Pick<CatalogueFont,'id'>)=>`nm-preview-${f.id}`;
/** The Studio's own address of one of a family's files. */
export const fontUrl=(f:Pick<CatalogueFont,'id'>,file:string)=>`/fonts/${f.id}/${file}`;
/** A name a design may hold: System or a family in the catalogue. */
export const isKnownFont=(name:unknown)=>name===SYSTEM_FONT||!!fontByName(name);

/** The family list a font is drawn with: its own files, then the fallback's, then the device's sans serif. */
export function canvasFontFamily(name:unknown):string{
 if(name===SYSTEM_FONT)return SYSTEM_STACK;
 const f=fontByName(name),fallback=fontByName(FALLBACK_FONT)!;
 return [f&&f!==fallback?JSON.stringify(faceFamily(f)):'',JSON.stringify(faceFamily(fallback)),'sans-serif'].filter(Boolean).join(', ');
}
/** What a missing font draws in. */
export const fallbackFamily=()=>canvasFontFamily(FALLBACK_FONT);
/** For the page's own boxes (panel previews, the in-place text box): the same, ending on the Studio's sans serif. */
export const cssFontFamily=(name:unknown)=>name===SYSTEM_FONT?SYSTEM_STACK:canvasFontFamily(name).replace(/, sans-serif$/,', var(--ds-font-sans)');

export const WEIGHT_NAMES:Record<number,string>={100:'Thin',200:'Extra light',300:'Light',400:'Regular',500:'Medium',600:'Semibold',700:'Bold',800:'Extra bold',900:'Black',1000:'Extra black'};
/** "Semibold" for 600; a weight between the named ones is its number. */
export const weightName=(w:number)=>WEIGHT_NAMES[w]||String(Math.round(w));
/** The weights the font really has (System: the three every device draws). */
export const weightsOf=(name:unknown):number[]=>name===SYSTEM_FONT?[400,600,700]:fontByName(name)?.weights??[400];
/** The nearest weight the font has, as CSS would pick it (variable: kept within the axis). */
export function nearestWeight(name:unknown,weight:number):number{
 const f=fontByName(name);
 if(f?.variable)return Math.min(f.variable.max,Math.max(f.variable.min,Math.round(weight)));
 const ws=weightsOf(name);
 return ws.reduce((best,w)=>Math.abs(w-weight)<Math.abs(best-weight)?w:best,ws[0]);
}
/** The one file that draws this weight and style (an italic only where the family has one). */
export function fileFor(f:CatalogueFont,weight:number,italic:boolean):FontFile{
 const style=italic&&f.italic?'italic':'normal';
 const pool=f.files.filter(x=>x.style===style);
 const list=pool.length?pool:f.files;
 const range=list.find(x=>Array.isArray(x.weight));if(range)return range;
 return list.reduce((best,x)=>Math.abs((x.weight as number)-weight)<Math.abs((best.weight as number)-weight)?x:best,list[0]);
}

export type FontNeed={font:string;weight:number;italic:boolean};
export const fontKey=(n:FontNeed)=>`${n.font}|${n.weight}|${n.italic?'i':'n'}`;
/** The font, weight and style a text layer is drawn with. */
export const needOf=(l:Pick<TextLayer,'font'|'fontWeight'|'italic'>):FontNeed=>({font:l.font,weight:l.fontWeight,italic:!!l.italic});
/** Every font, weight and style the design's text layers draw with, once each, in order. */
export function fontsInDoc(doc:Pick<EditorDoc,'layers'>):FontNeed[]{
 const seen=new Map<string,FontNeed>();
 for(const l of Object.values(doc.layers))if(l.kind==='text'){const n=needOf(l);seen.set(fontKey(n),n)}
 return [...seen.values()];
}
/** The fonts the design uses, by name, in the order they first appear (the font list's "In this design"). */
export const fontNamesInDoc=(doc:Pick<EditorDoc,'layers'>)=>[...new Set(fontsInDoc(doc).map(n=>n.font))];

export type FontResult={ok:true}|{ok:false;reason:'unknown'|'missing'|'failed'|'timeout'};
/**
 * Loads every font the design needs (with `load`, components/canvas/fonts.ts in the browser) and
 * answers once all are settled: the fonts that are missing, each named once. Never rejects: a font
 * that can't load is missing (drawn in the fallback, and said), not an error.
 */
export async function settleFonts(doc:Pick<EditorDoc,'layers'>,load:(n:FontNeed)=>Promise<FontResult>):Promise<{failed:string[]}>{
 const needs=fontsInDoc(doc);
 const results=await Promise.all(needs.map(n=>load(n).catch(():FontResult=>({ok:false,reason:'failed'}))));
 return {failed:[...new Set(needs.filter((_,i)=>!results[i].ok).map(n=>n.font))]};
}
/**
 * The export (Save, Duplicate design, Download): every font in the design is settled before
 * anything is drawn, so the picture is drawn in its fonts (or, for a missing one, the fallback,
 * which the editor then says). `ready` waits until the canvas shows the loaded fonts.
 */
export async function exportWithFonts<T>(doc:Pick<EditorDoc,'layers'>,{load,ready,draw}:{load:(n:FontNeed)=>Promise<FontResult>;ready:()=>Promise<void>;draw:()=>Promise<T>}):Promise<{file:T;failed:string[]}>{
 const {failed}=await settleFonts(doc,load);
 await ready();
 return {file:await draw(),failed};
}
const list=(names:readonly string[])=>names.length===1?names[0]:`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
/** The notice above the canvas while a font is missing. */
export function fallbackNotice(failed:readonly string[]):string|null{
 if(!failed.length)return null;
 return `Missing font: ${list(failed)} couldn’t load, so ${failed.length===1?'its':'their'} text shows in ${FALLBACK_FONT} for now. Check your connection, then reopen the editor, or pick another font.`;
}
/** What an export made with the fallback says. */
export function exportFallbackNotice(failed:readonly string[]):string|null{
 return failed.length?`Made with ${FALLBACK_FONT} in place of ${list(failed)}, which couldn’t load.`:null;
}

// ── The font list ────────────────────────────────────────────────────────
export type FontSection={id:'brand'|'design'|'recent'|'all';title:string;fonts:CatalogueFont[]};
/** Whether a family answers a search: its name, the start of its kind ("serif" is serif, not sans serif; "script"), or "arabic". */
export function matches(f:CatalogueFont,query:string):boolean{
 const q=query.trim().toLowerCase();if(!q)return true;
 return f.family.toLowerCase().includes(q)||FONT_KINDS[f.kind].toLowerCase().startsWith(q)||(f.arabic&&('arabic'.startsWith(q)||q.includes('عرب')));
}
/**
 * The font list's sections, in order: Brand fonts (the brand kit's), In this design, Recent (this
 * person's), All fonts. A search narrows every section; a section with nothing to show is left out.
 */
export function fontSections({kit,doc,recent,query}:{kit:{headingFont:string;bodyFont:string}|null|undefined;doc:Pick<EditorDoc,'layers'>;recent:readonly string[];query:string}):FontSection[]{
 const pick=(names:readonly string[])=>[...new Set(names)].flatMap(n=>{const f=fontByName(n);return f&&matches(f,query)?[f]:[]});
 const out:FontSection[]=[
  {id:'brand',title:'Brand fonts',fonts:pick(kit?[kit.headingFont,kit.bodyFont]:[])},
  {id:'design',title:'In this design',fonts:pick(fontNamesInDoc(doc))},
  {id:'recent',title:'Recent',fonts:pick(recent.slice(0,RECENT_MAX))},
  {id:'all',title:'All fonts',fonts:[...FONTS].filter(f=>matches(f,query)).sort((a,b)=>a.family.localeCompare(b.family))},
 ];
 return out.filter(s=>s.fonts.length);
}
export const RECENT_MAX=8;
/** The recent list after picking a font: it first, each once, at most RECENT_MAX. */
export const withRecent=(recent:readonly string[],name:string)=>[...new Set([name,...recent])].filter(isKnownFont).slice(0,RECENT_MAX);

/** The brand kit's role for a font, if any ("Brand headings"). */
export function brandRole(name:string,kit:{headingFont:string;bodyFont:string}|null|undefined):string|null{
 if(!kit)return null;
 if(kit.headingFont===name&&kit.bodyFont===name)return 'Brand headings and body';
 return kit.headingFont===name?'Brand headings':kit.bodyFont===name?'Brand body text':null;
}
