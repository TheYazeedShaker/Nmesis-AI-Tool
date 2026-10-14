import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {encode,decode} from 'fast-png';
import jpeg from 'jpeg-js';
const png=encode({width:2,height:2,data:new Uint8Array(16).fill(255),channels:4});
async function harness(){
  const objects=new Map(),calls=[];let handler=async()=>{throw new Error('Unexpected request')};
  const store={async get(key){const item=objects.get(key);if(!item)return null;return {size:item.bytes.length,httpMetadata:item.metadata,arrayBuffer:async()=>item.bytes,json:async()=>JSON.parse(Buffer.from(item.bytes).toString())}},async head(key){return objects.has(key)?{}:null},async put(key,value,options={}){if(options.onlyIf&&objects.has(key))return null;objects.set(key,{bytes:typeof value==='string'?Buffer.from(value):value,metadata:options.httpMetadata});return {etag:'saved'}},async delete(key){objects.delete(key)}};
  const ctx={prefix:'users/owner/',BUCKET:store,KEY_ENCRYPTION_SECRET:'a'.repeat(64)};
  class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
  const scope=vm.createContext({Buffer,crypto,TextEncoder,TextDecoder,Uint8Array,DataView,AbortSignal,Response,Request,URL,console,fetch:async(...args)=>{assert.equal(args[1]?.redirect,'manual','Cloudflare requests must disable redirects with manual mode');calls.push(args);return handler(...args)}});
  const stub=new vm.SyntheticModule(['StudioError','bucket','context','fail','readJson','imageKey','validId','str'],function(){this.setExport('StudioError',StudioError);this.setExport('bucket',v=>v);this.setExport('context',async()=>ctx);this.setExport('fail',e=>Response.json({error:e.message},{status:e.status||500}));this.setExport('readJson',r=>r.json());this.setExport('imageKey',(p,id)=>p+'images/'+id);this.setExport('validId',v=>typeof v==='string'&&/^[a-z0-9-]{8,80}$/.test(v));this.setExport('str',(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'')},{context:scope});
  const modules=new Map();async function load(path){if(path==='lib/fast-png')return new vm.SyntheticModule(['decode','encode'],function(){this.setExport('decode',decode);this.setExport('encode',encode)},{context:scope});if(path==='lib/jpeg-js')return new vm.SyntheticModule(['default'],function(){this.setExport('default',jpeg)},{context:scope});if(path==='lib/studio-server')return stub;if(modules.has(path))return modules.get(path);const source=readFileSync(new URL('../'+path+'.ts',import.meta.url),'utf8');const m=new vm.SourceTextModule(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:scope});modules.set(path,m);await m.link(spec=>load(spec.startsWith('@/')?spec.slice(2):'lib/'+spec.replace('./','')));return m}
  const server=await load('lib/gemini-server');await server.evaluate();const route=await load('app/api/google/generate/route');await route.evaluate();
  const connection=await load('app/api/google/connection/route');await connection.evaluate();
  const analysisRoute=await load('app/api/google/analyze/route');await analysisRoute.evaluate();
  const models=['gemini-3-pro-image','gemini-nano-banana-2.1'];
  const modelResponse=url=>Response.json({name:'models/'+url.split('/').at(-1)});
  const key='synthetic-google-key-for-tests';handler=modelResponse;await server.namespace.saveGoogleKey(ctx,key);calls.length=0;
  for(const id of ['source-1234','mood-1234','parent-1234','extra-1234'])await store.put(ctx.prefix+'images/'+id,png,{httpMetadata:{contentType:'image/png'}});
  const input=(patch={})=>({id:crypto.randomUUID(),provider:'google',model:models[0],sourceId:'source-1234',moodId:'mood-1234',brief:'A premium automotive image at sunset.',size:'2048x1152',...patch});
  const post=d=>route.namespace.POST(new Request('https://studio.example/api/google/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}));
  const connect=(key,origin='https://studio.example')=>connection.namespace.POST(new Request('https://studio.example/api/google/connection',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({key})}));
  const inspect=d=>analysisRoute.namespace.POST(new Request('https://studio.example/api/google/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}));
  return {server:server.namespace,ctx,store,objects,calls,key,models,modelResponse,input,post,connect,inspect,setHandler:f=>handler=f};
}
test('connection accepts Google auth key punctuation, verifies it and never returns the secret',async()=>{
  const h=await harness(),key='AQ.synthetic-authorization_key-for-tests';
  const r=await h.connect(' '+key+' ');assert.equal(r.status,200);
  const status=await r.json();assert.equal(status.connected,true);assert(!JSON.stringify(status).includes(key));
  assert.equal(h.calls.length,2);assert(h.calls.every(([,options])=>options.headers['x-goog-api-key']===key));
  assert.equal(await h.server.googleKey(h.ctx),key);
  assert(!Buffer.from(h.objects.get(h.ctx.prefix+'credentials/google.json').bytes).toString().includes(key));
});
test('malformed keys and cross-origin saves are rejected before Google is contacted',async()=>{
  const h=await harness();
  for(const key of ['', 'short', 'a'.repeat(513), 'AQ.invalid key with spaces', 'AQ.invalid\r\nkey-for-tests', 'AQ.invalid\u0000key-for-tests'])assert.equal((await h.connect(key)).status,400);
  assert.equal((await h.connect('AQ.synthetic-authorization-key','https://other.example')).status,403);
  assert.equal(h.calls.length,0);assert.equal(await h.server.googleKey(h.ctx),h.key);
});
test('Google key is encrypted, account-bound and never exposed by status',async()=>{
  const h=await harness(),raw=Buffer.from(h.objects.get(h.ctx.prefix+'credentials/google.json').bytes).toString();assert(!raw.includes(h.key));assert.equal(await h.server.googleKey(h.ctx),h.key);
  const status=await h.server.googleStatus(h.ctx);assert.equal(status.connected,true);assert.equal(status.models.length,2);assert(!JSON.stringify(status).includes(h.key));
  await assert.rejects(()=>h.server.googleKey({...h.ctx,prefix:'users/other/'}),/Connect Google/);
  h.objects.set('users/other/credentials/google.json',h.objects.get(h.ctx.prefix+'credentials/google.json'));
  await assert.rejects(()=>h.server.googleKey({...h.ctx,prefix:'users/other/'}),/Reconnect/);
  h.setHandler(()=>new Response(null,{status:403}));await assert.rejects(()=>h.server.saveGoogleKey(h.ctx,'invalid-new-key'),/did not accept/);assert.equal(await h.server.googleKey(h.ctx),h.key);
});
test('both Nano Banana models receive ordered image references and requested resolution',async()=>{
  const h=await harness();for(const model of h.models){
    h.setHandler((url,o)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(o.headers['x-goog-api-key'],h.key);const body=JSON.parse(o.body);assert.equal(body.model,model);assert.equal(body.response_format.mime_type,'image/jpeg');assert.equal(body.response_format.image_size,'4K');assert.equal(body.response_format.aspect_ratio,'16:9');assert.equal(body.store,false);assert.equal(body.input.filter(p=>p.type==='image').length,4);assert(body.input[0].text.includes('Image 3 is the CURRENT SELECTED VERSION'));return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:Buffer.from(png).toString('base64')}]}]})});
    const d=h.input({model,size:'3840x2160',parentId:'parent-1234',refinement:'Change the light',refinementReferenceIds:['extra-1234']});
    const response=await h.post(d);assert.equal(response.status,200);const {visual}=await response.json();assert.equal(visual.provider,'google');assert.equal(visual.model,model);assert.equal(visual.status,'ready');assert.equal(visual.width,2);assert(h.objects.has(h.ctx.prefix+'images/'+d.id));
    const count=h.calls.length;assert.equal((await h.post(d)).status,409);assert.equal(h.calls.length,count);
  }
});
test('foreign references and invalid model settings fail before a paid request',async()=>{
  const h=await harness();for(const patch of [{sourceId:'foreign-1234'},{model:'other-provider'},{size:'8000x8000'},{lineup:{}},{refinementReferenceIds:['extra-1234']}])assert.equal((await h.post(h.input(patch))).ok,false);
  assert.equal(h.calls.length,0);
});
test('Google quota and timeout failures are saved and never retried automatically',async()=>{
  const h=await harness();for(const timeout of [false,true]){
    h.setHandler(()=>{if(timeout)throw new Error('transport failure');return new Response(null,{status:429})});
    const d=h.input(),before=h.calls.length,r=await h.post(d);assert.equal(r.status,timeout?504:429);assert.equal(h.calls.length,before+1);
    const saved=await (await h.store.get(h.ctx.prefix+'visuals/'+d.id+'.json')).json();assert.equal(saved.status,'failed');assert.match(saved.error,timeout?/may have been billed/:/billing/);assert(!h.objects.has(h.ctx.prefix+'images/'+d.id));
  }
});
test('empty and corrupt provider outputs are not saved as ready visuals',async()=>{
  const h=await harness();for(const output of [{steps:[]},{output_image:{data:Buffer.from('not an image').toString('base64')}}]){h.setHandler(()=>Response.json(output));const d=h.input();assert.equal((await h.post(d)).status,502);assert(!h.objects.has(h.ctx.prefix+'images/'+d.id));}
});

