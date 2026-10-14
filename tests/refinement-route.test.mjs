import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as models from '../lib/image-models.ts';
import * as studio from '../lib/studio.ts';
import * as lineup from '../lib/lineup.ts';
async function harness(){
 const objects=new Map(),calls=[];for(const id of ['car-12345','mood-1234','base-1234','extra-0001','extra-0002'])objects.set('owner/images/'+id,Buffer.from(id));
 objects.set('other/images/foreign-123','private');
 const store={get:async k=>objects.has(k)?{httpMetadata:{contentType:'image/png'},arrayBuffer:async()=>objects.get(k)}:null,put:async(k,v,o={})=>{if(o.onlyIf&&objects.has(k))return null;objects.set(k,v);return{}}};
 class StudioError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const png=Buffer.alloc(24);png[0]=137;png.writeUInt32BE(2048,16);png.writeUInt32BE(1152,20);
 const ctx=vm.createContext({Buffer,Blob,FormData,Request,Response,Date,AbortSignal,fetch:async(u,o)=>{calls.push([u,o]);return Response.json({data:[{b64_json:png.toString('base64')}]})}});
 const stub=v=>new vm.SyntheticModule(Object.keys(v),function(){for(const [k,x]of Object.entries(v))this.setExport(k,x)},{context:ctx});
 const stubs={
 '@/lib/studio-server':{context:async()=>({prefix:'owner/',BUCKET:store}),bucket:x=>x,imageKey:(p,id)=>p+'images/'+id,readJson:r=>r.json(),str:(s,n=2000)=>typeof s==='string'?s.trim().slice(0,n):'',validId:s=>typeof s==='string'&&/^[a-z0-9-]{8,80}$/.test(s),StudioError,fail:e=>Response.json({error:e.message},{status:e.status||500}),providerError:()=>new StudioError('Provider error',502)},
 '@/lib/credentials':{apiKey:async()=> 'synthetic-test-key'},'@/lib/lineup':lineup,'@/lib/image-models':models,'@/lib/studio':studio};
 const code=ts.transpileModule(readFileSync(new URL('../app/api/generate/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const m=new vm.SourceTextModule(code,{context:ctx});await m.link(s=>stub(stubs[s]));await m.evaluate();
 const submit=(extra={})=>m.namespace.POST(new Request('https://studio.test/api/generate',{method:'POST',body:JSON.stringify({id:'result-1234',sourceId:'car-12345',moodId:'mood-1234',parentId:'base-1234',brief:'An SUV in the desert',refinement:'Use Reference 2 for the light',refinementReferenceIds:['extra-0001','extra-0002'],...extra})}));
 return{objects,calls,submit};
}
test('OpenAI receives base image third and every extra reference in visible order; original is preserved',async()=>{
 const h=await harness(),r=await h.submit();assert.equal(r.status,200,await r.clone().text());const {visual}=await r.json();assert.deepEqual(visual.refinementReferenceIds,['extra-0001','extra-0002']);
 const form=h.calls[0][1].body,images=form.getAll('image[]');assert.deepEqual(images.map(i=>i.name),['product.png','mood.png','previous.png','reference-1.png','reference-2.png']);assert.deepEqual(await Promise.all(images.map(i=>i.text())),['car-12345','mood-1234','base-1234','extra-0001','extra-0002']);assert.match(form.get('prompt'),/Reference 2.*Image 5/);assert.equal(h.objects.get('owner/images/base-1234').toString(),'base-1234');assert.equal((await h.submit()).status,409);assert.equal(h.calls.length,1);
});
test('missing, foreign, excessive and invalid reference lists never call OpenAI',async()=>{
 const h=await harness();for(const extra of [{refinementReferenceIds:['foreign-123']},{refinementReferenceIds:['missing-123']},{refinementReferenceIds:['../other']},{refinementReferenceIds:Array(7).fill('extra-0001')},{parentId:null},{refinementReferenceIds:'extra-0001'}]){const r=await h.submit(extra);assert.ok(r.status>=400,await r.text())}assert.equal(h.calls.length,0);assert.equal(h.objects.has('owner/visuals/result-1234.json'),false);
});
test('second OpenAI refinement edits the saved first refinement bytes, with no original-scene reset',async()=>{
 for(const referenceMode of ['creative','match-inspiration']){
  const h=await harness();let r=await h.submit({referenceMode,refinement:'Add a red cone beside the front wheel'});assert.equal(r.status,200);const first=(await r.json()).visual;
  r=await h.submit({id:'result-second',parentId:first.id,referenceMode,refinement:'Change the cone to blue; keep everything else'});assert.equal(r.status,200);const second=(await r.json()).visual;
  assert.equal(second.parentId,first.id);const form=h.calls[1][1].body;assert.deepEqual(Buffer.from(await form.getAll('image[]')[2].arrayBuffer()),Buffer.from(h.objects.get('owner/images/'+first.id)));
  const prompt=form.get('prompt');assert.match(prompt,/Image 3 is the CURRENT SELECTED VERSION and the BASE IMAGE TO EDIT/);assert.match(prompt,/preserve every previous edit/);assert.match(prompt,/Change the cone to blue/);assert.doesNotMatch(prompt,/continuity only|Hero treatment|Correct any drift from Image 2|An SUV in the desert/);
 }
});
