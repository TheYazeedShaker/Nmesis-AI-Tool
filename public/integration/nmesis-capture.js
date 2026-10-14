/**
 * NMESIS current-view capture connector.
 * Install inside a configurator page you control:
 * <script src="https://YOUR-STUDIO.vercel.app/integration/nmesis-capture.js"
 *         data-studio-origin="https://YOUR-STUDIO.vercel.app" defer></script>
 * Optional window.nmesisCaptureView() adapter returns {image,angle,finish}.
 * Pannellum adapter follows https://pannellum.org/documentation/api/
 */
(function(){
 'use strict';
 const script=document.currentScript;
 const configuredOrigin=script?.dataset.studioOrigin||(script?.src?new URL(script.src).origin:null);
 if(!configuredOrigin)return;
 const origin=new URL(configuredOrigin).origin;
 let busy=false;
 function visible(el){
  if(!el||!el.getClientRects().length)return false;
  for(let node=el;node instanceof Element;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;}
  const r=el.getBoundingClientRect();return r.width>100&&r.height>70;
 }
 async function dataUrl(blob){
  if(blob.size>8000000||!['image/png','image/jpeg','image/webp'].includes(blob.type))throw new Error('Unsupported image');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
 }
 async function currentImage(){
  if(typeof window.nmesisCaptureView==='function')return await window.nmesisCaptureView();
  const pano=window.pannellumViewer;
  if(pano?.isLoaded?.()&&visible(pano.getContainer())){
   const rad=Math.PI/180;
   const image=pano.getRenderer().render(pano.getPitch()*rad,pano.getYaw()*rad,pano.getHfov()*rad,{returnImage:true});
   return {image,angle:'Interior · yaw '+pano.getYaw().toFixed(1)+'°, pitch '+pano.getPitch().toFixed(1)+'°',finish:document.querySelector('#interiorLabel')?.textContent?.trim()||'Selected interior'};
  }
  const known=['#car-img','#ambientFrameImg','#daynight-img','#interaction-img'].map(s=>document.querySelector(s)).find(visible);
  const candidates=[...document.querySelectorAll('img,canvas,video')].filter(visible).sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height});
  const el=known||candidates[0];if(!el)throw new Error('No visible frame');
  if(el instanceof HTMLImageElement){
   const url=el.currentSrc||el.src;if(!url||!el.complete||!el.naturalWidth)throw new Error('Frame still loading');
   const response=await fetch(url,{signal:AbortSignal.timeout(1500)});if(!response.ok)throw new Error('Image not available');
   return {image:await dataUrl(await response.blob()),angle:'Current exterior / detail frame',finish:['#tbTrimLabel','#tbColorLabel'].map(s=>document.querySelector(s)?.textContent?.trim()).filter(Boolean).join(' · ')||'Selected configurator finish'};
  }
  const canvas=document.createElement('canvas');canvas.width=el.videoWidth||el.width;canvas.height=el.videoHeight||el.height;
  if(!canvas.width||!canvas.height)throw new Error('Frame not ready');
  const ctx=canvas.getContext('2d');ctx.drawImage(el,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  if(!pixels.some((v,i)=>i%4!==3&&v>0))throw new Error('Renderer did not provide a frame');
  return {image:canvas.toDataURL('image/png'),angle:'Current rendered view',finish:['#tbTrimLabel','#tbColorLabel'].map(s=>document.querySelector(s)?.textContent?.trim()).filter(Boolean).join(' · ')||'Selected configurator finish'};
 }
 window.addEventListener('message',async event=>{
  if(event.origin===origin&&event.source===window.parent&&event.data?.type==='nmesis:capture-probe'){window.parent.postMessage({type:'nmesis:capture-ready'},origin);return;}
  if(event.origin!==origin||event.source!==window.parent||event.data?.type!=='nmesis:capture'||typeof event.data.requestId!=='string'||event.data.requestId.length>80||busy)return;
  busy=true;
  try{const capture=await currentImage();if(!capture||typeof capture.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(capture.image)||capture.image.length>=12000000)throw new Error('Invalid frame');window.parent.postMessage({type:'nmesis:capture-result',requestId:event.data.requestId,image:capture.image,angle:String(capture.angle||'Current view').slice(0,100),finish:String(capture.finish||'Selected finish').slice(0,120)},origin)}
  catch{window.parent.postMessage({type:'nmesis:capture-result',requestId:event.data.requestId,error:'Use a screenshot for this view'},origin)}finally{busy=false}
 });
})();
