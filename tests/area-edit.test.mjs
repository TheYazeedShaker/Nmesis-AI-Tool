import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import jpeg from 'jpeg-js';
import {geminiImageModel} from '../lib/image-models.ts';
import {encode,decode} from 'fast-png';
import {imageDimensions} from '../lib/image-dimensions.ts';
const context=vm.createContext({Uint8Array,Math,Number,Error});
const stub=(values,ctx=context)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context:ctx});
const source=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const boundaryModule=new vm.SourceTextModule(source('../lib/boundary-blend.ts'),{context});await boundaryModule.link(()=>{});await boundaryModule.evaluate();
const seamModule=new vm.SourceTextModule(source('../lib/adaptive-seam.ts'),{context});await seamModule.link(()=>{});await seamModule.evaluate();
const textureModule=new vm.SourceTextModule(source('../lib/texture-fill.ts'),{context});await textureModule.link(()=>{});await textureModule.evaluate();
const areaModule=new vm.SourceTextModule(source('../lib/area-edit.ts'),{context});await areaModule.link(s=>s==='fast-png'?stub({encode,decode}):s==='./boundary-blend'?boundaryModule:s==='./adaptive-seam'?seamModule:stub({imageDimensions}));await areaModule.evaluate();const area=areaModule.namespace;
const layerModule=new vm.SourceTextModule(source('../lib/object-layer.ts'),{context});await layerModule.link(s=>s==='fast-png'?stub({encode,decode}):areaModule);await layerModule.evaluate();const layers=layerModule.namespace;
const googleModule=new vm.SourceTextModule(source('../lib/google-area-edit.ts'),{context});await googleModule.link(s=>s==='fast-png'?stub({encode}):s==='jpeg-js'?stub({default:jpeg}):s==='./area-edit'?areaModule:stub({imageDimensions}));await googleModule.evaluate();const googleArea=googleModule.namespace;
const png=(w,h,color)=>encode({width:w,height:h,data:new Uint8Array(Array.from({length:w*h},()=>color).flat()),channels:color.length,depth:8});
const original=png(32,16,[25,75,125,255]),candidate=png(32,16,[220,80,40,255]);
function mask(){const a=new Uint8Array(32*16);a[100]=255;a[101]=128;return a}
test('compositing changes only painted pixels, preserving every unselected channel exactly',()=>{
 const selection=mask(),result=decode(area.compositeArea(original,candidate,selection,{width:32,height:16})),src=decode(original);for(let p=0;p<selection.length;p++)for(let c=0;c<4;c++){if(!selection[p])assert.equal(result.data[p*4+c],src.data[p*4+c]);else assert.equal(result.data[p*4+c],Math.round(src.data[p*4+c]*(1-selection[p]/255)+decode(candidate).data[p*4+c]*selection[p]/255))}
 assert.throws(()=>area.compositeArea(original,png(16,16,[2,3,4,255]),selection,{width:32,height:16}),/frame size/);
});
test('mask polarity, fine selections, size validation and empty masks are correct',()=>{
 const selection=mask(),api=decode(area.providerMask(selection,32,16,{width:16,height:16}));assert.equal(api.data[(3*16+2)*4+3],0);assert.equal(api.data[3],255);
 assert.throws(()=>area.selectionMask(png(32,16,[0]),32,16),/Paint/);assert.throws(()=>area.selectionMask(png(16,16,[255]),32,16),/match/);assert.deepEqual({...area.areaSize(3840,2160)},{width:2048,height:1152});assert.throws(()=>area.areaSize(7680,4320),/4K/);
});
async function harness({googleFailure=false,googleConnected=true}={}){
 const objects=new Map(),calls=[];const store={get:async k=>objects.has(k)?{arrayBuffer:async()=>new Uint8Array(objects.get(k)).buffer,json:async()=>JSON.parse(new TextDecoder().decode(objects.get(k)))}:null,put:async(k,value,options={})=>{if(options.onlyIf&&objects.has(k))return null;objects.set(k,typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value));return{}}};
 const parent={id:'parent-1234',title:'Test car',src:'/api/assets/parent-1234',status:'ready',width:32,height:16,sourceId:'car-1234',provider:'higgsfield',referenceMode:'match-inspiration'};objects.set('owner/visuals/parent-1234.json',new TextEncoder().encode(JSON.stringify(parent)));objects.set('owner/images/parent-1234',original);
 class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const ctx=vm.createContext({Uint8Array,Buffer,Blob,File,FormData,Request,Response,URL,Date,crypto,AbortSignal,fetch:async(u,o)=>{calls.push([u,o]);const [width,height]=o.body.get('size').split('x').map(Number);assert.ok(width*height>=655360,'provider minimum pixel budget');const data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(o.body.get('background')!=='transparent'||(x>width*.45&&x<width*.55&&y>height*.45&&y<height*.55))data.set([220,80,40,255],(y*width+x)*4);const render=encode({width,height,data,channels:4});return Response.json({data:[{b64_json:Buffer.from(render).toString('base64')}]})}});
 const stubs={
 '@/lib/portable/uploads':{readStudioForm:r=>r.formData()},
 '@/lib/studio-server':{context:async()=>({prefix:'owner/',BUCKET:store}),bucket:x=>x,fail:e=>Response.json({error:e.message},{status:e.status||500}),imageKey:(p,id)=>p+'images/'+id,StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x),str:(x,max)=>typeof x==='string'?x.trim().slice(0,max):'',providerError:()=>new StudioError('Provider rejected',502)},
 '@/lib/gemini-server':{googleKey:async()=>{if(!googleConnected)throw new StudioError('Connect Google',503);return 'synthetic-google'},renderGoogleImage:async(key,model,size,prompt,images,aspectRatio)=>{calls.push(['google',{key,model,size,prompt,images,aspectRatio}]);if(googleFailure)throw new StudioError('Google timed out; check saved edits',504);const d=decode(images[0].bytes),data=new Uint8Array(d.width*d.height*4);for(let i=0;i<data.length;i+=4)data.set([220,80,40,255],i);return {bytes:jpeg.encode({width:d.width,height:d.height,data},95).data}}},'@/lib/image-models':{geminiImageModel},'@/lib/google-area-edit':Object.fromEntries(Object.entries(googleArea)),
 '@/lib/credentials':{apiKey:async()=> 'synthetic-test-key'},'@/lib/film-server':{database:()=>({prepare:()=>({bind:()=>({first:async()=>null})})})},'@/lib/image-server':{publicImage:x=>x},'@/lib/image-dimensions':{imageDimensions},'@/lib/area-edit':Object.fromEntries(Object.entries(area)),'@/lib/object-layer':Object.fromEntries(Object.entries(layers)),'@/lib/texture-fill':Object.fromEntries(Object.entries(textureModule.namespace)),'fast-png':{encode}
 };
 const route=new vm.SourceTextModule(source('../app/api/area-edits/route.ts'),{context:ctx});await route.link(s=>stub(stubs[s],ctx));await route.evaluate();
 async function submit({id='edit-123456',parentId=parent.id,origin='https://studio.test',selection=mask(),reference=true,edgeBlending,contentAware,intent,provider,model}={}){const form=new FormData();if(provider)form.set('provider',provider);if(model)form.set('model',model);form.set('id',id);if(edgeBlending!==undefined)form.set('edgeBlending',String(edgeBlending));if(contentAware!==undefined)form.set('contentAware',String(contentAware));if(intent!==undefined)form.set('intent',intent);form.set('parentId',parentId);form.set('instruction','Change this wheel to the reference');form.set('working',new Blob([original]),'working.png');form.set('selection',new Blob([encode({width:32,height:16,data:selection,channels:1})]),'selection.png');if(reference)form.set('reference',new Blob([candidate]),'reference.png');return route.namespace.POST(new Request('https://studio.test/api/area-edits',{method:'POST',headers:{origin},body:form}))}
 return{submit,calls,objects,parent};
}
test('area-edit route submits the base first, sends the mask and area-only reference, saves a separate composited result',async()=>{
 const h=await harness(),response=await h.submit();assert.equal(response.status,200,await response.clone().text());const {visual}=await response.json();assert.equal(visual.status,'ready');assert.equal(visual.areaEdit.parentId,h.parent.id);assert.equal(visual.provider,'openai');assert.equal(visual.areaEdit.edgeBlending,16);assert.equal(visual.referenceMode,'match-inspiration');assert.equal(h.calls.length,1);const payload=h.calls[0][1].body;assert.equal(payload.getAll('image[]').length,2);assert.equal(payload.getAll('image[]')[0].name,'visual.png');assert.equal(payload.get('mask').type,'image/png');assert.match(payload.get('prompt'),/ONLY the selected area/);assert.equal(h.objects.get('owner/images/parent-1234'),original);const result=decode(h.objects.get('owner/images/'+visual.id));assert.equal(result.data[0],25);assert.equal(result.data[400],220);assert.equal((await h.submit()).status,409);assert.equal(h.calls.length,1);assert.equal(JSON.parse(new TextDecoder().decode(h.objects.get('owner/visuals/'+visual.id+'.json'))).status,'ready');
});
test('empty selection, foreign owner and foreign origin fail before any paid call',async()=>{const h=await harness();for(const opts of [{selection:new Uint8Array(512)},{parentId:'foreign-1234'},{origin:'https://evil.test'}])assert.ok((await h.submit(opts)).status>=400);assert.equal(h.calls.length,0);assert.equal(h.objects.size,2)});

