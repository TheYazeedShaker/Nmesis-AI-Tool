// A strict reader for an OpenType (sfnt) font file: the table directory and the
// few tables the Studio reads about a font (head, maxp, hhea, OS/2, name, post,
// fvar, cmap). Nothing here draws or runs anything; it only checks that the
// file is shaped like a font before HarfBuzz re-serialises it
// (lib/brand-fonts/sanitise.ts), and reads what the font says about itself so
// the files of one family join it (family, style, weight, italic, axes) and so
// its own embedding permission (OS/2 fsType) is known.
//
// The checks are the structural ones a sanitiser such as OTS makes first:
// a known signature, a table count that fits, every table inside the file and
// none overlapping another, no tag twice, the tables every font needs, sane
// header values. Anything else is refused as "not a font we can read".
// Plain module, no I/O: the routes, the tests and the fixtures share it.

export class FontFileError extends Error{}
const fail=(why:string):never=>{throw new FontFileError(why)};

export type Flavor='truetype'|'cff';
export type Sfnt={flavor:Flavor;bytes:Uint8Array;tables:Map<string,Uint8Array>};
export type Axis={tag:string;min:number;default:number;max:number};
export type FontKind='sans'|'serif'|'display'|'script'|'mono';
export type FontInfo={
 family:string;style:string;weight:number;italic:boolean;axes:Axis[];
 fsType:number;kind:FontKind;arabic:boolean;glyphs:number;characters:number;
};

const SIGNATURES:Record<number,Flavor>={0x00010000:'truetype',0x74727565:'truetype',0x4f54544f:'cff'};
const TTC=0x74746366,WOFF=0x774f4646,WOFF2=0x774f4632;
/** The tables every font needs to draw text, whatever its outlines. */
export const REQUIRED=['cmap','head','hhea','hmtx','maxp','name','OS/2','post'] as const;
const MAX_TABLES=128;

const view=(b:Uint8Array)=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const tagAt=(d:DataView,at:number)=>String.fromCharCode(d.getUint8(at),d.getUint8(at+1),d.getUint8(at+2),d.getUint8(at+3));

/** What a file's first four bytes say it is (by content, never by its name). */
export function containerOf(bytes:Uint8Array):'otf'|'ttf'|'woff'|'woff2'|'collection'|null{
 if(bytes.byteLength<12)return null;
 const sig=view(bytes).getUint32(0);
 if(sig===WOFF)return 'woff';if(sig===WOFF2)return 'woff2';if(sig===TTC)return 'collection';
 const f=SIGNATURES[sig];return f==='cff'?'otf':f==='truetype'?'ttf':null;
}
/** The size a WOFF or WOFF2 says it unpacks to (its header's totalSfntSize). */
export const unpackedSize=(bytes:Uint8Array)=>bytes.byteLength>=20?view(bytes).getUint32(16):0;

/** Reads the table directory, strictly. Throws FontFileError for anything a font isn't. */
export function readSfnt(bytes:Uint8Array):Sfnt{
 if(bytes.byteLength<12)fail('too short');
 const d=view(bytes),sig=d.getUint32(0);
 if(sig===TTC)fail('a collection');
 const flavor=SIGNATURES[sig];if(!flavor)fail('unknown signature');
 const n=d.getUint16(4);
 if(n<1||n>MAX_TABLES)fail('table count');
 const dirEnd=12+16*n;if(bytes.byteLength<dirEnd)fail('directory past the end');
 const records:{tag:string;offset:number;length:number}[]=[];
 for(let i=0;i<n;i++){
  const at=12+16*i,tag=tagAt(d,at),offset=d.getUint32(at+8),length=d.getUint32(at+12);
  if(!/^[\x20-\x7e]{4}$/.test(tag)||/^ /.test(tag))fail('table tag');
  if(offset<dirEnd||offset+length>bytes.byteLength)fail('table outside the file');
  records.push({tag,offset,length});
 }
 const tables=new Map<string,Uint8Array>();
 for(const r of records){if(tables.has(r.tag))fail('a table twice');tables.set(r.tag,bytes.subarray(r.offset,r.offset+r.length))}
 // No table may overlap another (OTS: "overlapping tables").
 const sorted=[...records].filter(r=>r.length>0).sort((a,b)=>a.offset-b.offset);
 for(let i=1;i<sorted.length;i++)if(sorted[i].offset<sorted[i-1].offset+sorted[i-1].length)fail('overlapping tables');
 for(const t of REQUIRED)if(!tables.has(t))fail('missing '+t);
 const outlines=flavor==='cff'?tables.has('CFF ')||tables.has('CFF2'):tables.has('glyf')&&tables.has('loca');
 if(!outlines)fail('no outlines');
 const head=tables.get('head')!;if(head.byteLength<54)fail('head');
 const h=view(head);
 if(h.getUint32(12)!==0x5f0f3cf5)fail('head magic');
 const upem=h.getUint16(18);if(upem<16||upem>16384)fail('units per em');
 if(h.getInt16(50)!==0&&h.getInt16(50)!==1)fail('loca format');
 const maxp=tables.get('maxp')!;if(maxp.byteLength<6)fail('maxp');
 const glyphs=view(maxp).getUint16(4);if(glyphs<1)fail('no glyphs');
 const hhea=tables.get('hhea')!;if(hhea.byteLength<36)fail('hhea');
 const metrics=view(hhea).getUint16(34);if(metrics<1||metrics>glyphs)fail('hhea metrics');
 if(tables.get('hmtx')!.byteLength<metrics*4)fail('hmtx');
 if(tables.get('OS/2')!.byteLength<68)fail('OS/2');
 if(tables.get('post')!.byteLength<32)fail('post');
 return {flavor,bytes,tables};
}

