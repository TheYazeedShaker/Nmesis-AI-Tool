import {encode} from 'fast-png';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {imageDimensions} from '../lib/image-dimensions.ts';
import {upscaleModel,upscaleTarget} from '../lib/upscale-models.ts';
const png=Buffer.from(encode({width:1672,height:941,channels:3,depth:8,data:new Uint8Array(1672*941*3).fill(128)}));
test('uses raster dimensions, preserves portrait and landscape proportions, rejects bad inputs',()=>{
 const size=imageDimensions(png);assert.ok(size.width>100);assert.ok(size.height>100);assert.equal(size.type,'image/png');
 assert.deepEqual(upscaleTarget(1536,864,3840),{width:3840,height:2160});assert.deepEqual(upscaleTarget(864,1536,7680),{width:4320,height:7680});
 assert.throws(()=>upscaleTarget(0,10,3840));assert.throws(()=>upscaleModel('made-up-endpoint'));assert.throws(()=>imageDimensions(new TextEncoder().encode('<svg></svg>')));
 const huge=Buffer.from(png);huge.writeUInt32BE(100000,16);assert.throws(()=>imageDimensions(huge),/70 megapixels/);
});
async function harness(){
 const objects=new Map();const store={get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,head:async k=>objects.has(k)?{}:null,put:async(k,v)=>objects.set(k,v)};
 const parent={id:'parent-1234',title:'Car',src:'/api/assets/parent-1234',status:'ready',width:100,height:Math.round(imageDimensions(png).height/imageDimensions(png).width*100),sourceId:'car-1234',provider:'openai'};
 // Use the exact reference ratio rather than the rounded dimensions for validation.
 parent.width=imageDimensions(png).width/2;parent.height=imageDimensions(png).height/2;
 objects.set('owner/visuals/parent-1234.json',JSON.stringify(parent));objects.set('owner/images/parent-1234','original');
 class StudioError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const ctx=vm.createContext({crypto,Request,Response,File,Blob,Uint8Array,Date,URL});
 const stub=(values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context:ctx});
 const modules={
 '@/lib/portable/uploads':stub({readStudioForm:r=>r.formData()}),
 '@/lib/studio-server':stub({context:async()=>({prefix:'owner/',BUCKET:store}),bucket:x=>x,fail:e=>Response.json({error:e.message},{status:e.status||500}),imageKey:(p,id)=>p+'images/'+id,StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x)}),
 '@/lib/film-server':stub({database:()=>({prepare:()=>({bind:()=>({first:async()=>null})})})}),
 '@/lib/image-server':stub({publicImage:x=>x}),
 '@/lib/upscale-models':stub({upscaleModel}),
 '@/lib/image-dimensions':stub({imageDimensions}),
 };
 const code=ts.transpileModule(readFileSync(new URL('../app/api/upscale-import/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const mod=new vm.SourceTextModule(code,{context:ctx});await mod.link(s=>modules[s]);await mod.evaluate();
 async function submit({parentId=parent.id,model='topaz-high-fidelity',origin='https://studio.test',image=png}={}){const form=new FormData();form.set('parentId',parentId);form.set('model',model);form.set('image',new File([image],'upscale.png',{type:'image/png'}));return mod.namespace.POST(new Request('https://studio.test/api/upscale-import',{method:'POST',headers:{origin},body:form}))}
 return{objects,parent,submit};
}
test('imports a separate owner-scoped visual, keeps original and actual dimensions',async()=>{
 const h=await harness(),response=await h.submit();assert.equal(response.status,200);const {visual}=await response.json();assert.notEqual(visual.id,h.parent.id);assert.equal(visual.width,imageDimensions(png).width);assert.equal(visual.upscale.method,'external-import');assert.equal(visual.upscale.parentId,h.parent.id);assert.equal(visual.sourceId,'car-1234');assert.equal(h.objects.get('owner/images/parent-1234'),'original');assert.ok(h.objects.has('owner/images/'+visual.id));
});
test('rejects foreign origin, inaccessible parent, unknown model and invalid image without saving',async()=>{
 const h=await harness();for(const input of [{origin:'https://evil.test'},{parentId:'foreign-1234'},{model:'anything'},{image:new TextEncoder().encode('not an image')}])assert.ok((await h.submit(input)).status>=400);assert.equal(h.objects.size,2);
});
test('rejects imports that are smaller or change the original proportions',async()=>{
 const h=await harness();h.parent.width=imageDimensions(png).width;h.parent.height=imageDimensions(png).height;h.objects.set('owner/visuals/parent-1234.json',JSON.stringify(h.parent));assert.equal((await h.submit()).status,400);
 h.parent.width=100;h.parent.height=100;h.objects.set('owner/visuals/parent-1234.json',JSON.stringify(h.parent));assert.equal((await h.submit()).status,400);
});
