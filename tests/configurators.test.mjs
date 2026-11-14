import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfiguratorUrl,generationCount,CONFIGURATORS,carConfigurators} from '../lib/configurators.ts';
import {generationPrompt,localDirections} from '../lib/studio.ts';
import {captureResponse,requestFrameCapture} from '../lib/capture.ts';
test('one visual makes one job; three makes three; refinements always make one',()=>{
 for(const count of [1,3])assert.equal(Array.from({length:generationCount(count)}).length,count);
 assert.equal(generationCount(3,true),1);assert.throws(()=>generationCount(99));
});
test('accepts arbitrary HTTPS page URLs and rejects executable, credential and JSON links',()=>{
 assert.equal(normalizeConfiguratorUrl(' https://custom.example/model/?trim=2 '),'https://custom.example/model/?trim=2');
 for(const url of ['javascript:alert(1)','http://example.com/','https://user:password@example.com/','https://example.com/config.json'])assert.throws(()=>normalizeConfiguratorUrl(url));
 for(const c of CONFIGURATORS)assert.equal(normalizeConfiguratorUrl(c.url),c.url);
});
test('new vehicle identity replaces the original hard-coded model',()=>{
 const prompt=generationPrompt({vehicle:'Demo Coupe X',brief:'Desert dawn',angle:'Exterior front',finish:'Blue',scene:'Dunes',variant:0,hasMood:true});
 assert.ok(prompt.includes('Demo Coupe X'));assert.ok(!prompt.includes('DEMO-SUV'));
 assert.ok(!localDirections('Cool city','Exterior front')[2].query.includes('interior'));
});
test('capture responses cannot introduce external URLs or executable content',()=>{
 assert.equal(captureResponse({image:'https://outside.example/tracker'}),false);
 assert.equal(captureResponse({image:'data:image/svg+xml;base64,test'}),false);
 assert.equal(captureResponse({image:'data:image/png;base64,AA=='}),true);
});
test('capture messages require the expected origin, window and request id',async()=>{
 let handler,request;const source={postMessage(message,origin){request={message,origin}}};
 globalThis.window={addEventListener(name,fn){handler=fn},removeEventListener(){handler=null}};
 try{
  const promise=requestFrameCapture({contentWindow:source},'https://config.example/view');
  assert.equal(request.origin,'https://config.example');
  assert.equal(request.message.type,'nmesis:capture-probe');
  handler({source,origin:request.origin,data:{type:'nmesis:capture-ready'}});
  assert.equal(request.message.quality,'original');assert.equal(request.message.width,7680);
  const data={type:'nmesis:capture-result',requestId:request.message.requestId,image:'data:image/png;base64,AA=='};
  handler({source,origin:'https://wrong.example',data});assert.ok(handler);
  handler({source:{},origin:request.origin,data});assert.ok(handler);
  handler({source,origin:request.origin,data:{...data,requestId:'wrong'}});assert.ok(handler);
  handler({source,origin:request.origin,data});assert.deepEqual(await promise,data);assert.equal(handler,null);
 }finally{delete globalThis.window}
});

test('strict inspiration matching replaces creative camera rules and removes variant drift',()=>{
 const input={vehicle:'Demo Coupe X',brief:'Match the inspiration faithfully.',angle:'Exterior front',finish:'Blue',scene:'Different sunset',variant:0,hasMood:true,referenceMode:'match-inspiration'};
 const strict=generationPrompt(input),normal=generationPrompt({...input,referenceMode:'creative'});
 assert.match(strict,/Image 1 controls vehicle identity ONLY/);assert.match(strict,/Image 2 controls camera/);assert.match(strict,/barrel\/pincushion distortion/);assert.match(strict,/reorient the Image 1 vehicle/);assert.match(strict,/contact shadows/);assert.doesNotMatch(strict,/Preserve its car identity, exact camera angle|Hero treatment|Editorial treatment|Different sunset/);
 assert.equal(generationPrompt({...input,variant:2}),strict);assert.match(normal,/Preserve its car identity, exact camera angle/);
 assert.match(generationPrompt({...input,refinement:'Correct wheel details'}),/Image 3 is the CURRENT SELECTED VERSION/);assert.match(generationPrompt({...input,refinement:'Correct wheel details'}),/Correct wheel details/);
 assert.throws(()=>generationPrompt({...input,hasMood:false}),/inspiration image/);
});

test('added refinement reference numbers map to their actual inputs without replacing the base',()=>{
 const args={brief:'An SUV at sunset',angle:'Front',finish:'Black',scene:'Desert',variant:0,hasMood:true,refinement:'Use Reference 2 for the lights',refinementReferenceCount:2};
 for(const referenceMode of ['creative','match-inspiration']){
  const p=generationPrompt({...args,referenceMode});
  assert.match(p,/Image 3 is the CURRENT SELECTED VERSION/);
  assert.match(p,/Reference 1.*input Image 4/);assert.match(p,/Reference 2.*input Image 5/);
  assert.match(p,/Use Reference 2 for the lights/);assert.doesNotMatch(p,/The last input image is the previous/);
 }
});

test('Nano Banana lock replaces the generic preset only when enabled and keeps variants consistent',()=>{
 const input={provider:'google',vehicle:'Demo SUV S1',brief:'Match the reference',finish:'Teal',angle:'Front three-quarter',scene:'A different location',variant:0,hasMood:true,referenceMode:'match-inspiration'};
 const locked=generationPrompt(input);
 assert.match(locked,/NANO BANANA REFERENCE LOCK/);assert.match(locked,/lens distortion/);assert.match(locked,/white balance/);assert.match(locked,/no pasted outline, halo/);
 assert.doesNotMatch(locked,/A different location|Hero treatment|STRICT INSPIRATION MATCH/);
 assert.equal(generationPrompt({...input,variant:2}),locked);
 assert.doesNotMatch(generationPrompt({...input,referenceMode:'creative'}),/NANO BANANA REFERENCE LOCK/);
 assert.match(generationPrompt({...input,provider:undefined}),/STRICT INSPIRATION MATCH/);
 assert.throws(()=>generationPrompt({...input,hasMood:false}),/inspiration image/);
});
test('configurators come from the company’s cars (paths joined to the deployment origin) with an explicit capture template',()=>{
 assert.ok(CONFIGURATORS.length>=1);
 const car=(path,template='capture',extra={})=>({brandId:'demo',modelId:'suv',brandName:'Demo',modelName:'SUV',path,template,...extra});
 assert.deepEqual(carConfigurators([car('/demo/suv/','choose-view')],'https://configurator.example.com'),[{id:'demo.suv',name:'Demo SUV',url:'https://configurator.example.com/demo/suv/',template:'choose-view'}]);
 assert.deepEqual(carConfigurators([car('https://configurator.example.com/x/','anything')],undefined),[{id:'demo.suv',name:'Demo SUV',url:'https://configurator.example.com/x/',template:'capture'}]);
 // Unusable addresses are left out rather than shown.
 for(const path of ['','javascript:alert(1)','http://configurator.example.com/b/','/demo/suv/settings.json'])assert.deepEqual(carConfigurators([car(path)],'https://configurator.example.com'),[],path);
 assert.deepEqual(carConfigurators([car('/demo/suv/')],undefined),[],'a path with no origin is left out');
 assert.deepEqual(carConfigurators([car('/demo/suv/')],'http://configurator.example.com'),[],'never plain http');
});