// ── The name table ──────────────────────────────────────────────────────
const MAC_ROMAN_HIGH='ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
function decodeName(platform:number,bytes:Uint8Array):string{
 if(platform===0||platform===3){let s='';for(let i=0;i+1<bytes.length;i+=2)s+=String.fromCharCode((bytes[i]<<8)|bytes[i+1]);return s}
 let s='';for(const b of bytes)s+=b<128?String.fromCharCode(b):MAC_ROMAN_HIGH[b-128];return s;
}
/** Every name the font gives for one id, best first: Windows English, then any Windows, then Unicode, then Mac. */
export function readNames(sfnt:Sfnt):Map<number,string>{
 const name=sfnt.tables.get('name')!;if(name.byteLength<6)fail('name');
 const d=view(name),count=d.getUint16(2),store=d.getUint16(4);
 if(6+count*12>name.byteLength)fail('name records');
 const best=new Map<number,{rank:number;value:string}>();
 for(let i=0;i<count;i++){
  const at=6+i*12,platform=d.getUint16(at),encoding=d.getUint16(at+2),language=d.getUint16(at+4),id=d.getUint16(at+6),length=d.getUint16(at+8),offset=d.getUint16(at+10);
  if(store+offset+length>name.byteLength)continue;
  const rank=platform===3&&(encoding===1||encoding===10)?(language===0x409?0:1):platform===0?2:platform===1&&encoding===0?(language===0?3:4):9;
  if(rank===9)continue;
  const value=decodeName(platform,name.subarray(store+offset,store+offset+length));
  const had=best.get(id);if(!had||rank<had.rank)best.set(id,{rank,value});
 }
 return new Map([...best].map(([id,v])=>[id,v.value]));
}
/** A font's name as the Studio keeps it: one line of letters, numbers and plain marks, never an address. */
export function cleanName(v:string|undefined,max:number):string{
 return (v||'').normalize('NFC').replace(/[^\p{L}\p{M}\p{N} '&.,()+-]+/gu,' ').replace(/\s+/g,' ').trim().slice(0,max).trim();
}

// ── The character map ───────────────────────────────────────────────────
/** The character ranges the font maps (format 4 and 12 subtables), [first, last] each. */
export function readCmapRanges(sfnt:Sfnt):[number,number][]{
 const cmap=sfnt.tables.get('cmap')!;if(cmap.byteLength<4)fail('cmap');
 const d=view(cmap),n=d.getUint16(2);if(4+n*8>cmap.byteLength)fail('cmap records');
 let pick:{format:number;offset:number;rank:number}|null=null;
 for(let i=0;i<n;i++){
  const platform=d.getUint16(4+i*8),encoding=d.getUint16(6+i*8),offset=d.getUint32(8+i*8);
  if(offset+4>cmap.byteLength)continue;
  const format=d.getUint16(offset);
  const rank=format===12&&(platform===3&&encoding===10||platform===0)?0:format===4&&(platform===3&&encoding===1||platform===0)?1:9;
  if(rank<9&&(!pick||rank<pick.rank))pick={format,offset,rank};
 }
 if(!pick)fail('no Unicode character map');
 const out:[number,number][]=[],o=pick!.offset;
 if(pick!.format===4){
  if(o+14>cmap.byteLength)fail('cmap 4');
  const segs=d.getUint16(o+6)/2;if(o+16+segs*8>cmap.byteLength)fail('cmap 4 segments');
  for(let s=0;s<segs;s++){const end=d.getUint16(o+14+s*2),start=d.getUint16(o+16+segs*2+s*2);if(start<=end&&start!==0xffff)out.push([start,end])}
 }else{
  if(o+16>cmap.byteLength)fail('cmap 12');
  const groups=d.getUint32(o+12);if(groups>100000||o+16+groups*12>cmap.byteLength)fail('cmap 12 groups');
  for(let g=0;g<groups;g++){const start=d.getUint32(o+16+g*12),end=d.getUint32(o+20+g*12);if(start<=end&&end<=0x10ffff)out.push([start,end])}
 }
 return out;
}
const covered=(ranges:[number,number][],from:number,to:number)=>ranges.reduce((n,[a,b])=>n+Math.max(0,Math.min(b,to)-Math.max(a,from)+1),0);

// ── What the font says about itself ─────────────────────────────────────
export function readAxes(sfnt:Sfnt):Axis[]{
 const fvar=sfnt.tables.get('fvar');if(!fvar)return [];
 if(fvar.byteLength<16)fail('fvar');
 const d=view(fvar),start=d.getUint16(4),count=d.getUint16(8),size=d.getUint16(10);
 if(size<20||count>64||start+count*size>fvar.byteLength)fail('fvar axes');
 const fixed=(at:number)=>d.getInt32(at)/65536,out:Axis[]=[];
 for(let i=0;i<count;i++){const at=start+i*size,a={tag:tagAt(d,at),min:fixed(at+4),default:fixed(at+8),max:fixed(at+12)};if(!(a.min<=a.default&&a.default<=a.max))fail('fvar axis range');out.push(a)}
 return out;
}

function kindOf(os2:DataView,post:DataView):FontKind{
 const family=os2.getUint8(32),serif=os2.getUint8(33),proportion=os2.getUint8(35),cls=os2.getInt16(30)>>8;
 if(proportion===9||post.getUint32(12)!==0)return 'mono';
 if(family===3)return 'script';
 if(family===4||family===5)return 'display';
 if(family===2){if(serif>=11&&serif<=15)return 'sans';if(serif>=2&&serif<=10)return 'serif'}
 if(cls>=1&&cls<=7&&cls!==6)return 'serif';
 if(cls===10)return 'script';
 if(cls===9||cls===12)return 'display';
 return 'sans';
}
const STYLE_WORDS=/\b(italic|oblique)\b/i;

/** Family, style, weight, italic, axes, embedding permission, kind and scripts, from the font's own tables. */
export function readInfo(sfnt:Sfnt):FontInfo{
 const names=readNames(sfnt),os2=view(sfnt.tables.get('OS/2')!),post=view(sfnt.tables.get('post')!),head=view(sfnt.tables.get('head')!);
 const family=cleanName(names.get(16)||names.get(1),54),style=cleanName(names.get(17)||names.get(2),60)||'Regular';
 if(!family)fail('no family name');
 const axes=readAxes(sfnt),wght=axes.find(a=>a.tag==='wght');
 let weight=os2.getUint16(4);if(weight>=1&&weight<=9)weight*=100;
 if(wght)weight=Math.round(wght.default);
 weight=Math.min(1000,Math.max(1,weight||400));
 const fsSelection=os2.getUint16(62),macStyle=head.getUint16(44);
 const italic=!!(fsSelection&0x0001)||!!(fsSelection&0x0200)||!!(macStyle&0x0002)||STYLE_WORDS.test(style);
 const ranges=readCmapRanges(sfnt),characters=covered(ranges,0x20,0x10ffff);
 if(characters<1)fail('no characters');
 const arabic=covered(ranges,0x0621,0x064a)>=20;
 return {family,style,weight,italic,axes,fsType:os2.getUint16(8),kind:kindOf(os2,post),arabic,glyphs:view(sfnt.tables.get('maxp')!).getUint16(4),characters};
}

// ── The font's own embedding permission (OS/2 fsType) ────────────────────
export type Embedding='installable'|'editable'|'preview-print'|'restricted';
/**
 * Bits 1–3 of fsType: restricted (2), preview & print (4), editable (8); none is installable.
 * More than one set: the least restrictive wins (OpenType's rule). Bit 9: only bitmaps may be
 * embedded, so its outlines may not, which the Studio treats as restricted.
 */
export function embeddingOf(fsType:number):{embedding:Embedding;bitmapOnly:boolean;noSubsetting:boolean}{
 const bitmapOnly=!!(fsType&0x0200),noSubsetting=!!(fsType&0x0100);
 const embedding:Embedding=fsType&0x0008?'editable':fsType&0x0004?'preview-print':fsType&0x0002?'restricted':'installable';
 return {embedding:bitmapOnly?'restricted':embedding,bitmapOnly,noSubsetting};
}
export const EMBEDDING_LABELS:Record<Embedding,string>={installable:'Installable','editable':'Editable','preview-print':'Preview & print',restricted:'Restricted'};

/** The tags of a font's tables, sorted. */
export const tableTags=(sfnt:Sfnt)=>[...sfnt.tables.keys()].sort();
