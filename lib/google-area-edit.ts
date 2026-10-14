import {encode} from 'fast-png';
import jpeg from 'jpeg-js';
import {readPng,cropWorkingImage,providerMask,areaPrompt,type AreaIntent} from './area-edit';
import {imageDimensions} from './image-dimensions';
// Pad to a supported ratio instead of stretching the scene. The exact padding
// is removed before the existing selection compositor sees the result.
export function googleAreaInputs(working:Uint8Array,mask:Uint8Array,width:number,height:number,work:{width:number;height:number}){
 const ratios=['1:1','16:9','9:16','4:3','3:4','3:2','2:3'];
 const ratioValue=(s:string)=>{const [w,h]=s.split(':').map(Number);return w/h};
 const aspectRatio=ratios.sort((a,b)=>Math.abs(Math.log(ratioValue(a)/(work.width/work.height)))-Math.abs(Math.log(ratioValue(b)/(work.width/work.height))))[0],ratio=ratioValue(aspectRatio);
 const frame={width:Math.max(work.width,Math.ceil(work.height*ratio)),height:Math.max(work.height,Math.ceil(work.width/ratio))};
 const region={x:Math.floor((frame.width-work.width)/2),y:Math.floor((frame.height-work.height)/2),...work};
 const src=readPng(working),api=readPng(providerMask(mask,width,height,work));
 const base=new Uint8Array(frame.width*frame.height*3).fill(32),guide=new Uint8Array(frame.width*frame.height);
 for(let y=0;y<work.height;y++)for(let x=0;x<work.width;x++){
  const p=y*work.width+x,q=(y+region.y)*frame.width+x+region.x;
  for(let c=0;c<3;c++)base[q*3+c]=src.data[p*src.channels+(src.channels<=2?0:c)];
  guide[q]=255-api.data[p*4+3];
 }
 return {aspectRatio,frame,region,images:[{bytes:encode({...frame,data:base,channels:3,depth:8}),type:'image/png'},{bytes:encode({...frame,data:guide,channels:1,depth:8}),type:'image/png'}]};
}
export function googleAreaPrompt(instruction:string,hasReference:boolean,intent:AreaIntent,aware:boolean){
 const shared=areaPrompt(instruction,hasReference,intent,aware)
  .replace('The transparent part of the supplied mask is the only editable area.','Image 2 is a black-and-white selection guide aligned exactly with Image 1: WHITE is editable, BLACK is protected.')
  .replace('Image 2 is a reference for ONLY the selected area.','Image 3 is a reference for ONLY the selected area.');
 return ['NANO BANANA LOCAL AREA EDIT. Return a complete edited photograph based on Image 1, never the selection guide. Preserve the exact canvas size, padding, camera, composition and position of every unchanged feature. Image 2 is only a selection map; do not render its black/white colors, borders or brush marks in the result.',shared,intent==='add'?'ADD IN PLACE: Create the requested object entirely within the white area, including its shadow. Retain the existing background around it; do not return a separate cutout or transparent layer.':'','Keep texture, sharpness, light, reflections and color continuous across the edit boundary. Return exactly one photograph, with no labels or comparison panels.'].filter(Boolean).join('\n\n');
}
export function normalizeGoogleArea(bytes:Uint8Array,frame:{width:number;height:number},region:{x:number;y:number;width:number;height:number},work:{width:number;height:number}){
 const d=imageDimensions(bytes);
 if(d.width*d.height>4_500_000||Math.abs(d.width/d.height-frame.width/frame.height)/(frame.width/frame.height)>.015)throw new Error('Google changed the edit framing or returned an oversized image. Your original is preserved.');
 let png:Uint8Array;
 if(d.type==='image/png'){readPng(bytes,4_500_000);png=bytes}
 else if(d.type==='image/jpeg'){const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,maxResolutionInMP:4.5,maxMemoryUsageInMB:64});png=encode({width:decoded.width,height:decoded.height,data:decoded.data,channels:3,depth:8})}
 else throw new Error('Google returned an unsupported edit image. Your original is preserved.');
 const x=Math.round(region.x*d.width/frame.width),y=Math.round(region.y*d.height/frame.height),right=Math.round((region.x+region.width)*d.width/frame.width),bottom=Math.round((region.y+region.height)*d.height/frame.height);
 return cropWorkingImage(png,{x,y,width:right-x,height:bottom-y},work);
}
