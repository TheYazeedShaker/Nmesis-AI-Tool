// A crop is safe only when the shared tab identifies itself as this studio.
export function captureBounds(rect:{left:number;top:number;width:number;height:number},viewport:{width:number;height:number},image:{width:number;height:number}){
 if(rect.left<0||rect.top<0||rect.left+rect.width>viewport.width+2||rect.top+rect.height>viewport.height+2||rect.width<=0||rect.height<=0)throw new Error('Bring the entire configurator into view, then generate again.');
 const sx=image.width/viewport.width,sy=image.height/viewport.height;
 return {x:Math.round(rect.left*sx),y:Math.round(rect.top*sy),w:Math.round(rect.width*sx),h:Math.round(rect.height*sy)};
}
export async function snapshotStream(stream:MediaStream,frame:HTMLIFrameElement|null,handle:string){
 const track=stream.getVideoTracks()[0];if(!track||track.readyState!=='live')throw new Error('Tab sharing ended. Generate again to choose your configurator tab.');
 const identity=(track as MediaStreamTrack&{getCaptureHandle?:()=>{handle:string;origin:string}|null}).getCaptureHandle?.();
 const self=identity?.handle===handle&&identity?.origin===location.origin;
 if(!self)throw new Error('Choose “This Tab” (Nmesis Studio) in the sharing window so only the configurator is captured.');
 if(!frame)throw new Error('Open the live configurator first.');frame.scrollIntoView({block:'center',behavior:'instant'});
 await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
 const video=document.createElement('video');video.muted=true;video.srcObject=stream;
 try{await video.play();await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('The shared tab did not provide an image. Try sharing again.')),8000);const done=()=>{clearTimeout(timer);resolve()};if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(done);else setTimeout(done,250)});
 const latest=(track as MediaStreamTrack&{getCaptureHandle?:()=>{handle:string;origin:string}|null}).getCaptureHandle?.();if(latest?.handle!==handle||latest?.origin!==location.origin)throw new Error('The shared tab changed. Share this studio tab again.');
 const b=captureBounds(frame.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight},{width:video.videoWidth,height:video.videoHeight});
 const c=document.createElement('canvas');const scale=Math.min(1,2560/Math.max(b.w,b.h));c.width=Math.round(b.w*scale);c.height=Math.round(b.h*scale);c.getContext('2d')!.drawImage(video,b.x,b.y,b.w,b.h,0,0,c.width,c.height);return c.toDataURL('image/png');
 }finally{video.pause();video.srcObject=null;}
}
