// Read dimensions from supported raster headers without trusting upload metadata.
export function imageDimensions(bytes:Uint8Array):{width:number;height:number;type:string}{
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(start:number,end:number)=>new TextDecoder().decode(bytes.subarray(start,end));
  const result=(width:number,height:number,type:string)=>{if(!width||!height||width>16384||height>16384||width*height>70_000_000)throw new Error('Choose an image no larger than 70 megapixels and 16,384 pixels per side.');return{width,height,type}};
  if(bytes.length>=33&&bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])&&text(12,16)==='IHDR')return result(d.getUint32(16),d.getUint32(20),'image/png');
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    let p=2;
    while(p+4<=bytes.length){
      if(bytes[p++]!==255)break;while(bytes[p]===255)p++;const marker=bytes[p++];
      if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
      if(p+2>bytes.length)break;const length=d.getUint16(p);if(length<2||p+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return result(d.getUint16(p+5),d.getUint16(p+3),'image/jpeg');
      p+=length;
    }
  }
  if(bytes.length>=30&&text(0,4)==='RIFF'&&text(8,12)==='WEBP'){
    for(let p=12;p+8<=bytes.length;){const type=text(p,p+4),length=d.getUint32(p+4,true),s=p+8;if(length>bytes.length-s)break;
      if(type==='VP8X'&&length>=10)return result(1+bytes[s+4]+(bytes[s+5]<<8)+(bytes[s+6]<<16),1+bytes[s+7]+(bytes[s+8]<<8)+(bytes[s+9]<<16),'image/webp');
      if(type==='VP8 '&&length>=10&&bytes[s+3]===0x9d&&bytes[s+4]===1&&bytes[s+5]===0x2a)return result(d.getUint16(s+6,true)&0x3fff,d.getUint16(s+8,true)&0x3fff,'image/webp');
      if(type==='VP8L'&&length>=5&&bytes[s]===0x2f){const bits=d.getUint32(s+1,true);return result((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1,'image/webp')}
      p=s+length+(length%2);
    }
  }
  throw new Error('This image could not be read. Choose a valid PNG, JPEG or WebP.');
}