test('4K frame keeps original dimensions and all pixels outside a small painted patch',()=>{
 const width=3840,height=2160,src=new Uint8Array(width*height*3).fill(75),selection=new Uint8Array(width*height);for(let y=100;y<120;y++)for(let x=100;x<140;x++)selection[y*width+x]=255;
 const base=encode({width,height,data:src,channels:3}),work={width:2048,height:1152},render=encode({...work,data:new Uint8Array(work.width*work.height*3).fill(180),channels:3});const result=decode(area.compositeArea(base,render,selection,work));assert.equal(result.width,width);assert.equal(result.height,height);for(let p=0;p<selection.length;p++)assert.equal(result.data[p*3],selection[p]?180:75);
});


test('natural feathering removes the hard seam without a halo or loss of the fully edited center',()=>{
 const width=1024,height=128,selection=new Uint8Array(width*height);for(let y=20;y<108;y++)for(let x=100;x<400;x++)selection[y*width+x]=255;
 const matte=area.featherSelection(selection,width,height,16),soft=area.featherSelection(selection,width,height,32),at=(x,y=64)=>y*width+x;
 assert.equal(matte[at(99)],0);assert.ok(matte[at(100)]<10);for(let x=100;x<109;x++)assert.ok(matte[at(x)]<=matte[at(x+1)]);assert.equal(matte[at(120)],255);assert.ok(soft[at(106)]<matte[at(106)]);for(let i=0;i<selection.length;i++)if(!selection[i])assert.equal(matte[i],0);
 const base=encode({width,height,data:new Uint8Array(width*height*3).fill(20),channels:3}),candidate=encode({width,height,data:new Uint8Array(width*height*3).fill(220),channels:3});const result=decode(area.compositeArea(base,candidate,matte,{width,height}));assert.equal(result.data[at(99)*3],20);assert.ok(result.data[at(100)*3]<30);assert.equal(result.data[at(120)*3],220);
 assert.equal(area.featherSelection(selection,width,height,0),selection);
});
test('feathering respects erased holes, frame borders and small disconnected selections',()=>{
 const width=256,height=128,s=new Uint8Array(width*height);for(let y=0;y<80;y++)for(let x=0;x<120;x++)s[y*width+x]=255;for(let y=25;y<45;y++)for(let x=25;x<45;x++)s[y*width+x]=0;s[100*width+220]=255;
 const m=area.featherSelection(s,width,height,16);assert.equal(m[0],255);assert.equal(m[30*width+30],0);assert.ok(m[30*width+24]<255);assert.equal(m[100*width+219],0);assert.ok(m[100*width+220]>0);assert.throws(()=>area.edgeBlend(500),/supported/);
});
test('invalid blend settings are rejected before submitting an edit',async()=>{const h=await harness();assert.equal((await h.submit({edgeBlending:1000})).status,400);assert.equal(h.calls.length,0)});

