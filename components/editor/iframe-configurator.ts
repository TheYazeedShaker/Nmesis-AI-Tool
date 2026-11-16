'use client';
import {requestFrameCapture} from '@/lib/capture';
import type {Capture,ConfiguratorAdapter,ConfiguratorOptions} from './configurator';

// Today's configurator behind the adapter: the person chooses the colour, trim
// and view inside the configurator's own page (an iframe), and capture() asks
// that page for a picture through the existing capture handshake
// (lib/capture.ts). The configurator cannot list its options yet, so
// getOptions() returns empty lists and the set* functions refuse: the editor
// shows "Choose the colour, trim and view in the configurator" instead of its
// own controls (controlsInEditor is false). The remote-control adapter will
// implement the same interface; the editor does not change.

const NONE:ConfiguratorOptions={colours:[],trims:[],views:[],frames:0};
const IN_CONFIGURATOR='Choose this in the configurator.';

async function dataUrlToBlob(dataUrl:string){
 const [head,body]=dataUrl.split(',',2);
 const type=/^data:(image\/(?:png|jpeg|webp));base64$/.exec(head)?.[1];
 if(!type||!body)throw new Error('The configurator sent a picture the studio cannot read.');
 const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
 return new Blob([bytes],{type});
}

async function size(blob:Blob){
 if(typeof createImageBitmap!=='function')return {width:0,height:0};
 const bitmap=await createImageBitmap(blob);
 const out={width:bitmap.width,height:bitmap.height};
 bitmap.close();
 return out;
}

/** frame(): the configurator's iframe now (it can change when the car changes). url: the configurator's address, for its origin. */
export function iframeConfigurator(frame:()=>HTMLIFrameElement|null,url:()=>string):ConfiguratorAdapter{
 let disposed=false;
 const refuse=async()=>{throw new Error(IN_CONFIGURATOR)};
 return {
  controlsInEditor:false,
  getOptions:async()=>NONE,
  setColour:refuse,
  setTrim:refuse,
  setView:refuse,
  setFrame:refuse,
  async capture():Promise<Capture>{
   if(disposed)throw new Error('The configurator is closed.');
   const el=frame();
   if(!el)throw new Error('Open a configurator first.');
   // requestFrameCapture times out on its own (0.5 s for the probe, 15 s for the picture) and answers null then.
   const result=await requestFrameCapture(el,url());
   if(!result)throw new Error('This configurator did not send a picture. Use screen capture instead.');
   const blob=await dataUrlToBlob(result.image);
   const {width,height}=await size(blob);
   return {blob,width,height,state:{view:result.angle,colour:result.finish}};
  },
  dispose(){disposed=true},
 };
}
