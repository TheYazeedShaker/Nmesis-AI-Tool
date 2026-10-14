import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/integration/nmesis-capture.js',import.meta.url),'utf8');
function fixture(){
 class Element{getClientRects(){return [{}]}getBoundingClientRect(){return {width:1000,height:600}}}
 class HTMLImageElement extends Element{}
 const image=new HTMLImageElement();Object.assign(image,{currentSrc:'https://assets.example/frame-42.png',complete:true,naturalWidth:2000});
 const messages=[],fetched=[];let receive;const parent={postMessage:(data,origin)=>messages.push({data,origin})};
 const window={parent,addEventListener:(type,handler)=>{receive=handler}};
 const document={currentScript:{dataset:{studioOrigin:'https://studio.example'}},querySelector:s=>s==='#car-img'?image:null,querySelectorAll:()=>[image]};
 class FileReader{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:image/png;base64,'+Buffer.from(b).toString('base64');this.onload()})}}
 vm.runInNewContext(source,{window,document,Element,HTMLImageElement,URL,AbortSignal,FileReader,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),fetch:async url=>{fetched.push(url);return {ok:true,blob:async()=>new Blob([url],{type:'image/png'})}}});
 return {window,image,messages,fetched,receive,parent};
}
test('connector extracts the current original frame and rejects unauthorized callers',async()=>{
 const f=fixture();const event={source:f.parent,origin:'https://studio.example',data:{type:'nmesis:capture',requestId:'req-1'}};
 await f.receive({...event,origin:'https://untrusted.example'});assert.equal(f.fetched.length,0);
 await f.receive({...event,source:{}});assert.equal(f.fetched.length,0);
 await f.receive(event);assert.equal(f.fetched[0],'https://assets.example/frame-42.png');assert.equal(f.messages[0].origin,'https://studio.example');assert.equal(f.messages[0].data.requestId,'req-1');
 f.image.currentSrc='https://assets.example/frame-43.png';await f.receive({...event,data:{...event.data,requestId:'req-2'}});assert.equal(f.fetched[1],f.image.currentSrc);assert.notEqual(f.messages[0].data.image,f.messages[1].data.image);
});
test('panorama capture renders the current camera rather than downloading the sphere',async()=>{
 const f=fixture();let args;f.window.pannellumViewer={isLoaded:()=>true,getContainer:()=>f.image,getPitch:()=>30,getYaw:()=>90,getHfov:()=>60,getRenderer:()=>({render:(...values)=>{args=values;return 'data:image/png;base64,AA=='}})};
 await f.receive({source:f.parent,origin:'https://studio.example',data:{type:'nmesis:capture',requestId:'pano'}});
 assert.equal(f.fetched.length,0);assert.equal(args[0],Math.PI/6);assert.equal(args[1],Math.PI/2);assert.equal(args[2],Math.PI/3);assert.equal(args[3].returnImage,true);assert.equal(f.messages[0].data.image,'data:image/png;base64,AA==');
});
