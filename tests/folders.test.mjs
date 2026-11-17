import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import {studioSchemaSql,userPrefix,MEMBER,ORG} from './sqlite-schema.mjs';

// Projects and folders (lib/folders.ts, migration 0006) on the real schema in
// SQLite. tests/postgres.test.mjs runs the same statements under row level
// security and the environment rule.
async function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(studioSchemaSql());
 const db={prepare(query){let args=[];return{bind(...values){args=values.map(v=>v===undefined?null:v);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const ready={value:true},saved=new Set();
 const sandbox=vm.createContext({console,Date,JSON,crypto});
 const stubs={
  './studio-server':{StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x)},
  './film-server':{database:c=>c.DB},
  './trash-ready':{foldersReady:async()=>ready.value},
  './org-library':{
   requireDeleteRight:(ctx,owner)=>{if(owner!==ctx.prefix&&ctx.role!=='owner')throw new StudioError('Only the person who made this, or an owner of your company, can delete it.',403)},
   locate:async(ctx,key)=>saved.has(ctx.org+':'+key)?ctx.prefix:null,
  },
 };
 const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../lib/folders.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:sandbox});
 await m.link(s=>{const stub=stubs[s];if(!stub)throw new Error('unexpected import '+s);return new vm.SyntheticModule(Object.keys(stub),function(){for(const [k,v] of Object.entries(stub))this.setExport(k,v)},{context:sandbox})});
 await m.evaluate();
 const now=Date.now(),a=userPrefix('a'),b=userPrefix('b');
 sql.prepare("INSERT INTO films(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES('film-0001',?,?,?,'completed','{}',?,?)").run(ORG,a,a,now,now);
 sql.prepare("INSERT INTO films(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES('film-other',?,?,?,'completed','{}',?,?)").run('other-company',b,b,now,now);
 sql.prepare("INSERT INTO image_jobs(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES('visual-job-1',?,?,?,'completed','{}',?,?)").run(ORG,a,a,now,now);
 saved.add(ORG+':visuals/visual-saved-1.json');
 const ctx={DB:db,prefix:a,...MEMBER,role:'creator'};
 return {f:m.namespace,ctx,sql,ready,b,close:()=>sql.close()};
}
const err=(status,re)=>e=>e.status===status&&(!re||re.test(e.message));

test('folders: create, one level of sub-folders, rename, names checked',async()=>{
 const h=await harness();
 try{
  const {folder:top}=await h.f.createFolder(h.ctx,{name:'  Launch   campaign '});
  assert.equal(top.name,'Launch campaign');assert.equal(top.parentId,null);assert.equal(top.mine,true);
  const {folder:sub}=await h.f.createFolder(h.ctx,{name:'Social cut-downs',parentId:top.id});
  assert.equal(sub.parentId,top.id);
  await assert.rejects(()=>h.f.createFolder(h.ctx,{name:'Too deep',parentId:sub.id}),err(400,/one level deep/));
  await assert.rejects(()=>h.f.createFolder(h.ctx,{name:'  '}),err(400,/name/));
  await assert.rejects(()=>h.f.createFolder(h.ctx,{name:'x'.repeat(81)}),err(400,/80/));
  await assert.rejects(()=>h.f.createFolder(h.ctx,{name:'Nowhere',parentId:'missing-folder'}),err(404));
  const {folder:renamed}=await h.f.renameFolder(h.ctx,top.id,{name:'Spring launch'});
  assert.equal(renamed.name,'Spring launch');
  const map=await h.f.folderMap(h.ctx);
  assert.deepEqual(map.folders.map(f=>f.name).sort(),['Social cut-downs','Spring launch']);
  // Another company sees none of them.
  assert.deepEqual((await h.f.folderMap({...h.ctx,org:'other-company'})).folders,[]);
  await assert.rejects(()=>h.f.renameFolder({...h.ctx,org:'other-company'},top.id,{name:'Taken'}),err(404));
 }finally{h.close()}
});

