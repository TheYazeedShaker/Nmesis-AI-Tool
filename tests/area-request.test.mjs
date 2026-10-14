import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {AreaEditRejected,areaEditRequest,checkAreaEdit} from '../lib/area-request.ts';
test('an unresponsive edit times out without a second paid request',async()=>{
 let calls=0;const keepAlive=setInterval(()=>{},100);
 try{await assert.rejects(()=>areaEditRequest(new FormData(),async(_,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))},20),/timeout|timed out/i);assert.equal(calls,1)}finally{clearInterval(keepAlive)}
});
test('completed edits return the saved visual; recovery is a bounded read-only request',async()=>{
 const visual={id:'edit-1234',status:'ready',src:'/api/assets/edit-1234'};
 assert.deepEqual(await areaEditRequest(new FormData(),async()=>Response.json({visual})),visual);
 let options;assert.equal((await checkAreaEdit('edit-1234',async(url,o)=>{assert.equal(url,'/api/area-edits/edit-1234');options=o;return Response.json({status:'ready',visual})})).status,'ready');assert.equal(options.method,undefined);assert.equal(options.cache,'no-store');assert.ok(options.signal);
 await assert.rejects(()=>areaEditRequest(new FormData(),async()=>Response.json({})),/no completed/);
});
test('status lookup isolates owners and recovers an image saved before metadata completion',async()=>{
 const objects=new Map(),ctx=vm.createContext({Response,URL});class StudioError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const store={get:async k=>objects.has(k)?{json:async()=>objects.get(k)}:null,head:async k=>objects.has(k)?{}:null};
 const values={context:async()=>({prefix:'owner/',BUCKET:store}),bucket:x=>x,validId:x=>/^[a-z0-9-]{8,80}$/.test(x),imageKey:(p,id)=>p+'images/'+id,StudioError,fail:e=>Response.json({error:e.message},{status:e.status||500})};
 const stub=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context:ctx});
 const code=ts.transpileModule(readFileSync(new URL('../app/api/area-edits/[id]/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const route=new vm.SourceTextModule(code,{context:ctx});await route.link(()=>stub);await route.evaluate();const get=async()=>{const r=await route.namespace.GET(new Request('https://studio.test/api/area-edits/edit-1234'),{params:Promise.resolve({id:'edit-1234'})});return r.json()};
 objects.set('other/visuals/edit-1234.json',{status:'ready',areaEdit:{}});assert.equal((await get()).status,'not-found');
 objects.set('owner/visuals/edit-1234.json',{id:'edit-1234',src:'/api/assets/edit-1234',status:'pending',areaEdit:{}});assert.equal((await get()).status,'pending');
 objects.set('owner/images/edit-1234','saved-png');assert.equal((await get()).status,'ready');assert.equal((await get()).visual.status,'ready');
 objects.delete('owner/images/edit-1234');objects.set('owner/visuals/edit-1234.json',{status:'failed',error:'Provider failed',areaEdit:{}});assert.equal((await get()).status,'failed');
});

test('confirmed validation rejection can be corrected without an uncertain pending edit',async()=>{
 await assert.rejects(()=>areaEditRequest(new FormData(),async()=>Response.json({error:'Choose a saved visual.'},{status:400,headers:{'X-Area-Edit-Not-Started':'true'}})),AreaEditRejected);
 await assert.rejects(()=>areaEditRequest(new FormData(),async()=>Response.json({error:'Already submitted'},{status:409})),e=>!(e instanceof AreaEditRejected));
});
