/** A capture that did not work, with the step it stopped at (for the console) and a sentence for the person. */
export type CaptureStep='unsupported'|'shared'|'tab'|'view'|'covered'|'isolate'|'frame'|'size'|'save';
export class CaptureError extends Error{
 readonly step:CaptureStep;
 constructor(step:CaptureStep,message:string){super(message);this.name='CaptureError';this.step=step}
}
/** Why a capture did not work, for the console: the step and the error's kind, never an address. */
export function logCaptureFailure(tool:string,e:unknown){
 const err=e instanceof Error?e:new Error(String(e));
 console.warn('[capture] '+tool+' did not capture the view',{step:err instanceof CaptureError?err.step:'browser',name:err.name,reason:err.message});
}
// Capture the existing browsing context: opening another URL loses the selected angle/trim.
export const highResolutionDisplayOptions=()=>({video:{displaySurface:'browser',width:{ideal:7680},height:{ideal:4320},resizeMode:'none',cursor:'never'},audio:false,selfBrowserSurface:'include',preferCurrentTab:true} as DisplayMediaStreamOptions);
export function captureBounds(rect:{left:number;top:number;width:number;height:number},viewport:{width:number;height:number},image:{width:number;height:number}){
 if(rect.left<0||rect.top<0||rect.left+rect.width>viewport.width+2||rect.top+rect.height>viewport.height+2||rect.width<=0||rect.height<=0)throw new CaptureError('view','Part of the configurator was outside the window. Make the window larger, then try again.');
 const sx=image.width/viewport.width,sy=image.height/viewport.height;
 return {x:Math.round(rect.left*sx),y:Math.round(rect.top*sy),w:Math.round(rect.width*sx),h:Math.round(rect.height*sy)};
}
type RegionTrack=MediaStreamTrack&{cropTo?:(target:unknown)=>Promise<void>;getCaptureHandle?:()=>{handle:string;origin:string}|null};
function visibleConfigurator(frame:HTMLIFrameElement){
 if(!frame.isConnected)throw new CaptureError('view','The configurator changed. Capture the view again.');
 const r=frame.getBoundingClientRect();captureBounds(r,{width:window.innerWidth,height:window.innerHeight},{width:window.innerWidth,height:window.innerHeight});
 for(const x of [.2,.5,.8])for(const y of [.2,.5,.8])if(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)!==frame)throw new CaptureError('covered','Something was covering the configurator. Close any open panel, then try again.');
 return {left:r.left,top:r.top,width:r.width,height:r.height};
}
// expectedRatio, when given, is read for every frame: the configurator's ratio NOW. While sharing
// starts the browser may draw its "Sharing this tab" bar, which takes height off the window; a tool
// page fills the window, so the configurator moves and resizes once. The crop follows the element,
// so the capture waits for a frame of the settled view instead of failing on the move.
async function videoSnapshot(stream:MediaStream,verify:()=>boolean|void,expectedRatio?:()=>number){
 const video=document.createElement('video');video.muted=true;video.srcObject=stream;
 const canvas=document.createElement('canvas');
 try{
  await video.play();
  return await new Promise<string>((resolve,reject)=>{
   let callback:number|undefined,timer:ReturnType<typeof setTimeout>|undefined,done=false;
   const finish=(error?:Error,image?:string)=>{if(done)return;done=true;clearTimeout(deadline);clearTimeout(timer);if(callback!==undefined)video.cancelVideoFrameCallback?.(callback);error?reject(error):resolve(image!)};
   const deadline=setTimeout(()=>finish(new CaptureError('frame','The browser did not send a picture of the configurator in time.')),8000);
   const next=()=>{if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(read);else timer=setTimeout(read,80)};
   const read=()=>{if(done)return;try{
    if(verify()===false){next();return}const w=video.videoWidth,h=video.videoHeight;if(!w||!h){next();return}
    if(w>16384||h>16384||w*h>70_000_000)throw new CaptureError('size','The capture is too large. Use a smaller window, or paste the image’s address instead.');
    // A full-tab or stale-sized frame must never be treated as an isolated region.
    if(expectedRatio&&Math.abs(w/h/expectedRatio()-1)>.025){next();return}
    canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw new CaptureError('save','This browser could not save the captured image.');
    ctx.drawImage(video,0,0);finish(undefined,canvas.toDataURL('image/png'));
   }catch(e){finish(e instanceof Error?e:new CaptureError('frame','The capture stopped.'))}};
   next();
  });
 }finally{video.pause();video.srcObject=null;canvas.width=canvas.height=1}
}
// Native region capture crops inside the browser compositor. Never resize the
// iframe or infer an iframe crop from an unverified full-page screenshot.
export async function snapshotStream(stream:MediaStream,frame:HTMLIFrameElement|null,handle:string){
 const track=stream.getVideoTracks()[0] as RegionTrack|undefined;
 const check=()=>{if(!track||track.readyState!=='live')throw new CaptureError('shared','Tab sharing ended before the picture was taken.');const id=track.getCaptureHandle?.();if(id?.handle!==handle||id?.origin!==location.origin)throw new CaptureError('tab','Another tab was shared. Share this tab (Nmesis Studio) to capture the configurator.')};check();
 if(!frame)throw new CaptureError('view','Open the live configurator first.');
 const cropTarget=(globalThis as typeof globalThis&{CropTarget?:{fromElement:(element:Element)=>Promise<unknown>}}).CropTarget;
 if(!cropTarget?.fromElement||!track?.cropTo)throw new CaptureError('unsupported','This browser can’t capture just the configurator.');
 const x=window.scrollX,y=window.scrollY;let cropAttempted=false;
 try{
  frame.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const rect=visibleConfigurator(frame),target=await cropTarget.fromElement(frame);check();
  cropAttempted=true;
  try{await track.cropTo(target)}catch{throw new CaptureError('isolate','The browser couldn’t capture just this configurator.')}
  // Attach a NEW video only AFTER cropTo resolves: it never receives whole-page frames. Each frame
  // must still show the whole, uncovered configurator, at its ratio now (it may have settled since).
  // A frame is used only once the view has not moved since the previous one (settled).
  let ratio=rect.width/rect.height,last=rect;
  return await videoSnapshot(stream,()=>{check();const now=visibleConfigurator(frame),moved=(['left','top','width','height'] as const).some(k=>Math.abs(now[k]-last[k])>1);last=now;ratio=now.width/now.height;return !moved},()=>ratio);
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
 return videoSnapshot(stream,()=>{if(!track||track.readyState!=='live')throw new CaptureError('shared','Tab sharing ended before the picture was taken.');});
}