test('folders: work moves in and out, one folder each, only the company’s own work',async()=>{
 const h=await harness();
 try{
  const {folder:one}=await h.f.createFolder(h.ctx,{name:'One'}),{folder:two}=await h.f.createFolder(h.ctx,{name:'Two'});
  await h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-0001'},{kind:'visual',id:'visual-job-1'},{kind:'visual',id:'visual-saved-1'}],folderId:one.id});
  let map=await h.f.folderMap(h.ctx);
  assert.equal(map.placed.get('film:film-0001'),one.id);assert.equal(map.placed.get('visual:visual-saved-1'),one.id);
  await h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-0001'}],folderId:two.id});
  map=await h.f.folderMap(h.ctx);assert.equal(map.placed.get('film:film-0001'),two.id,'moved, not copied');
  await h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-0001'}],folderId:null});
  map=await h.f.folderMap(h.ctx);assert.equal(map.placed.has('film:film-0001'),false,'Not in a folder');
  await assert.rejects(()=>h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-other'}],folderId:one.id}),err(404),'another company’s film');
  await assert.rejects(()=>h.f.moveItems(h.ctx,{items:[{kind:'thing',id:'film-0001'}],folderId:one.id}),err(400));
  await assert.rejects(()=>h.f.moveItems(h.ctx,{items:[],folderId:one.id}),err(400));
  await assert.rejects(()=>h.f.moveItems(h.ctx,{items:Array.from({length:201},()=>({kind:'film',id:'film-0001'})),folderId:one.id}),err(400,/200/));
  await assert.rejects(()=>h.f.moveItems({...h.ctx,org:'other-company'},{items:[{kind:'film',id:'film-other'}],folderId:one.id}),err(404),'into another company’s folder');
 }finally{h.close()}
});

test('folders: deleting keeps the work (Not in a folder), Undo brings the folder and its sub-folders back',async()=>{
 const h=await harness();
 try{
  const {folder:top}=await h.f.createFolder(h.ctx,{name:'Top'}),{folder:sub}=await h.f.createFolder(h.ctx,{name:'Sub',parentId:top.id});
  await h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-0001'}],folderId:sub.id});
  // Only its creator or an owner deletes it.
  await assert.rejects(()=>h.f.deleteFolder({...h.ctx,prefix:h.b},top.id),err(403));
  const gone=await h.f.deleteFolder(h.ctx,top.id);
  let map=await h.f.folderMap(h.ctx);
  assert.deepEqual(map.folders,[],'the folder and its sub-folder');
  assert.equal(map.placed.has('film:film-0001'),false,'its work is Not in a folder');
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM folder_items').get().n,1,'the membership is kept for Undo');
  await h.f.restoreFolder(h.ctx,top.id,gone.at);
  map=await h.f.folderMap(h.ctx);
  assert.equal(map.folders.length,2);assert.equal(map.placed.get('film:film-0001'),sub.id);
  await assert.rejects(()=>h.f.restoreFolder(h.ctx,top.id,gone.at),err(404),'restoring twice');
 }finally{h.close()}
});

test('folders before migration 0006: the library has no folders, and folder changes say so',async()=>{
 const h=await harness();
 try{
  h.ready.value=false;
  const map=await h.f.folderMap(h.ctx);
  assert.equal(map.ready,false);assert.equal(map.folders.length,0);assert.equal(map.placed.size,0);
  await assert.rejects(()=>h.f.createFolder(h.ctx,{name:'Later'}),err(503,/aren’t available yet/));
  await assert.rejects(()=>h.f.moveItems(h.ctx,{items:[{kind:'film',id:'film-0001'}],folderId:null}),err(503));
 }finally{h.close()}
});

test('the folder routes and the library are in the route table; viewers cannot change folders',async()=>{
 const {routeRule,checkRoute}=await import('../lib/accounts/plan.ts').catch(()=>({}));
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const plan=read('lib/accounts/plan.ts');
 assert.match(plan,/\{path:\/\^\\\/api\\\/folders\(\\\/\.\*\)\?\$\/,feature:null\}/);
 assert.match(plan,/\{path:\/\^\\\/api\\\/library\$\/,methods:\['GET'\],feature:null,library:true\}/);
 if(routeRule&&checkRoute){
  assert.ok(routeRule('/api/folders','POST'));assert.ok(routeRule('/api/folders/move','POST'));assert.ok(routeRule('/api/library','GET'));
  const viewer={role:'viewer',entitlements:{legacy:true,features:{}}};
  assert.throws(()=>checkRoute(viewer,'/api/folders','POST'),/viewer/i);
  assert.doesNotThrow(()=>checkRoute(viewer,'/api/library','GET'));
 }
 for(const f of ['app/api/folders/route.ts','app/api/folders/[id]/route.ts','app/api/folders/move/route.ts','app/api/library/route.ts'])assert.match(read(f),/await context\(request(,true|,false,timing)?\)/,f);
});
