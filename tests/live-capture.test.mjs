import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotStream,captureSharedTab} from '../lib/live-capture.ts';
async function harness(options,run){
 const keys=['document','window','location','requestAnimationFrame','CropTarget'],saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let video,frames=0,cropped=false,restored;const calls=[],draws=[];const rect={left:100,top:100,width:600,height:400};
 const frame={isConnected:true,scrollIntoView(){calls.push('scroll')},getBoundingClientRect:()=>rect};
 const track={readyState:'live',stop(){calls.push('stop');this.readyState='ended'},getCaptureHandle:()=>({handle:'mine',origin:'https://studio.test'}),cropTo:async target=>{if(target===null){calls.push('uncrop');assert(!video?.srcObject);if(options.rejectCleanup)throw new Error('cleanup rejected');if(options.hangCleanup)return new Promise(()=>{});await Promise.resolve();cropped=false;return}calls.push('cropTo');assert.equal(target,'native-target');if(options.rejectCrop)throw new Error('unsupported');await Promise.resolve();cropped=true}},stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
 if(options.unsupported)delete track.cropTo;
 globalThis.CropTarget={fromElement:async el=>{assert.equal(el,frame);calls.push('target');return 'native-target'}};
 globalThis.location={origin:'https://studio.test'};globalThis.window={innerWidth:1000,innerHeight:800,scrollX:0,scrollY:80,scrollTo:v=>{assert(!cropped||track.readyState==='ended','release region before restoring scroll');restored=v}};globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
 globalThis.document={elementFromPoint:()=>options.covered?{}:frame,createElement:tag=>{
  if(tag==='video'){calls.push('video');assert(cropped||options.manual);return video={videoWidth:2400,videoHeight:1600,play:async()=>{},pause(){this.paused=true},requestVideoFrameCallback:fn=>setTimeout(()=>{frames++;video.videoWidth=frames<=(options.staleFrames||0)?4000:2400;if(options.onFrame)options.onFrame({rect,track,frame});fn()},5),cancelVideoFrameCallback:clearTimeout}}
  assert.equal(tag,'canvas');return{getContext:()=>({drawImage:(...args)=>draws.push(args.slice(1))}),toDataURL:()=>`data:image/png;base64,frame${frames}`};
 }};
 try{await run({frame,rect,track,stream,calls,draws,video:()=>video,restored:()=>restored})}finally{for(const k of keys){if(saved[k])Object.defineProperty(globalThis,k,saved[k]);else delete globalThis[k]}}
}
test('native crop completes before a fresh video is attached; iframe is never resized',()=>harness({},async h=>{
 assert.equal(await snapshotStream(h.stream,h.frame,'mine'),'data:image/png;base64,frame1');assert.deepEqual(h.calls,['scroll','target','cropTo','video','uncrop']);assert.deepEqual(h.draws,[[0,0]]);assert.deepEqual(h.rect,{left:100,top:100,width:600,height:400});assert.equal(h.video().srcObject,null);assert(h.video().paused);assert.deepEqual(h.restored(),{left:0,top:80,behavior:'instant'});assert.equal(h.track.readyState,'live');
}));
test('unavailable native crop fails rather than exporting a full-page fallback',()=>harness({unsupported:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/cannot isolate/);assert.deepEqual(h.calls,[]);assert.equal(h.draws.length,0)}));
test('rejected native crop never attaches or exports an uncropped video',()=>harness({rejectCrop:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/could not isolate/);assert(!h.calls.includes('video'));assert.equal(h.draws.length,0)}));
test('wrong studio tab is rejected even on the manual capture route',()=>harness({},async h=>{h.track.getCaptureHandle=()=>({handle:'other',origin:'https://studio.test'});await assert.rejects(captureSharedTab(h.stream,h.frame,'mine'),/This Tab/);assert.deepEqual(h.calls,[])}));
test('covered or clipped iframe is rejected before crop',async()=>{
 await harness({covered:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/covering/);assert(!h.calls.includes('cropTo'))});
 await harness({},async h=>{h.rect.top=-10;await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/entire configurator/);assert(!h.calls.includes('cropTo'))});
});
test('unexpected video aspect ratio is discarded until native-sized frames arrive',()=>harness({staleFrames:2},async h=>{assert.equal(await snapshotStream(h.stream,h.frame,'mine'),'data:image/png;base64,frame3');assert.equal(h.draws.length,1)}));
test('a moved iframe aborts capture without returning an image',()=>harness({onFrame:({rect})=>rect.left+=10},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/moved/);assert.equal(h.draws.length,0);assert.equal(h.video().srcObject,null)}));
test('a separately selected configurator tab can be captured for manual review',()=>harness({manual:true},async h=>{h.track.getCaptureHandle=()=>null;assert.match(await captureSharedTab(h.stream,h.frame,'mine'),/^data:image/);assert(!h.calls.includes('cropTo'))}));
test('a reusable stream gets a fresh crop each time and releases both regions',()=>harness({},async h=>{await snapshotStream(h.stream,h.frame,'mine');await snapshotStream(h.stream,h.frame,'mine');assert.equal(h.calls.filter(c=>c==='cropTo').length,2);assert.equal(h.calls.filter(c=>c==='uncrop').length,2);assert.equal(h.track.readyState,'live')}));
test('capture failure still releases the active region before scrolling',()=>harness({onFrame:({rect})=>rect.left+=10},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/moved/);assert.equal(h.calls.at(-1),'uncrop');assert.equal(h.track.readyState,'live')}));
test('rejected or stalled cleanup stops sharing without discarding the completed image',async()=>{for(const option of ['rejectCleanup','hangCleanup'])await harness({[option]:true},async h=>{assert.match(await snapshotStream(h.stream,h.frame,'mine'),/^data:image/);assert.equal(h.track.readyState,'ended');assert.deepEqual(h.calls.slice(-2),['uncrop','stop'])})});
