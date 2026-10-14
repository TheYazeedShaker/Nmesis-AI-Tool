import {decode} from 'fast-png';
import jpeg from 'jpeg-js';
import {imageDimensions} from './image-dimensions';
import {parseDetailRegions,type DetailRegion} from './nano-reference';
import type {GoogleImageInput} from './gemini-server';
// Magnify existing source pixels only; these are attention anchors, not invented detail.
export function nanoDetailInputs(source:GoogleImageInput,regions:DetailRegion[]):GoogleImageInput[]{
 const boxes=parseDetailRegions(regions),d=imageDimensions(source.bytes);
 if(d.width*d.height>8_900_000)throw new Error('Detail anchors support configurator captures up to 4K.');
 let pixels:Uint8Array,channels:number;
 if(d.type==='image/png'){if(source.bytes[24]!==8||![0,2,4,6].includes(source.bytes[25]))throw new Error('Use a standard PNG or JPEG car capture for detail anchors.');const p=decode(source.bytes,{checkCrc:true});pixels=p.data as Uint8Array;channels=p.channels}
 else if(d.type==='image/jpeg'){const p=jpeg.decode(source.bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:8.9,maxMemoryUsageInMB:96});pixels=p.data;channels=4}
 else throw new Error('Use a PNG or JPEG car capture for detail anchors.');
 return boxes.map(r=>{
  const x0=Math.floor(r.x*d.width),y0=Math.floor(r.y*d.height),cw=Math.min(d.width-x0,Math.max(1,Math.round(r.width*d.width))),ch=Math.min(d.height-y0,Math.max(1,Math.round(r.height*d.height)));
  const scale=768/Math.max(cw,ch),width=Math.max(1,Math.round(cw*scale)),height=Math.max(1,Math.round(ch*scale)),data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const sx=x0+Math.min(cw-1,Math.floor(x/scale)),sy=y0+Math.min(ch-1,Math.floor(y/scale)),p=(sy*d.width+sx)*channels,q=(y*width+x)*4,alpha=channels===2?pixels[p+1]/255:channels===4?pixels[p+3]/255:1;
   for(let c=0;c<3;c++)data[q+c]=Math.round(pixels[p+(channels<=2?0:c)]*alpha+255*(1-alpha));data[q+3]=255;
  }
  return {bytes:new Uint8Array(jpeg.encode({width,height,data},95).data),type:'image/jpeg'};
 });
}
