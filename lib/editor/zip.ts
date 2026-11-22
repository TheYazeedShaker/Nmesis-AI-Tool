// A ZIP of files, stored (no compression: the pages are PNGs, already
// compressed). Enough for "Download all pages"; no library. The format is
// PKWARE's APPNOTE: a local header and the bytes for each file, then the
// central directory and its end record. Names are ASCII file names.

const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
export function crc32(bytes:Uint8Array){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0}

/** The ZIP's bytes for these files (each name unique, ASCII). `date` stamps every file. */
export function zipStored(files:{name:string;bytes:Uint8Array}[],date=new Date()):Uint8Array{
 const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
 const dosDate=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
 const enc=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const f of files){
  const name=enc.encode(f.name.replace(/[^\x20-\x7e]/g,'_')),crc=crc32(f.bytes),size=f.bytes.length;
  const local=new DataView(new ArrayBuffer(30));
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0,true);local.setUint16(8,0,true);
  local.setUint16(10,dosTime,true);local.setUint16(12,dosDate,true);local.setUint32(14,crc,true);local.setUint32(18,size,true);local.setUint32(22,size,true);
  local.setUint16(26,name.length,true);local.setUint16(28,0,true);
  const head=new DataView(new ArrayBuffer(46));
  head.setUint32(0,0x02014b50,true);head.setUint16(4,20,true);head.setUint16(6,20,true);head.setUint16(8,0,true);head.setUint16(10,0,true);
  head.setUint16(12,dosTime,true);head.setUint16(14,dosDate,true);head.setUint32(16,crc,true);head.setUint32(20,size,true);head.setUint32(24,size,true);
  head.setUint16(28,name.length,true);head.setUint32(42,offset,true);
  parts.push(new Uint8Array(local.buffer),name,f.bytes);central.push(new Uint8Array(head.buffer),name);
  offset+=30+name.length+size;
 }
 const centralSize=central.reduce((n,p)=>n+p.length,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);
 const all=[...parts,...central,new Uint8Array(end.buffer)],out=new Uint8Array(all.reduce((n,p)=>n+p.length,0));let at=0;
 for(const p of all){out.set(p,at);at+=p.length}
 return out;
}
