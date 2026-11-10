export type CaptureResult={image:string;angle?:string;finish?:string};
export function captureResponse(value:unknown):value is CaptureResult{
 const v=value as CaptureResult;
 return !!v&&typeof v.image==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(v.image)&&v.image.length<54_000_000;
}
export async function requestFrameCapture(frame:HTMLIFrameElement,url:string):Promise<CaptureResult|null>{
 const source=frame.contentWindow;if(!source)return null;
 const origin=new URL(url).origin;const requestId=crypto.randomUUID();
 return new Promise(resolve=>{
  let timer=setTimeout(()=>finish(null),500);let requested=false;
  function finish(result:CaptureResult|null){clearTimeout(timer);window.removeEventListener('message',receive);resolve(result)}
  function receive(event:MessageEvent){
   if(event.source!==source||event.origin!==origin)return;
   if(event.data?.type==='nmesis:capture-ready'&&!requested){requested=true;clearTimeout(timer);timer=setTimeout(()=>finish(null),15000);source!.postMessage({type:'nmesis:capture',requestId,quality:'original',width:7680,height:4320},origin);return}
   if(event.data?.type!=='nmesis:capture-result'||event.data?.requestId!==requestId)return;
   finish(captureResponse(event.data)?event.data:null);
  }
  window.addEventListener('message',receive);
  source.postMessage({type:'nmesis:capture-probe'},origin);
 });
}
export async function imageFromUrl(value:string){
 const url=new URL(value.trim());if(url.protocol!=='https:')throw new Error('Use an HTTPS image URL.');
 let response:Response;try{response=await fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(15000)})}catch{throw new Error('This source blocks direct image import. Save the image and upload it, or capture a screenshot.')}
 if(!response.ok)throw new Error('This image could not be downloaded. Upload it or capture a screenshot.');
 const blob=await response.blob();if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>40_000_000)throw new Error('Use a PNG, JPEG or WebP image up to 40 MB.');
 return new File([blob],'configurator-reference.'+blob.type.split('/')[1],{type:blob.type});
}