test('content-aware repair completely replaces the object and blends only in its outer cleanup margin',()=>{
 const width=256,height=128,selection=new Uint8Array(width*height);for(let y=40;y<80;y++)for(let x=80;x<120;x++)selection[y*width+x]=255;selection[60*width+79]=32;
 const matte=area.contentAwareMatte(selection,width,height,16);
 for(let i=0;i<selection.length;i++)if(selection[i])assert.equal(matte[i],255,'no original object may bleed through the core');
 assert.ok(matte[60*width+78]>0&&matte[60*width+78]<255);assert.equal(matte[60*width+60],0);
 const result=decode(area.compositeArea(png(width,height,[20,30,40,255]),png(width,height,[180,190,200,255]),matte,{width,height}));
 assert.equal(result.data[(60*width+79)*4],180);assert.equal(result.data[(60*width+60)*4],20);
 assert.equal(area.contentAwareMatte(new Uint8Array(width*height),width,height,16).some(Boolean),false);
});
test('focused context crop maps edits back to the right pixels and preserves all distant detail',()=>{
 const width=1024,height=768,selection=new Uint8Array(width*height);for(let y=40;y<80;y++)for(let x=800;x<840;x++)selection[y*width+x]=255;
 const matte=area.contentAwareMatte(selection,width,height,16),region=area.contextRegion(matte,width,height),work=area.areaSize(region.width,region.height);
 assert.ok(region.width<width);assert.ok(region.height<height);assert.ok(region.x>0);assert.equal(region.y,0);
 const data=new Uint8Array(width*height*3);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;data[i]=x%256;data[i+1]=y%256;data[i+2]=75}
 const base=encode({width,height,data,channels:3}),crop=decode(area.cropWorkingImage(base,region,work));assert.equal(crop.data[0],region.x%256);assert.equal(crop.data[1],region.y%256);
 const selected=area.cropSelection(matte,width,region);assert.equal(selected[(60-region.y)*region.width+820-region.x],255);
 const api=decode(area.providerMask(selected,region.width,region.height,work));assert.equal(api.data[((60-region.y)*work.width+820-region.x)*4+3],0);
 const result=decode(area.compositeArea(base,png(work.width,work.height,[220,30,40]),matte,work,region));for(let p=0;p<matte.length;p++)if(!matte[p])for(let c=0;c<3;c++)assert.equal(result.data[p*3+c],data[p*3+c]);assert.equal(result.data[(60*width+820)*3],220);
});
test('repair modes request background structure and reject unknown operations',()=>{
 assert.match(area.areaPrompt('Remove sign',false,'remove',true),/REMOVE AND FILL/);assert.match(area.areaPrompt('Remove sign',false,'remove',true),/masonry joints/);assert.match(area.areaPrompt('Add sign',true,'insert',true),/contact shadows/);assert.match(area.areaPrompt('Fix wall',false,'repair',true),/REPAIR:/);assert.throws(()=>area.areaIntent('invalid'),/supported/);
});

