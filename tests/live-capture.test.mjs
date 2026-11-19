import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotStream,captureSharedTab,CaptureError,logCaptureFailure} from '../lib/live-capture.ts';
async function harness(options,run){
 const keys=['document','window','location','requestAnimationFrame','CropTarget'],saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let video,frames=0,cropped=false,restored;const calls=[],draws=[];const rect={left:100,top:100,width:600,height:400};
 const frame={isConnected:true,scrollIntoView(){calls.push('scroll')},getBoundingClientRect:()=>rect};
 const track={readyState:'live',stop(){calls.push('stop');this.readyState='ended'},getCaptureHandle:()=>({handle:'mine',origin:'https://studio.test'}),cropTo:async target=>{if(target===null){calls.push('uncrop');assert(!video?.srcObject);if(options.rejectCleanup)throw new Error('cleanup rejected');if(options.hangCleanup)return new Promise(()=>{});await Promise.resolve();cropped=false;return}calls.push('cropTo');assert.equal(target,'native-target');if(options.rejectCrop)throw new Error('unsupported');await Promise.resolve();cropped=true}},stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
 if(options.unsupported)delete track.cropTo;
 globalThis.CropTarget={fromElement:async el=>{assert.equal(el,frame);calls.push('target');return 'native-target'}};
 globalThis.location={origin:'https://studio.test'};globalThis.window={innerWidth:1000,innerHeight:800,scrollX:0,scrollY:80,scrollTo:v=>{assert(!cropped||track.readyState==='ended','release region before restoring scroll');restored=v}};globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
 globalThis.document={elementFromPoint:()=>options.covered?{}:frame,createElement:tag=>{
  if(tag==='video'){calls.push('video');assert(cropped||options.manual);return video={videoWidth:2400,videoHeight:1600,play:async()=>{},pause(){this.paused=true},requestVideoFrameCallback:fn=>setTimeout(()=>{frames++;video.videoWidth=frames<=(options.staleFrames||0)?4000:2400;if(options.onFrame)options.onFrame({rect,track,frame});if(options.follow){video.videoWidth=rect.width*4;video.videoHeight=rect.height*4}fn()},5),cancelVideoFrameCallback:clearTimeout}}
  assert.equal(tag,'canvas');return{getContext:()=>({drawImage:(...args)=>draws.push(args.slice(1))}),toDataURL:()=>`data:image/png;base64,frame${frames}`};
 }};
 try{await run({frame,rect,track,stream,calls,draws,video:()=>video,restored:()=>restored})}finally{for(const k of keys){if(saved[k])Object.defineProperty(globalThis,k,saved[k]);else delete globalThis[k]}}
}
test('native crop completes before a fresh video is attached; iframe is never resized',()=>harness({},async h=>{
 assert.equal(await snapshotStream(h.stream,h.frame,'mine'),'data:image/png;base64,frame1');assert.deepEqual(h.calls,['scroll','target','cropTo','video','uncrop']);assert.deepEqual(h.draws,[[0,0]]);assert.deepEqual(h.rect,{left:100,top:100,width:600,height:400});assert.equal(h.video().srcObject,null);assert(h.video().paused);assert.deepEqual(h.restored(),{left:0,top:80,behavior:'instant'});assert.equal(h.track.readyState,'live');
}));
test('unavailable native crop fails rather than exporting a full-page fallback',()=>harness({unsupported:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/can’t capture just the configurator/);assert.deepEqual(h.calls,[]);assert.equal(h.draws.length,0)}));
test('rejected native crop never attaches or exports an uncropped video',()=>harness({rejectCrop:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/couldn’t capture just this configurator/);assert(!h.calls.includes('video'));assert.equal(h.draws.length,0)}));
test('wrong studio tab is rejected even on the manual capture route',()=>harness({},async h=>{h.track.getCaptureHandle=()=>({handle:'other',origin:'https://studio.test'});await assert.rejects(captureSharedTab(h.stream,h.frame,'mine'),/Share this tab/);assert.deepEqual(h.calls,[])}));
test('covered or clipped iframe is rejected before crop',async()=>{
 await harness({covered:true},async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/covering/);assert(!h.calls.includes('cropTo'))});
 await harness({},async h=>{h.rect.top=-10;await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/outside the window/);assert(!h.calls.includes('cropTo'))});
});
test('unexpected video aspect ratio is discarded until native-sized frames arrive',()=>harness({staleFrames:2},async h=>{assert.equal(await snapshotStream(h.stream,h.frame,'mine'),'data:image/png;base64,frame3');assert.equal(h.draws.length,1)}));
// fix/studio-editor-fixes: a tool page fills the window, so when the browser draws its "Sharing this tab"
// bar the configurator moves and resizes once. The capture follows the settled view instead of failing
// ("The browser could not capture this view"): the frame taken while it moved is skipped, the next is used.
test('a view that settles while sharing starts is followed, not failed: the moving frame is skipped',()=>{let once=false;return harness({follow:true,onFrame:({rect})=>{if(!once){once=true;rect.top-=20;rect.height-=40}}},async h=>{assert.equal(await snapshotStream(h.stream,h.frame,'mine'),'data:image/png;base64,frame2');assert.equal(h.draws.length,1);assert.equal(h.video().srcObject,null)})});
test('a view covered during the capture still fails, without returning an image',()=>{const o={onFrame:()=>{o.covered=true}};return harness(o,async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/covering/);assert.equal(h.draws.length,0);assert.equal(h.video().srcObject,null)})});
test('a separately selected configurator tab can be captured for manual review',()=>harness({manual:true},async h=>{h.track.getCaptureHandle=()=>null;assert.match(await captureSharedTab(h.stream,h.frame,'mine'),/^data:image/);assert(!h.calls.includes('cropTo'))}));
test('a reusable stream gets a fresh crop each time and releases both regions',()=>harness({},async h=>{await snapshotStream(h.stream,h.frame,'mine');await snapshotStream(h.stream,h.frame,'mine');assert.equal(h.calls.filter(c=>c==='cropTo').length,2);assert.equal(h.calls.filter(c=>c==='uncrop').length,2);assert.equal(h.track.readyState,'live')}));
test('capture failure still releases the active region before scrolling',()=>{const o={onFrame:()=>{o.covered=true}};return harness(o,async h=>{await assert.rejects(snapshotStream(h.stream,h.frame,'mine'),/covering/);assert.equal(h.calls.at(-1),'uncrop');assert.equal(h.track.readyState,'live')})});
test('every failure names its step, and the console line carries the step and reason, never an address',async()=>{
 await harness({rejectCrop:true},async h=>{const e=await snapshotStream(h.stream,h.frame,'mine').catch(x=>x);assert(e instanceof CaptureError);assert.equal(e.step,'isolate')});
 await harness({covered:true},async h=>{const e=await snapshotStream(h.stream,h.frame,'mine').catch(x=>x);assert.equal(e.step,'covered')});
 const seen=[],warn=console.warn;console.warn=(...a)=>seen.push(a);
 try{logCaptureFailure('Key visual',new CaptureError('covered','Something was covering the configurator.'));logCaptureFailure('Key visual',Object.assign(new Error('Permission denied by system'),{name:'NotAllowedError'}))}finally{console.warn=warn}
 assert.deepEqual(seen[0],['[capture] Key visual did not capture the view',{step:'covered',name:'CaptureError',reason:'Something was covering the configurator.'}]);
 assert.deepEqual(seen[1][1],{step:'browser',name:'NotAllowedError',reason:'Permission denied by system'});
 assert.doesNotMatch(JSON.stringify(seen),/https?:/);
});
test('rejected or stalled cleanup stops sharing without discarding the completed image',async()=>{for(const option of ['rejectCleanup','hangCleanup'])await harness({[option]:true},async h=>{assert.match(await snapshotStream(h.stream,h.frame,'mine'),/^data:image/);assert.equal(h.track.readyState,'ended');assert.deepEqual(h.calls.slice(-2),['uncrop','stop'])})});
test('Key visual: a failed capture says why, logs the step, and moves to the image address, a first-class way in (not a fold)',async()=>{
 const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('../app/key-visual/page.tsx',import.meta.url),'utf8');
 // The catch-all that hid every reason ("The browser could not capture this view...") is gone.
 assert.doesNotMatch(src,/could not capture this view/);
 assert.match(src,/logCaptureFailure\('Key visual',err\)/);
 assert.match(src,/err instanceof CaptureError\?err\.message:/);
 // The image's address: always shown, titled, focused after a failure, with its button the primary one then.
 assert.doesNotMatch(src,/<Fold name="kv-capture-url"/);
 assert.match(src,/<section className="ds-stack" aria-labelledby="kv-capture-url-title">/);
 assert.match(src,/if\(captureOpen&&captureFailed\)requestAnimationFrame\(\(\)=>imageUrlRef\.current\?\.focus\(\)\)/);
 assert.match(src,/kind=\{captureFailed\?'primary':undefined\}/);
});
