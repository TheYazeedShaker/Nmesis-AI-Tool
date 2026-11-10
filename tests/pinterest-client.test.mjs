import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
async function client({large=false,fail=false,controller}={}){
 const calls=[];const data={id:'original-id',url:'/api/assets/original-id?original=1',name:'Campaign',pin:'https://www.pinterest.com/pin/1/',width:4096,height:2304,needsPreparation:large};
 const scope=vm.createContext({Error,DOMException,fetch:async(url,opts)=>{calls.push([url,opts]);return url==='/api/pinterest'?Response.json(data):new Response(new Blob(['original'],{type:'image/png'}))}});
 const ref=new vm.SyntheticModule(['uploadReference'],function(){this.setExport('uploadReference',async blob=>{calls.push(['prepare',blob]);if(fail)throw new Error('Original upload failed');if(controller)controller.abort();return{id:'prepared-id',url:'/api/assets/prepared-id',originalWidth:4096,originalHeight:2304}})},{context:scope});
 const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../lib/pinterest-client.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:scope});await m.link(()=>ref);await m.evaluate();return{run:m.namespace.importPinterestReference,calls};
}
test('Pinterest original metadata survives preparation and only ready asset IDs reach generation',async()=>{const h=await client({large:true});const r=await h.run('https://www.pinterest.com/pin/1/');assert.equal(r.id,'prepared-id');assert.equal(r.url,'/api/assets/prepared-id');assert.equal(r.originalWidth,4096);assert.match(r.name,/4096 × 2304/);assert.equal(h.calls.length,3)});
test('small original is reused unchanged; failed original preservation blocks import',async()=>{const small=await client();assert.equal((await small.run('pin')).id,'original-id');assert.equal(small.calls.length,1);const large=await client({large:true,fail:true});await assert.rejects(large.run('pin'),/Original upload failed/)});
test('a changed pin cannot return a stale prepared reference',async()=>{const controller=new AbortController();const h=await client({large:true,controller});await assert.rejects(h.run('pin',controller.signal),{name:'AbortError'})});