test('content-aware route sends the expanded mask and explicit removal instructions in one paid edit',async()=>{const h=await harness(),r=await h.submit({contentAware:true,intent:'remove'});assert.equal(r.status,200,await r.clone().text());const {visual}=await r.json();assert.equal(visual.areaEdit.contentAware,true);assert.equal(visual.areaEdit.intent,'remove');assert.ok(visual.areaEdit.region);assert.equal(h.calls.length,1);assert.match(h.calls[0][1].body.get('prompt'),/CONTENT-AWARE RECONSTRUCTION/);assert.match(h.calls[0][1].body.get('prompt'),/REMOVE AND FILL/);const result=decode(h.objects.get('owner/images/'+visual.id));assert.equal(result.width,32);assert.equal(result.height,16);});
test('invalid reconstruction controls fail before any paid request',async()=>{for(const options of [{contentAware:'maybe'},{intent:'unknown'}]){const h=await harness();assert.equal((await h.submit(options)).status,400);assert.equal(h.calls.length,0)}});

test('small content-aware crops meet the provider minimum and scaled masks stay solid',()=>{
 const work=area.areaRenderSize(512,512);assert.deepEqual({...work},{width:1024,height:1024});
 for(const [w,h] of [[512,512],[528,800],[1536,512],[512,1536],[2048,1152]]){const size=area.areaRenderSize(w,h);assert.ok(size.width*size.height>=655360);assert.ok(size.width<=2048&&size.height<=2048);assert.equal(size.width%16,0);assert.equal(size.height%16,0)}
 const selection=new Uint8Array(512*512);for(let y=200;y<240;y++)for(let x=200;x<260;x++)selection[y*512+x]=255;
 const mask=decode(area.providerMask(selection,512,512,work));
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)assert.equal(mask.data[(y*1024+x)*4+3],x>=400&&x<520&&y>=400&&y<480?0:255,'upscaled mask must not contain uneditable holes');
});