test('Google redirects are not followed and cannot replace a saved key',async()=>{
  const h=await harness();h.setHandler(()=>new Response(null,{status:302,headers:{location:'https://other.example'}}));
  assert.equal((await h.connect('AQ.synthetic-authorization-key')).status,502);assert.equal(await h.server.googleKey(h.ctx),h.key);
});

test('Google request errors explain rejected settings without exposing credentials',async()=>{
  const h=await harness();h.setHandler(()=>Response.json({error:{status:'INVALID_ARGUMENT',message:"The value 'image/png' is not supported for 'response_format.mime_type'. Supported values: 'image/jpeg'. "+h.key}},{status:400}));
  const d=h.input(),r=await h.post(d);assert.equal(r.status,400);const body=await r.json();assert.match(body.error,/image\/jpeg/);assert(!body.error.includes(h.key));
  const saved=await (await h.store.get(h.ctx.prefix+'visuals/'+d.id+'.json')).json();assert.equal(saved.status,'failed');assert.equal(saved.error,body.error);assert.equal(h.calls.length,1);
});

test('Nano Banana reference lock is applied server-side for both models and saved with the visual',async()=>{
  const h=await harness();
  for(const model of h.models){
    h.setHandler((url,options)=>{const body=JSON.parse(options.body),prompt=body.input[0].text;
      assert.match(prompt,/Image 3 is the CURRENT SELECTED VERSION/);assert.doesNotMatch(prompt,/Image 2 is the BASE PHOTOGRAPH/);
      assert.match(prompt,/preserve every previous edit/);assert.match(prompt,/Reference 1.*Image 4/);
      assert.doesNotMatch(prompt,/Preserve its car identity, exact camera angle|Hero treatment|STRICT INSPIRATION MATCH/);
      assert.equal(body.input.filter(p=>p.type==='image').length,4);
      return Response.json({output_image:{data:Buffer.from(png).toString('base64')}});
    });
    const d=h.input({model,referenceMode:'match-inspiration',parentId:'parent-1234',refinement:'Correct wheel details',refinementReferenceIds:['extra-1234']});
    const r=await h.post(d);assert.equal(r.status,200);const {visual}=await r.json();assert.equal(visual.referenceMode,'match-inspiration');assert.equal(visual.model,model);
    const saved=await(await h.store.get(h.ctx.prefix+'visuals/'+d.id+'.json')).json();assert.equal(saved.prompt,JSON.parse(h.calls.at(-1)[1].body).input[0].text);
  }
});

