// Capture the existing browsing context: opening another URL loses the selected angle/trim.
export const highResolutionDisplayOptions=()=>({video:{displaySurface:'browser',width:{ideal:7680},height:{ideal:4320},resizeMode:'none',cursor:'never'},audio:false,selfBrowserSurface:'include',preferCurrentTab:true} as DisplayMediaStreamOptions);
export function captureBounds(rect:{left:number;top:number;width:number;height:number},viewport:{width:number;height:number},image:{width:number;height:number}){
 if(rect.left<0||rect.top<0||rect.left+rect.width>viewport.width+2||rect.top+rect.height>viewport.height+2||rect.width<=0||rect.height<=0)throw new Error('Bring the entire configurator into view, then generate again.');
 const sx=image.width/viewport.width,sy=image.height/viewport.height;
 return {x:Math.round(rect.left*sx),y:Math.round(rect.top*sy),w:Math.round(rect.width*sx),h:Math.round(rect.height*sy)};
}
type RegionTrack=MediaStreamTrack&{cropTo?:(target:unknown)=>Promise<void>;getCaptureHandle?:()=>{handle:string;origin:string}|null};
function visibleConfigurator(frame:HTMLIFrameElement){
 if(!frame.isConnected)throw new Error('The configurator changed. Capture the view again.');
 const r=frame.getBoundingClientRect();captureBounds(r,{width:window.innerWidth,height:window.innerHeight},{width:window.innerWidth,height:window.innerHeight});
 for(const x of [.2,.5,.8])for(const y of [.2,.5,.8])if(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)!==frame)throw new Error('Close the panel covering the configurator, then capture again.');
 return {left:r.left,top:r.top,width:r.width,height:r.height};
}
async function videoSnapshot(stream:MediaStream,verify:()=>void,expectedRatio?:number){
 const video=document.createElement('video');video.muted=true;video.srcObject=stream;
 const canvas=document.createElement('canvas');
 try{
  await video.play();
  return await new Promise<string>((resolve,reject)=>{
   let callback:number|undefined,timer:ReturnType<typeof setTimeout>|undefined,done=false;
   const finish=(error?:Error,image?:string)=>{if(done)return;done=true;clearTimeout(deadline);clearTimeout(timer);if(callback!==undefined)video.cancelVideoFrameCallback?.(callback);error?reject(error):resolve(image!)};
   const deadline=setTimeout(()=>finish(new Error('The browser did not provide an isolated car image. Capture the configurator in its own tab, or paste a screenshot.')),8000);
   const next=()=>{if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(read);else timer=setTimeout(read,80)};
   const read=()=>{if(done)return;try{
    verify();const w=video.videoWidth,h=video.videoHeight;if(!w||!h){next();return}
    if(w>16384||h>16384||w*h>70_000_000)throw new Error('The capture is too large. Use a smaller display or import the original frame.');
    // A full-tab or stale-sized frame must never be treated as an isolated region.
    if(expectedRatio&&Math.abs(w/h/expectedRatio-1)>.025){next();return}
    canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser could not save the captured image.');
    ctx.drawImage(video,0,0);finish(undefined,canvas.toDataURL('image/png'));
   }catch(e){finish(e instanceof Error?e:new Error('Capture failed.'))}};
   next();
  });
 }finally{video.pause();video.srcObject=null;canvas.width=canvas.height=1}
}
// Native region capture crops inside the browser compositor. Never resize the
// iframe or infer an iframe crop from an unverified full-page screenshot.
export async function snapshotStream(stream:MediaStream,frame:HTMLIFrameElement|null,handle:string){
 const track=stream.getVideoTracks()[0] as RegionTrack|undefined;
 const check=()=>{if(!track||track.readyState!=='live')throw new Error('Tab sharing ended. Capture the view again.');const id=track.getCaptureHandle?.();if(id?.handle!==handle||id?.origin!==location.origin)throw new Error('Choose “This Tab” (Nmesis Studio) to isolate the configurator. To use another tab, choose Capture options.')};check();
 if(!frame)throw new Error('Open the live configurator first.');
 const cropTarget=(globalThis as typeof globalThis&{CropTarget?:{fromElement:(element:Element)=>Promise<unknown>}}).CropTarget;
 if(!cropTarget?.fromElement||!track?.cropTo)throw new Error('This browser cannot isolate the configurator. Open the configurator in its own tab, then use Capture options → Capture a browser tab.');
 const x=window.scrollX,y=window.scrollY;let cropAttempted=false;
 try{
  frame.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const rect=visibleConfigurator(frame),target=await cropTarget.fromElement(frame);check();
  cropAttempted=true;
  try{await track.cropTo(target)}catch{throw new Error('The browser could not isolate this configurator. Use Capture options to capture its separate tab instead.')}
  // Attach a NEW video only AFTER cropTo resolves: it never receives whole-page frames.
  return await videoSnapshot(stream,()=>{check();const now=visibleConfigurator(frame);if((['left','top','width','height'] as const).some(k=>Math.abs(now[k]-rect[k])>1))throw new Error('The view moved during capture. Keep the page still and capture again.')},rect.width/rect.height);
 }finally{
  // The snapshot video is already detached. Release Chrome's cropped-region
  // outline before scrolling away; keep permission for the next screenshot.
  if(cropAttempted){
   let timeout:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([track.cropTo(null),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Capture cleanup timed out.')),1500)})])}
   catch{stream.getTracks().forEach(t=>t.stop())}
   finally{clearTimeout(timeout)}
  }
  window.scrollTo({left:x,top:y,behavior:'instant'});
 }
}
// A manually chosen separate tab is always reviewed/cropped by the user.
export async function captureSharedTab(stream:MediaStream,frame:HTMLIFrameElement|null,handle:string){
 const track=stream.getVideoTracks()[0] as RegionTrack|undefined;const identity=track?.getCaptureHandle?.();
 if(identity?.origin===location.origin)return snapshotStream(stream,frame,handle);
 return videoSnapshot(stream,()=>{if(!track||track.readyState!=='live')throw new Error('Tab sharing ended. Capture again.');});
}