test('boundary matching removes a brush-shaped sky tint without restoring a removed object',()=>{
 const width=256,height=192,region={x:0,y:0,width,height},original=new Uint8Array(width*height*3),candidate=new Uint8Array(original.length),selection=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,sky=[100+x/8,130+y/8,160];
  for(let c=0;c<3;c++){original[i*3+c]=Math.round(sky[c]);candidate[i*3+c]=Math.round(sky[c]+[25,-18,12][c])}
  if((x-128)**2+(y-96)**2<55**2)selection[i]=255;
  if(x>110&&x<145&&y>80&&y<110)original.fill(10,i*3,i*3+3); // object to remove
 }
 const matte=area.contentAwareMatte(selection,width,height,16),base=encode({width,height,data:original,channels:3}),render=encode({width,height,data:candidate,channels:3});
 const result=decode(area.compositeArea(base,render,matte,{width,height},region,true));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;for(let c=0;c<3;c++){if(!matte[i])assert.equal(result.data[i*3+c],original[i*3+c]);else assert.ok(Math.abs(result.data[i*3+c]-Math.round([100+x/8,130+y/8,160][c]))<=2,'sky must continue through brush and removed object')}}
});
test('boundary matching retains a newly generated object and its sharp detail',()=>{
 const width=128,height=128,original=new Uint8Array(width*height*3).fill(120),render=new Uint8Array(original.length).fill(150),mask=new Uint8Array(width*height);
 for(let y=32;y<96;y++)for(let x=32;x<96;x++){mask[y*width+x]=255;if(x>=56&&x<72&&y>=56&&y<72)render.fill(60,(y*width+x)*3,(y*width+x)*3+3)}
 const matte=area.contentAwareMatte(mask,width,height,16),result=decode(area.compositeArea(encode({width,height,data:original,channels:3}),encode({width,height,data:render,channels:3}),matte,{width,height},undefined,true));
 assert.equal(result.data[(64*width+64)*3],30,'generated object detail is retained');assert.equal(result.data[(40*width+40)*3],120,'background is matched');assert.equal(result.data[0],120);
});


test('transparent additions preserve textured background even inside the painted area',()=>{
 const width=64,height=64,source=new Uint8Array(width*height*4),layer=new Uint8Array(source.length),allowed=new Uint8Array(width*height).fill(255);
 for(let p=0;p<width*height;p++){source.set([p%251,(p*7)%255,(p*13)%255,255],p*4);if(p%width>=30&&p%width<34&&p/width>=30&&p/width<34)layer.set([230,90,20,p%2?128:255],p*4)}
 const original=encode({width,height,data:source,channels:4}),overlay=encode({width,height,data:layer,channels:4}),result=decode(layers.compositeObjectLayer(original,overlay,allowed,{width,height},{x:0,y:0,width,height}));
 for(let p=0;p<width*height;p++)for(let c=0;c<3;c++){const a=layer[p*4+3]/255;assert.equal(result.data[p*4+c],Math.round(layer[p*4+c]*a+source[p*4+c]*(1-a)))}
});
test('object layers reject empty, opaque and out-of-selection results instead of saving a cut-off patch',()=>{
 const w=32,h=32,r={x:0,y:0,width:w,height:h},base=png(w,h,[100,120,140]),allowed=new Uint8Array(w*h).fill(255);
 assert.throws(()=>layers.compositeObjectLayer(base,png(w,h,[20,30,40,0]),allowed,r,r),/empty/);
 assert.throws(()=>layers.compositeObjectLayer(base,png(w,h,[20,30,40,255]),allowed,r,r),/opaque/);
 assert.throws(()=>layers.compositeObjectLayer(base,png(w,h,[20,30,40]),allowed,r,r),/transparent/);
 const data=new Uint8Array(w*h*4);for(let p=0;p<16;p++)data.set([20,30,40,255],p*4);
 allowed.fill(0);allowed[w*16+16]=255;assert.throws(()=>layers.compositeObjectLayer(base,encode({width:w,height:h,data,channels:4}),allowed,r,r),/fit/);
});
test('premultiplied resampling keeps transparent RGB from creating a dark fringe',()=>{
 const w=8,h=8,data=new Uint8Array(w*h*4);for(let y=2;y<6;y++)for(let x=2;x<6;x++)data.set([255,255,255,255],(y*w+x)*4);
 const result=decode(layers.compositeObjectLayer(png(16,16,[255,255,255,255]),encode({width:w,height:h,data,channels:4}),new Uint8Array(256).fill(255),{width:w,height:h},{x:0,y:0,width:16,height:16}));assert.ok(result.data.every(v=>v===255));
});
test('add route requests transparency without a preservation mask, and keeps the source',async()=>{
 const h=await harness(),selection=new Uint8Array(512);for(let y=4;y<12;y++)for(let x=8;x<24;x++)selection[y*32+x]=255;
 const response=await h.submit({intent:'add',selection});assert.equal(response.status,200,await response.clone().text());const {visual}=await response.json();assert.equal(visual.areaEdit.method,'object-layer');const body=h.calls[0][1].body;assert.equal(body.get('background'),'transparent');assert.equal(body.get('mask'),null);assert.match(body.get('prompt'),/TRANSPARENT RGBA OVERLAY/);assert.equal(h.objects.get('owner/images/parent-1234'),original);
 const result=decode(h.objects.get('owner/images/'+visual.id)),base=decode(original);assert.equal(result.data[(5*32+9)*4],base.data[(5*32+9)*4],'background inside painted area is unchanged');
});
test('adaptive seam follows matching texture within its envelope while fully replacing the core',()=>{
 const width=96,height=96,data=new Uint8Array(width*height*3).fill(100),generated=new Uint8Array(data.length),core=new Uint8Array(width*height),allowed=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*width+x,r=Math.max(Math.abs(x-48),Math.abs(y-48));if(r<8)core[p]=255;if(r<35)allowed[p]=255;generated.fill(r>=21&&r<=24?100:180,p*3,p*3+3)}
 const result=seamModule.namespace.adaptiveSeam({width,height,channels:3,data},{width,height,channels:3,data:generated},core,allowed,{x:0,y:0,width,height});
 for(let i=0;i<core.length;i++){if(core[i])assert.equal(result[i],255);if(!allowed[i])assert.equal(result[i],0)}
 assert.equal(result[48*width+65],255,'join moves beyond the brush core');assert.equal(result[48*width+76],0,'join returns to original before the envelope edge');
});


