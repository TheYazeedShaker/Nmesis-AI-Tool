/** Install inside the configurator, providing its own renderer-specific capture callback. */
export function installStudioCapture({studioOrigin,capture}) {
 const expected=new URL(studioOrigin).origin;
 let capturing=false;
 async function receive(event){
  if(event.origin!==expected||event.source!==window.parent||event.data?.type!=='nmesis:capture'||typeof event.data.requestId!=='string'||event.data.requestId.length>80||capturing)return;
  capturing=true;
  try{
   const result=await capture();
   if(typeof result.image!=='string'||!result.image.startsWith('data:image/png;base64,')||result.image.length>12000000)throw new Error('Capture unavailable');
   window.parent.postMessage({type:'nmesis:capture-result',requestId:event.data.requestId,image:result.image,angle:String(result.angle||'Custom view').slice(0,100),finish:String(result.finish||'Selected finish').slice(0,120)},expected);
  }catch{window.parent.postMessage({type:'nmesis:capture-result',requestId:event.data.requestId,error:'Capture unavailable'},expected)}finally{capturing=false}
 }
 window.addEventListener('message',receive);
 return()=>window.removeEventListener('message',receive);
}