test('area rendering sends its supported aspect ratio without changing key visual defaults',async()=>{
 const h=await harness();h.setHandler((url,options)=>{const body=JSON.parse(options.body);assert.equal(body.response_format.aspect_ratio,'4:3');assert.equal(body.response_format.image_size,'2K');return Response.json({output_image:{data:Buffer.from(png).toString('base64')}})});
 await h.server.renderGoogleImage(h.key,h.models[0],'2048x1152','local edit',[{bytes:png,type:'image/png'},{bytes:png,type:'image/png'}],'4:3');assert.equal(h.calls.length,1);
 await assert.rejects(()=>h.server.renderGoogleImage(h.key,h.models[0],'2048x1152','local edit',[{bytes:png,type:'image/png'},{bytes:png,type:'image/png'}],'invalid'),/Unsupported image shape/);assert.equal(h.calls.length,1);
});

test('reference lab binds inspected details to the signed-in owner and exact pair',async()=>{
 const h=await harness(),analysis={id:'analysis-1234',sourceId:'source-1234',moodId:'mood-1234',carDetails:['Slim lamps'],sceneDetails:['Concrete wall'],conflicts:['Camera differs'],captureAdvice:'Raise camera'};
 await h.store.put(h.ctx.prefix+'nano-inspections/analysis-1234.json',JSON.stringify(analysis));
 for(const patch of [{nanoStrategy:'unknown'},{nanoStrategy:'scene',analysisId:'foreign-1234'},{nanoStrategy:'identity',analysisId:'analysis-1234',moodId:'extra-1234'},{nanoStrategy:'baseline',parentId:'parent-1234'}])assert.equal((await h.post(h.input(patch))).status,400);
 assert.equal(h.calls.length,0);
 for(const nanoStrategy of ['baseline','identity','scene']){h.setHandler((url,options)=>{const b=JSON.parse(options.body);assert.equal(b.input.filter(p=>p.type==='image').length,2);if(nanoStrategy!=='baseline')assert.match(b.input[0].text,/Slim lamps/);return Response.json({output_image:{data:Buffer.from(png).toString('base64')}})});const r=await h.post(h.input({nanoStrategy,analysisId:'analysis-1234'}));assert.equal(r.status,200);assert.equal((await r.json()).visual.nanoStrategy,nanoStrategy)}
});