test('misplaced transparent objects are fitted whole rather than clipped at a circle',()=>{
 const width=64,height=64,data=new Uint8Array(width*height*4),allowed=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(y>=4&&y<16&&x>=4&&x<32)data.set([250,50,10,255],(y*width+x)*4);if((x-42)**2+(y-42)**2<12**2)allowed[y*width+x]=255}
 const result=decode(layers.compositeObjectLayer(png(width,height,[100,120,140]),encode({width,height,data,channels:4}),allowed,{width,height},{x:0,y:0,width,height}));let changed=0;
 for(let p=0;p<allowed.length;p++){if(!allowed[p])assert.equal(result.data[p*3],100);else if(result.data[p*3]!==100)changed++}assert.ok(changed>50);assert.ok(changed<300);assert.equal(result.data[(42*width+42)*3],250);
});
test('automatic mode routes add and remove prompts, respecting explicit choices',()=>{
 assert.equal(area.resolveAreaIntent('edit','Please add a bird'),'add');assert.equal(area.resolveAreaIntent('edit','Remove the sign'),'remove');assert.equal(area.resolveAreaIntent('edit','Replace the wheel'),'insert');assert.equal(area.resolveAreaIntent('insert','Add a new wheel'),'insert');assert.equal(area.resolveAreaIntent('edit','Make the door red'),'edit');
});


