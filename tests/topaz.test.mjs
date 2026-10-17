import {encode} from 'fast-png';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testDatabase} from './helpers/pg.mjs';
import vm from 'node:vm';
import ts from 'typescript';
import {imageDimensions} from '../lib/image-dimensions.ts';
const root=new URL('../',import.meta.url),png=Buffer.from(encode({width:1672,height:941,channels:3,depth:8,data:new Uint8Array(1672*941*3).fill(128)}));
const processId='11111111-2222-4333-8444-555555555555';
async function harness(){
 const pg=await testDatabase();
 const db=pg.db;
 const objects=new Map();const store={get:async k=>{const v=objects.get(k);return v===undefined?null:{json:async()=>JSON.parse(v),size:typeof v==='string'?v.length:v.byteLength,arrayBuffer:async()=>v}},head:async k=>objects.has(k)?{}:null,put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k)};
 const ctx={prefix:'owner/',BUCKET:store,DB:db,KEY_ENCRYPTION_SECRET:'a'.repeat(64)};
 const parent={id:'parent-1234',title:'Car',src:'/api/assets/parent-1234',status:'ready',...imageDimensions(png),sourceId:'car-1234',provider:'openai'};
 objects.set('owner/visuals/'+parent.id+'.json',JSON.stringify(parent));objects.set('owner/images/'+parent.id,png);
 let submits=0,mode='ok',status='Completed',downloadFails=false,output,leaked=false;
 class StudioError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const calls=[];
 const fakeFetch=async(url,opts={})=>{calls.push({url,method:opts.method});if(url.endsWith('/credits/balance'))return Response.json({available_credits:100});if(url.endsWith('/enhance/async')){submits++;assert.equal(opts.body.get('model'),'Upscale High Fidelity V3');assert.equal(opts.body.get('faceEnhancement'),'false');assert.equal(opts.body.get('crop_to_fill'),'false');assert.equal(opts.headers['X-API-Key'],'test-key-for-topaz-only');output=Buffer.from(png);output.writeUInt32BE(Number(opts.body.get('output_width')),16);output.writeUInt32BE(Number(opts.body.get('output_height')),20);if(mode==='unknown')throw new Error('network timeout');if(mode==='reject')return new Response('',{status:402});return Response.json({process_id:processId})}if(url.includes('/status/'))return Response.json({process_id:processId,model:'Upscale High Fidelity V3',status,progress:100,credits:1});if(url.includes('/download/'))return Response.json({download_url:'https://output.topazlabs.com/result.jpg'});if(url.startsWith('https://output.')){leaked=!!opts.headers;if(downloadFails)return new Response('',{status:503});return new Response(output)}throw new Error('Unexpected endpoint '+url)};
 const context=vm.createContext({TextEncoder,TextDecoder,crypto,Buffer,fetch:fakeFetch,Request,Response,Blob,File,FormData,AbortSignal,Uint8Array,Date,URL});
 const stub=v=>new vm.SyntheticModule(Object.keys(v),function(){for(const[k,x]of Object.entries(v))this.setExport(k,x)},{context});
 const mods=new Map([
 ['lib/studio-server',stub({bucket:x=>x,StudioError,imageKey:(p,id)=>p+'images/'+id,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x)})],
 ['lib/film-server',stub({database:c=>c.DB})],['lib/image-server',stub({publicImage:x=>x})],['lib/image-dimensions',stub({imageDimensions})],
 ]);
 async function load(name){if(mods.has(name))return mods.get(name);const code=ts.transpileModule(readFileSync(new URL(name+'.ts',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;const m=new vm.SourceTextModule(code,{context});mods.set(name,m);await m.link(s=>load(s.startsWith('./')?'lib/'+s.slice(2):s));return m}
 const mod=await load('lib/topaz-server');await mod.evaluate();const api=mod.namespace;await api.saveTopazKey(ctx,'test-key-for-topaz-only');
 return{api,ctx,objects,parent,calls,pg,get submits(){return submits},get leaked(){return leaked},set mode(v){mode=v},set downloadFails(v){downloadFails=v},set status(v){status=v}};
}
test('HF3 uses encrypted credentials, submits once, saves an owner-scoped separate visual and downloads without key',async()=>{
 const h=await harness();assert.doesNotMatch(h.objects.get('owner/credentials/topaz.json'),/test-key-for-topaz-only/);
 let job=await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);assert.equal(job.status,'queued');
 await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);await h.api.startTopaz(h.ctx,'upscale-5678',h.parent.id,3840);assert.equal(h.submits,1);
 job=await h.api.refreshTopaz(h.ctx,job.id);assert.equal(job.status,'ready');assert.equal(job.visual.width,3840);assert.equal(job.visual.upscale.method,'topaz-api');assert.equal(job.visual.upscale.credits,1);assert.equal(job.visual.sourceId,'car-1234');assert.equal(h.leaked,false);assert.equal(h.objects.get('owner/images/'+h.parent.id),png);
 await h.api.refreshTopaz(h.ctx,job.id);assert.equal(h.submits,1);
});
test('uncertain submission is never retried or replaced by another paid call',async()=>{
 const h=await harness();h.mode='unknown';let job=await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);assert.equal(job.status,'unknown');job=await h.api.refreshTopaz(h.ctx,job.id);assert.equal(job.status,'unknown');await h.api.startTopaz(h.ctx,'upscale-5678',h.parent.id,3840);assert.equal(h.submits,1);
});
test('known billing rejection is actionable; cross-owner reads and invalid/downscale requests are blocked',async()=>{
 const h=await harness();h.mode='reject';const job=await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);assert.equal(job.status,'failed');assert.match(job.error,/credits/);
 await assert.rejects(h.api.topazRow({...h.ctx,prefix:'someone-else/'},job.id),/not found/);
 await assert.rejects(h.api.startTopaz(h.ctx,'upscale-5678',h.parent.id,42),/Choose/);
 await assert.rejects(h.api.startTopaz(h.ctx,'upscale-1234','another-1234',3840),/another/);
 assert.equal(h.submits,1);
});
test('failed saving can recover the completed output without generating again',async()=>{
 const h=await harness();let job=await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);h.downloadFails=true;await assert.rejects(h.api.refreshTopaz(h.ctx,job.id),/downloading/);h.downloadFails=false;job=await h.api.refreshTopaz(h.ctx,job.id);assert.equal(job.status,'ready');assert.equal(h.submits,1);
});
test('a provider receipt recovers an interrupted acceptance without resubmitting',async()=>{
 const h=await harness();const job=await h.api.startTopaz(h.ctx,'upscale-1234',h.parent.id,3840);await h.pg.run("UPDATE topaz_jobs SET provider_id=NULL,status='unknown' WHERE id=?",job.id);const recovered=await h.api.refreshTopaz(h.ctx,job.id);assert.equal(recovered.status,'ready');assert.equal(h.submits,1);
});
