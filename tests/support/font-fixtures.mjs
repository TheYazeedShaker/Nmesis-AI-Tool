// Synthetic font files for the brand-font tests: "Demo Sans" in each format.
// The TrueType ones are a catalogue font (public/fonts/pt-sans, OFL) unpacked
// and renamed; the OTF is a tiny CFF font written here from scratch. Helpers
// change one thing about a font (its names, weight and italic, fsType, an extra
// table) and write it back with a correct directory and checksums.
import {readFileSync} from 'node:fs';
import fontverter from 'fontverter';

const be16=v=>[(v>>8)&255,v&255],be32=v=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
const pad4=b=>{const n=(4-b.length%4)%4;return n?Buffer.concat([b,Buffer.alloc(n)]):b};
function checksum(b){const p=pad4(b);let s=0;for(let i=0;i<p.length;i+=4)s=(s+p.readUInt32BE(i))>>>0;return s}

/** The tables of an sfnt, by tag (copies). */
export function tablesOf(font){
 const b=Buffer.from(font),n=b.readUInt16BE(4),out=new Map();
 for(let i=0;i<n;i++){const at=12+16*i,tag=b.toString('latin1',at,at+4),off=b.readUInt32BE(at+8),len=b.readUInt32BE(at+12);out.set(tag,Buffer.from(b.subarray(off,off+len)))}
 return {flavor:b.readUInt32BE(0),tables:out};
}
/** An sfnt from its tables: sorted directory, 4-byte aligned, checksums and head's adjustment. */
export function writeSfnt(flavor,tables){
 const tags=[...tables.keys()].sort(),n=tags.length;
 let p=1,e=0;while(p*2<=n){p*=2;e++}
 const header=Buffer.from([...be32(flavor),...be16(n),...be16(p*16),...be16(e),...be16(n*16-p*16)]);
 const dir=Buffer.alloc(16*n),bodies=[];let offset=12+16*n;
 tags.forEach((tag,i)=>{
  const data=Buffer.from(tables.get(tag));if(tag==='head')data.writeUInt32BE(0,8);
  dir.write(tag,16*i,'latin1');dir.writeUInt32BE(checksum(data),16*i+4);dir.writeUInt32BE(offset,16*i+8);dir.writeUInt32BE(data.length,16*i+12);
  const padded=pad4(data);bodies.push(padded);offset+=padded.length;
 });
 const out=Buffer.concat([header,dir,...bodies]),headAt=tags.indexOf('head');
 if(headAt>=0){const off=dir.readUInt32BE(16*headAt+8);out.writeUInt32BE((0xb1b0afba-checksum(out))>>>0,off+8)}
 return out;
}
const edit=(font,fn)=>{const {flavor,tables}=tablesOf(font);fn(tables);return writeSfnt(flavor,tables)};

/** A name table (Windows, English) with the family and style, typographic names included. */
export function nameTable({family,style}){
 const entries=[[1,family],[2,style],[4,`${family} ${style}`],[6,(family+'-'+style).replace(/[^A-Za-z0-9-]/g,'')],[16,family],[17,style]];
 const strings=entries.map(([,s])=>Buffer.from(s,'utf16le').swap16());
 const records=Buffer.alloc(entries.length*12);let off=0;
 entries.forEach(([id],i)=>{const r=12*i;records.writeUInt16BE(3,r);records.writeUInt16BE(1,r+2);records.writeUInt16BE(0x409,r+4);records.writeUInt16BE(id,r+6);records.writeUInt16BE(strings[i].length,r+8);records.writeUInt16BE(off,r+10);off+=strings[i].length});
 return Buffer.concat([Buffer.from([...be16(0),...be16(entries.length),...be16(6+records.length)]),records,...strings]);
}
export const withNames=(font,names)=>edit(font,t=>t.set('name',nameTable(names)));
export const withFsType=(font,fsType)=>edit(font,t=>{const os2=t.get('OS/2');os2.writeUInt16BE(fsType,8)});
export const withTable=(font,tag,bytes)=>edit(font,t=>t.set(tag,Buffer.from(bytes)));
export function withStyle(font,{weight,italic}){
 return edit(font,t=>{
  const os2=t.get('OS/2'),head=t.get('head');
  if(weight)os2.writeUInt16BE(weight,4);
  if(italic!==undefined){const sel=os2.readUInt16BE(62)&~0x0261;os2.writeUInt16BE(italic?sel|1:sel|(weight===700?0x20:0x40),62);head.writeUInt16BE(italic?2:0,44)}
 });
}

// ── TrueType: a catalogue font, unpacked and renamed ──────────────────────
// One at a time: the WOFF2 tool's WebAssembly memory is shared (lib/brand-fonts/sanitise.ts `exclusive`).
const catalogue=file=>fontverter.convert(readFileSync(new URL('../../public/fonts/'+file,import.meta.url)),'sfnt','woff2');
/** Demo Sans Regular, Bold and Italic (TTF), from one family's files. */
export async function demoSans(){
 const regular=await catalogue('pt-sans/pt-sans-400-normal.woff2'),bold=await catalogue('pt-sans/pt-sans-700-normal.woff2'),italic=await catalogue('pt-sans/pt-sans-400-italic.woff2');
 return {
  regular:withNames(regular,{family:'Demo Sans',style:'Regular'}),
  bold:withNames(bold,{family:'Demo Sans',style:'Bold'}),
  italic:withNames(italic,{family:'Demo Sans',style:'Italic'}),
 };
}
/** A variable font (TTF) with its weight axis, renamed. */
export async function demoVariable(){return withNames(await catalogue('inter/inter-normal.woff2'),{family:'Demo Variable',style:'Regular'})}
/** An Arabic font (TTF, variable weight), renamed. */
export async function demoArabic(){return withNames(await catalogue('cairo/cairo-normal.woff2'),{family:'Demo Arabic',style:'Regular'})}
export const toWoff=font=>fontverter.convert(Buffer.from(font),'woff','sfnt');
export const toWoff2=font=>fontverter.convert(Buffer.from(font),'woff2','sfnt');