test('texture fill reconstructs repeating background instead of smearing the object',()=>{
 const width=512,height=384,core=new Uint8Array(width*height),allowed=new Uint8Array(width*height),data=new Uint8Array(width*height*3),model=new Uint8Array(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*width+x,texture=100+Math.round(8*Math.sin(x*Math.PI/16)+6*Math.sin(y*Math.PI/20));data.fill(texture,p*3,p*3+3);model.fill(110,p*3,p*3+3);if(x>240&&x<272&&y>170&&y<202){core[p]=255;data.fill(0,p*3,p*3+3)}if(x>220&&x<292&&y>150&&y<222)allowed[p]=255}
 const result=textureModule.namespace.textureFill({width,height,channels:3,data},{width,height,channels:3,data:model},core,allowed);assert.ok(result);assert.ok(result.score<15);assert.ok(result.data[(185*width+255)*3]>80);assert.ok(new Set(result.data).size>15,'real texture is retained');
});
test('fine texture boundary matching converges to original pixels at the inner edge',()=>{
 const width=512,height=384,original=new Uint8Array(width*height*3),render=new Uint8Array(original.length),matte=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*width+x;original.fill(120+Math.round(20*Math.sin(y/3)),p*3,p*3+3);render.fill(150,p*3,p*3+3);if(x>=200&&x<300&&y>=140&&y<240)matte[p]=255}
 const r=decode(area.compositeArea(encode({width,height,data:original,channels:3}),encode({width,height,data:render,channels:3}),matte,{width,height},undefined,true));for(let y=140;y<240;y++)for(const x of[200,299])assert.ok(Math.abs(r.data[(y*width+x)*3]-original[(y*width+x)*3])<=1);
});

test('Nano Banana area edits route both models through Google and preserve protected pixels',async()=>{
 for(const model of ['gemini-3-pro-image','gemini-nano-banana-2.1'])for(const intent of ['edit','add','remove']){
  const h=await harness(),r=await h.submit({provider:'google',model,intent,edgeBlending:0,contentAware:false});assert.equal(r.status,200,await r.clone().text());
  const {visual}=await r.json();assert.equal(visual.provider,'google');assert.equal(visual.model,model);assert.notEqual(visual.areaEdit.method,'object-layer');assert.equal(h.calls.length,1);
  const [url,payload]=h.calls[0];assert.equal(url,'google');assert.equal(payload.images.length,3);assert.match(payload.prompt,/Image 2 is a black-and-white selection guide/);assert.match(payload.prompt,/Image 3 is a reference for ONLY/);assert.doesNotMatch(payload.prompt,/transparent part/);assert.equal(payload.size,'2048x1152');
  const guide=decode(payload.images[1].bytes);assert.equal(guide.channels,1);assert.equal(guide.data[0],0);assert(guide.data.some(v=>v===255));
  const result=decode(h.objects.get('owner/images/'+visual.id)),src=decode(original),allowed=intent==='add'?area.contentAwareMatte(mask(),32,16,0):mask();
  assert.equal(result.width,32);assert.equal(result.height,16);for(let i=0;i<allowed.length;i++)if(!allowed[i])for(let c=0;c<4;c++)assert.equal(result.data[i*4+c],src.data[i*4+c]);
  assert.equal((await h.submit({provider:'google',model})).status,409);assert.equal(h.calls.length,1);
 }
});
test('Google area errors are recoverable without fallback billing and invalid choices never submit',async()=>{
 const model='gemini-3-pro-image';
 const h=await harness({googleFailure:true}),r=await h.submit({provider:'google',model});assert.equal(r.status,504);assert.equal(h.calls.length,1);assert.equal(JSON.parse(new TextDecoder().decode(h.objects.get('owner/visuals/edit-123456.json'))).status,'failed');assert(!h.objects.has('owner/images/edit-123456'));
 for(const opts of [{provider:'unknown'},{provider:'google',model:'unknown'}]){const h=await harness();assert.equal((await h.submit(opts)).status,400);assert.equal(h.calls.length,0)}
 const disconnected=await harness({googleConnected:false});assert.equal((await disconnected.submit({provider:'google',model})).status,503);assert.equal(disconnected.calls.length,0);
});
test('Google framing pads without distortion and strips padding from JPEG outputs',()=>{
 const work={width:32,height:16},inputs=googleArea.googleAreaInputs(original,mask(),32,16,work);assert.equal(inputs.frame.width,32);assert.equal(inputs.frame.height,18);assert.equal(inputs.region.y,1);
 const source=decode(inputs.images[0].bytes),rgba=new Uint8Array(source.width*source.height*4);for(let i=0;i<source.width*source.height;i++)rgba.set([...source.data.slice(i*3,i*3+3),255],i*4);
 const result=decode(googleArea.normalizeGoogleArea(jpeg.encode({width:source.width,height:source.height,data:rgba},100).data,inputs.frame,inputs.region,work));assert.equal(result.width,32);assert.equal(result.height,16);assert(Math.abs(result.data[0]-25)<3);
 assert.throws(()=>googleArea.normalizeGoogleArea(png(32,32,[0,0,0,255]),inputs.frame,inputs.region,work),/framing/);
});
