import {createHash} from 'node:crypto';
import subsetFont from 'subset-font';
import fontverter from 'fontverter';
import {containerOf,embeddingOf,FontFileError,readInfo,readSfnt,tableTags,unpackedSize,type Axis,type Embedding,type FontInfo,type Sfnt} from './sfnt';

// Every uploaded font file goes through here on the server before anything is
// stored as ready, and before any person's browser may load it:
//
// 1. By its content (never its name): OTF, TTF, WOFF or WOFF2, up to 10 MB; a
//    WOFF or WOFF2 is unpacked (and refused if it claims more than 64 MB).
// 2. Read strictly (lib/brand-fonts/sfnt.ts): the table directory, the tables
//    every font needs, and what the font says about itself. Anything that
//    doesn't read is refused.
// 3. Its own embedding permission (OS/2 fsType): "restricted" (and "bitmaps
//    only") is refused with a plain reason; installable, editable and preview &
//    print are allowed and shown on the font.
// 4. Re-encoded by HarfBuzz (hb-subset, through subset-font, as the font
//    catalogue's build does): every character and glyph kept, every table
//    rebuilt from what HarfBuzz itself parsed, hinting programs dropped, every
//    variation axis other than weight pinned to its default (the canvas draws
//    weight, nothing else). HarfBuzz drops any table it doesn't know, and the
//    list below drops the ones it knows but text doesn't need (colour and
//    bitmap glyphs, SVG, vertical metrics, Apple and Graphite layout, math…).
// 5. Checked again: the result must read strictly and hold only the tables in
//    KEPT_TABLES. Then it becomes the WOFF2 browsers load and the small preview
//    of the family's name (the font list), as the catalogue's files are made.
// The original is kept as uploaded, for PDF export later; no route sends it to
// a browser.

export const MAX_FONT_BYTES=10*1024*1024;
const MAX_UNPACKED=64*1024*1024;
/** The only tables a sanitised font may hold: what drawing text needs. */
export const KEPT_TABLES=['cmap','head','hhea','hmtx','maxp','name','OS/2','post','glyf','loca','CFF ','CFF2','GDEF','GSUB','GPOS','kern','fvar','gvar','avar','HVAR','MVAR'] as const;
/** Tables HarfBuzz knows and would keep, that text doesn't need (it drops every table it doesn't know by itself). */
export const DROPPED_TABLES=['SVG ','COLR','CPAL','sbix','CBDT','CBLC','EBDT','EBLC','EBSC','vhea','vmtx','VVAR','VORG','STAT','BASE','MATH','JSTF','DSIG','meta','gasp','hdmx','VDMX','LTSH','PCLT','cvar','cvt ','fpgm','prep','kerx','morx','mort','feat','trak','ankr','bsln','just','lcar','opbd','prop','Glat','Gloc','Silf','Sill'];
export type FontFormat='otf'|'ttf'|'woff'|'woff2';
export const FORMATS:readonly FontFormat[]=['otf','ttf','woff','woff2'];
const ARABIC_SAMPLE='أبجد';

export type Refusal={ok:false;code:'unreadable'|'collection'|'too-large'|'restricted'|'bitmap-only'|'unsafe';reason:string;info:FontInfo|null};
export type Sanitised={ok:true;format:FontFormat;info:FontInfo;embedding:Embedding;
 /** The weight axis, when the sanitised font keeps one. */weightRange:[number,number]|null;axes:Axis[];
 original:Uint8Array;sha256:string;woff2:Uint8Array;preview:Uint8Array;tables:string[]};

// The words a person reads (an owner, on the Brand page and in the font list).
export const REASONS:Record<Refusal['code'],string>={
 unreadable:'This file isn’t a font the Studio can read. Export it again as OTF or TTF and upload that.',
 collection:'This is a font collection (.ttc). Upload each font in it as its own OTF or TTF file.',
 'too-large':'This font is over 10 MB. Upload each style as its own file, or ask its foundry for a web version.',
 restricted:'This font’s own licence settings don’t allow it to be embedded, so it can’t be used in designs. Ask its foundry for a version that allows embedding.',
 'bitmap-only':'This font allows only its bitmaps to be embedded, not its outlines, so it can’t be used in designs. Ask its foundry for a version that allows embedding.',
 unsafe:'This font couldn’t be made safe to use. Export it again as OTF or TTF and upload that.',
};
const refuse=(code:Refusal['code'],info:FontInfo|null=null):Refusal=>({ok:false,code,reason:REASONS[code],info});
const buf=(b:Uint8Array)=>Buffer.from(b.buffer,b.byteOffset,b.byteLength);

/** The file as an sfnt (OTF/TTF), unpacked from WOFF or WOFF2; null when it isn't one. */
async function toSfnt(bytes:Uint8Array,format:FontFormat):Promise<Uint8Array|null>{
 if(format==='otf'||format==='ttf')return bytes;
 if(unpackedSize(bytes)>MAX_UNPACKED)return null;
 try{
  const out=new Uint8Array(await fontverter.convert(buf(bytes),'sfnt',format));
  return out.byteLength<=MAX_UNPACKED?out:null;
 }catch{return null}
}