// ── OTF: a tiny CFF font ──────────────────────────────────────────────────
// Three glyphs (.notdef, A, B: squares), a format 4 character map for A and B.
const cffNum=v=>v>=-107&&v<=107?[v+139]:v>=108&&v<=1131?[((v-108)>>8)+247,(v-108)&255]:v<=-108&&v>=-1131?[((-v-108)>>8)+251,(-v-108)&255]:[28,...be16(v&0xffff)];
const int32=v=>[29,...be32(v)];
function index(items){
 if(!items.length)return Buffer.from([0,0]);
 const offsets=[1];for(const it of items)offsets.push(offsets.at(-1)+it.length);
 return Buffer.concat([Buffer.from([...be16(items.length),4,...offsets.flatMap(be32)]),...items.map(Buffer.from)]);
}
function cffTable(name){
 const square=w=>[...cffNum(w),...cffNum(50),...cffNum(0),21,...cffNum(w-100),...cffNum(0),5,...cffNum(0),...cffNum(700),5,...cffNum(-(w-100)),...cffNum(0),5,14];
 const charStrings=index([[...cffNum(500),14],square(600),square(640)]),priv=Buffer.from([139,20,139,21]);
 const header=Buffer.from([1,0,4,4]),names=index([Buffer.from(name,'latin1')]),strings=index([]),gsubrs=index([]);
 const topSize=index([Buffer.from([...int32(0),17,...int32(0),...int32(0),18])]).length;
 const charStringsAt=header.length+names.length+topSize+strings.length+gsubrs.length,privAt=charStringsAt+charStrings.length;
 const top=index([Buffer.from([...int32(charStringsAt),17,...int32(priv.length),...int32(privAt),18])]);
 return Buffer.concat([header,names,top,strings,gsubrs,charStrings,priv]);
}
function cmap4(map){// map: [[code,glyph]] sorted, one segment each, then 0xFFFF
 const segs=[...map.map(([c,g])=>({start:c,end:c,delta:(g-c)&0xffff})),{start:0xffff,end:0xffff,delta:1}],n=segs.length;
 const body=[...be16(4),...be16(16+n*8),...be16(0),...be16(n*2),...be16(2),...be16(0),...be16(0),...segs.flatMap(s=>be16(s.end)),0,0,...segs.flatMap(s=>be16(s.start)),...segs.flatMap(s=>be16(s.delta)),...segs.flatMap(()=>be16(0))];
 return Buffer.from([...be16(0),...be16(1),...be16(3),...be16(1),...be32(12),...body]);
}
/** Demo Sans as an OTF with CFF outlines. */
export function demoOtf({family='Demo Sans',style='Regular',weight=400,fsType=0}={}){
 const head=Buffer.alloc(54);head.writeUInt32BE(0x10000,0);head.writeUInt32BE(0x10000,4);head.writeUInt32BE(0x5f0f3cf5,12);head.writeUInt16BE(3,16);head.writeUInt16BE(1000,18);
 head.writeInt16BE(50,36);head.writeInt16BE(0,38);head.writeInt16BE(590,40);head.writeInt16BE(700,42);head.writeUInt16BE(8,46);head.writeInt16BE(2,48);
 const hhea=Buffer.alloc(36);hhea.writeUInt32BE(0x10000,0);hhea.writeInt16BE(800,4);hhea.writeInt16BE(-200,6);hhea.writeUInt16BE(640,10);hhea.writeInt16BE(590,16);hhea.writeInt16BE(1,18);hhea.writeUInt16BE(3,34);
 const hmtx=Buffer.from([...be16(500),...be16(0),...be16(600),...be16(50),...be16(640),...be16(50)]);
 const maxp=Buffer.from([...be32(0x5000),...be16(3)]);
 const os2=Buffer.alloc(96);os2.writeUInt16BE(4,0);os2.writeInt16BE(580,2);os2.writeUInt16BE(weight,4);os2.writeUInt16BE(5,6);os2.writeUInt16BE(fsType,8);
 os2[32]=2;os2[33]=11;os2.writeUInt16BE(0x40,62);os2.writeUInt16BE(0x41,64);os2.writeUInt16BE(0x42,66);os2.writeInt16BE(800,68);os2.writeInt16BE(-200,70);os2.writeUInt16BE(1000,74);os2.writeUInt16BE(200,76);os2.writeInt16BE(500,86);os2.writeInt16BE(700,88);
 const post=Buffer.alloc(32);post.writeUInt32BE(0x30000,0);post.writeInt16BE(-100,8);post.writeInt16BE(50,10);
 return writeSfnt(0x4f54544f,new Map([['CFF ',cffTable((family+'-'+style).replace(/[^A-Za-z0-9-]/g,''))],['OS/2',os2],['cmap',cmap4([[0x41,1],[0x42,2]])],['head',head],['hhea',hhea],['hmtx',hmtx],['maxp',maxp],['name',nameTable({family,style})],['post',post]]));
}
