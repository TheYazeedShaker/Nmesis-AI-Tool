import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {encode} from 'fast-png';
import {imageDimensions} from '../lib/image-dimensions.ts';
import * as policy from '../lib/reference-policy.ts';
const png=encode({width:4,height:2,data:new Uint8Array(32).fill(200),channels:4});
async function clientHarness({size=200_000,failOriginal=false}={}){
 const calls=[],encodes=[],draws=[];let closed=false;
 const canvas={width:0,height:0,getContext:()=>({drawImage:(...a)=>draws.push(a),imageSmoothingQuality:''}),toBlob:(cb,type,quality)=>{encodes.push({width:canvas.width,height:canvas.height,type,quality});cb(new Blob([new Uint8Array(size)],{type}))}};
 const scope=vm.createContext({Blob,File,FormData,Uint8Array,Promise,Error,AbortSignal,document:{createElement:()=>canvas},createImageBitmap:async()=>({width:3840,height:2160,close:()=>closed=true}),fetch:async(url,opts)=>{calls.push([url,opts]);if(opts.method==='PUT')return Response.json(failOriginal?{error:'Original could not be saved'}:{saved:true},{status:failOriginal?500:200});return Response.json({id:'reference-123',url:'/api/assets/reference-123'})}});
 const stub=v=>new vm.SyntheticModule(Object.keys(v),function(){for(const [k,value]of Object.entries(v))this.setExport(k,value)},{context:scope});
 const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../lib/reference-upload.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:scope});
 await m.link(s=>stub(s.includes('policy')?policy:s.includes('studio-fetch')?{studioFetch:scope.fetch}:{imageDimensions}));await m.evaluate();return {...m.namespace,calls,encodes,draws,closed:()=>closed};
}
test('large reference keeps its original byte-for-byte and first tries full-resolution high quality',async()=>{
 const h=await clientHarness(),original=new Blob([png,new Uint8Array(9_000_000)],{type:'image/png'});
 const a=await h.uploadReference(original);assert.equal(h.calls.length,2);assert.deepEqual(new Uint8Array(await h.calls[1][1].body.get('image').arrayBuffer()),new Uint8Array(await original.arrayBuffer()));assert.equal(h.calls[1][1].method,'PUT');assert.equal(a.originalUrl,'/api/assets/reference-123?original=1&download=1');assert.equal(a.prepared,true);assert.equal(h.encodes[0].width,3840);assert.equal(h.encodes[0].height,2160);assert.equal(h.encodes[0].quality,.98);assert.equal(h.encodes[0].type,'image/webp');assert(h.closed());
});
test('small valid references are uploaded unchanged without a redundant original copy',async()=>{
 const h=await clientHarness(),original=new Blob([png],{type:'image/png'}),a=await h.uploadReference(original);assert.equal(h.calls.length,1);assert.deepEqual(new Uint8Array(await h.calls[0][1].body.get('image').arrayBuffer()),png);assert.equal(a.prepared,false);assert.equal(h.encodes.length,0);
});
test('failed original preservation is surfaced instead of reporting a successful upload',async()=>{
 const h=await clientHarness({failOriginal:true}),original=new Blob([png,new Uint8Array(9_000_000)],{type:'image/png'});await assert.rejects(h.uploadReference(original),/Original could not be saved/);
});
test('invalid formats, impossible dimensions and uploads beyond 40 MB fail before network calls',async()=>{
 const h=await clientHarness();for(const file of [new Blob(['bad'],{type:'image/png'}),new Blob([png],{type:'image/gif'}),new Blob([png,new Uint8Array(40_000_000)],{type:'image/png'})])await assert.rejects(h.uploadReference(file));assert.equal(h.calls.length,0);
});
async function originalRoute(){
 const objects=new Map([['owner/images/reference-123',png]]);const scope=vm.createContext({Uint8Array,Number,Response,Error,File});
 class StudioError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const store={head:async k=>objects.has(k)?{}:null,put:async(k,v,opts)=>{if(opts.onlyIf&&objects.has(k))return null;objects.set(k,v);return {}}};
 const modules={'@/lib/portable/uploads':{readStudioForm:r=>r.formData()},'@/lib/studio-server':{bucket:v=>v,context:async()=>({prefix:'owner/',BUCKET:store}),fail:e=>Response.json({error:e.message},{status:e.status||500}),imageKey:(p,id)=>p+'images/'+id,validId:s=>typeof s==='string'&&/^[a-z0-9-]{8,80}$/.test(s),StudioError},'@/lib/image-dimensions':{imageDimensions},'@/lib/reference-policy':policy};
 const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../app/api/assets/[id]/original/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:scope});await m.link(s=>new vm.SyntheticModule(Object.keys(modules[s]),function(){for(const [k,v]of Object.entries(modules[s]))this.setExport(k,v)},{context:scope}));await m.evaluate();
 return {objects,put:(id,bytes,length=bytes.length)=>m.namespace.PUT(new Request('https://studio.test/api/assets/'+id+'/original',{method:'PUT',headers:{'content-length':String(length)},body:bytes}),{params:Promise.resolve({id})})};
}
test('original storage is owner-bound, immutable and validates actual file headers and declared length',async()=>{
 const h=await originalRoute();assert.equal((await h.put('reference-123',png)).status,200);assert.deepEqual(h.objects.get('owner/originals/reference-123'),png);assert.equal((await h.put('reference-123',png)).status,409);assert.equal((await h.put('foreign-123',png)).status,404);assert.equal((await h.put('reference-123',png,40_000_001)).status,413);assert.equal((await h.put('reference-123',Buffer.from('fake'))).status,400);assert.equal((await h.put('reference-123',png,png.length+1)).status,413);
});

test('upload reports preparation, reference and original stages without finishing early',async()=>{
 const h=await clientHarness(),stages=[],original=new Blob([png,new Uint8Array(9_000_000)],{type:'image/png'});
 await h.uploadReference(original,original,{onStage:s=>stages.push(s)});
 assert.deepEqual(stages,['Preparing image…','Uploading reference…','Saving full-resolution original…']);
 assert(h.calls.every(([,options])=>options.signal instanceof AbortSignal));
});
test('a canceled replacement does not send its original or return a ready asset',async()=>{
 const h=await clientHarness(),controller=new AbortController(),original=new Blob([png,new Uint8Array(9_000_000)],{type:'image/png'});
 await assert.rejects(h.uploadReference(original,original,{signal:controller.signal,onStage:s=>{if(s==='Uploading reference…')controller.abort()}}),{name:'AbortError'});
 assert.equal(h.calls.filter(([,o])=>o.method==='PUT').length,0);
});