/** HarfBuzz's re-serialisation: everything drawn kept, everything else gone. */
async function reencode(sfnt:Uint8Array,axes:Axis[]):Promise<Uint8Array>{
 const pin=Object.fromEntries(axes.filter(a=>a.tag!=='wght').map(a=>[a.tag,a.default]));
 return new Uint8Array(await subsetFont(buf(sfnt),undefined,{targetFormat:'sfnt',keepAllGlyphs:true,noHinting:true,dropTables:DROPPED_TABLES,...Object.keys(pin).length?{variationAxes:pin}:{}}));
}
/** Throws unless a sanitised font reads strictly and holds only KEPT_TABLES. */
export function assertClean(bytes:Uint8Array):Sfnt{
 const sfnt=readSfnt(bytes),extra=tableTags(sfnt).filter(t=>!(KEPT_TABLES as readonly string[]).includes(t));
 if(extra.length)throw new FontFileError('tables left: '+extra.join(','));
 readInfo(sfnt);
 return sfnt;
}

// One font at a time per server process. The WOFF2 and HarfBuzz WebAssembly
// modules share one memory each and hand back views into it across an await,
// so two fonts worked on at once can overwrite each other's bytes (found with
// three WOFF2 files unpacked in parallel). Two companies' uploads must never
// meet, so every use of them goes through this queue.
let queue:Promise<unknown>=Promise.resolve();
export function exclusive<T>(work:()=>Promise<T>):Promise<T>{
 const run=queue.then(work,work);
 queue=run.then(()=>undefined,()=>undefined);
 return run;
}

/** Reads, checks and re-encodes one uploaded font file (see above). Never throws for a bad file: it refuses it. */
export function sanitiseFont(original:Uint8Array):Promise<Sanitised|Refusal>{return exclusive(()=>sanitiseNow(original))}
async function sanitiseNow(original:Uint8Array):Promise<Sanitised|Refusal>{
 if(original.byteLength>MAX_FONT_BYTES)return refuse('too-large');
 const container=containerOf(original);
 if(container==='collection')return refuse('collection');
 if(!container)return refuse('unreadable');
 const sfntBytes=await toSfnt(original,container);if(!sfntBytes)return refuse('unreadable');
 let info:FontInfo,sfnt:Sfnt;
 try{sfnt=readSfnt(sfntBytes);info=readInfo(sfnt)}catch(e){if(e instanceof FontFileError)return refuse(containerOf(sfntBytes)==='collection'?'collection':'unreadable');throw e}
 const permission=embeddingOf(info.fsType);
 if(permission.bitmapOnly)return refuse('bitmap-only',info);
 if(permission.embedding==='restricted')return refuse('restricted',info);
 let clean:Uint8Array,cleanInfo:FontInfo;
 try{clean=await reencode(sfntBytes,info.axes);cleanInfo=readInfo(assertClean(clean))}
 catch(e){
  // HarfBuzz refuses what it can't parse (hb_subset_or_fail); the check refuses anything left over.
  console.warn('[brand-fonts] a font could not be re-encoded',{reason:e instanceof FontFileError?e.message:e instanceof Error?e.name:'unknown'});
  return refuse(e instanceof FontFileError?'unsafe':'unreadable',info);
 }
 const wght=cleanInfo.axes.find(a=>a.tag==='wght');
 let woff2:Uint8Array,preview:Uint8Array;
 try{
  // The WOFF2 encoder parses every glyph again (a second reader of the outlines): a glyph it can't read refuses the font.
  woff2=new Uint8Array(await fontverter.convert(buf(clean),'woff2','sfnt'));
  // What browsers get reads the same once unpacked again.
  assertClean(new Uint8Array(await fontverter.convert(Buffer.from(woff2),'sfnt','woff2')));
  // The font list's preview: the family's name (and an Arabic sample) alone, unless the font may not be subset.
  const sample=info.family+(info.arabic?' '+ARABIC_SAMPLE:'');
  preview=permission.noSubsetting?woff2:new Uint8Array(await subsetFont(buf(clean),sample,{targetFormat:'woff2',noHinting:true,...wght?{variationAxes:{wght:Math.min(wght.max,Math.max(wght.min,400))}}:{}}));
 }catch(e){
  console.warn('[brand-fonts] a font could not be made into WOFF2',{reason:e instanceof FontFileError?e.message:e instanceof Error?e.message.slice(0,80):'unknown'});
  return refuse(e instanceof FontFileError?'unsafe':'unreadable',info);
 }
 return {ok:true,format:container,info:{...info,weight:wght?Math.round(Math.min(wght.max,Math.max(wght.min,info.weight))):info.weight},embedding:permission.embedding,
  weightRange:wght?[Math.round(wght.min),Math.round(wght.max)]:null,axes:info.axes,original,sha256:createHash('sha256').update(original).digest('hex'),woff2,preview,tables:tableTags(readSfnt(clean))};
}