test('reference inspection sends both originals, stores validated facts and reuses the owner cache',async()=>{
 const h=await harness(),facts={carDetails:['Horizontal grille bars'],sceneDetails:['Concrete facade'],conflicts:['Higher camera in inspiration'],captureAdvice:'Raise the configurator camera'};
 assert.equal((await h.inspect({sourceId:'foreign-1234',moodId:'mood-1234'})).status,404);assert.equal(h.calls.length,0);
 h.setHandler((url,options)=>{const b=JSON.parse(options.body);assert.equal(b.model,'gemini-3.8-flash');assert.equal(b.store,false);assert.equal(b.input.filter(p=>p.type==='image').length,2);assert.equal(b.response_format.mime_type,'application/json');return Response.json({output_text:JSON.stringify(facts)})});
 const pair={sourceId:'source-1234',moodId:'mood-1234'},r=await h.inspect(pair);assert.equal(r.status,200);const first=await r.json();assert.equal(first.cached,false);assert.deepEqual(first.analysis.carDetails,facts.carDetails);
 const cached=await(await h.inspect(pair)).json();assert.equal(cached.cached,true);assert.equal(cached.analysis.id,first.analysis.id);assert.equal(h.calls.length,1);
 assert(h.objects.has(h.ctx.prefix+'nano-inspections/'+first.analysis.id+'.json'));
});
test('invalid inspection output does not create usable analysis or silently retry',async()=>{
 const h=await harness();h.setHandler(()=>Response.json({output_text:JSON.stringify({carDetails:[]})}));assert.equal((await h.inspect({sourceId:'source-1234',moodId:'mood-1234'})).status,502);assert.equal(h.calls.length,1);assert(![...h.objects.keys()].some(k=>k.includes('nano-inspections/')));
});

test('detail anchors are derived from the source and require valid detected regions before payment',async()=>{
 const h=await harness(),base={id:'analysis-5678',sourceId:'source-1234',moodId:'mood-1234',carDetails:['Wheel blades'],sceneDetails:['Concrete'],conflicts:['Camera mismatch'],captureAdvice:'Raise camera'};
 const save=async a=>h.store.put(h.ctx.prefix+'nano-inspections/analysis-5678.json',JSON.stringify(a));
 await save(base);assert.equal((await h.post(h.input({nanoStrategy:'detail',analysisId:base.id}))).status,400);
 await save({...base,detailRegions:[{label:'Wheel',x:.8,y:0,width:.5,height:.5}]});assert.equal((await h.post(h.input({nanoStrategy:'detail',analysisId:base.id}))).status,400);assert.equal(h.calls.length,0);
 await save({...base,detailRegions:[{label:'Wheel',x:0,y:0,width:.5,height:.5}]});h.setHandler((url,o)=>{const b=JSON.parse(o.body),images=b.input.filter(x=>x.type==='image');assert.equal(images.length,3);assert.equal(images[2].mime_type,'image/jpeg');const p=jpeg.decode(Buffer.from(images[2].data,'base64'));assert.equal(p.width,768);assert.equal(p.height,768);assert(p.data[0]>250);assert.match(b.input[0].text,/Image 3: Wheel/);return Response.json({output_image:{data:Buffer.from(png).toString('base64')}})});
 assert.equal((await h.post(h.input({nanoStrategy:'detail',analysisId:base.id}))).status,200);assert.equal(h.calls.length,1);
});
test('successive Nano Banana refinements keep the immediate parent bytes and lineage on both models',async()=>{
 for(const model of ['gemini-3-pro-image','gemini-nano-banana-2.1'])for(const referenceMode of ['creative','match-inspiration']){
  const h=await harness();const firstBytes=encode({width:2,height:2,data:new Uint8Array([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]),channels:4});
  h.setHandler(()=>Response.json({output_image:{data:Buffer.from(firstBytes).toString('base64')}}));
  const firstResponse=await h.post(h.input({model,referenceMode,parentId:'parent-1234',refinement:'Add a red cone'}));assert.equal(firstResponse.status,200);const first=(await firstResponse.json()).visual;
  h.setHandler((url,options)=>{const body=JSON.parse(options.body),images=body.input.filter(p=>p.type==='image');assert.equal(images[2].data,Buffer.from(firstBytes).toString('base64'));assert.match(body.input[0].text,/CURRENT SELECTED VERSION/);assert.match(body.input[0].text,/Change the cone to blue/);assert.doesNotMatch(body.input[0].text,/continuity only|BASE PHOTOGRAPH|Hero treatment/);return Response.json({output_image:{data:Buffer.from(png).toString('base64')}})});
  const r=await h.post(h.input({model,referenceMode,parentId:first.id,refinement:'Change the cone to blue'}));assert.equal(r.status,200);assert.equal((await r.json()).visual.parentId,first.id);
 }
});
