import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import {studioSchemaSql,userPrefix,MEMBER,ORG} from './sqlite-schema.mjs';

// Delete and restore for films, swaps and stories (lib/trash.ts, migration
// 0005), on the real schema in SQLite. tests/postgres.test.mjs runs the same
// statements on Postgres with row level security.
async function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(studioSchemaSql());
 const db={prepare(query){let args=[];return{bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 const ready={value:true};
 class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const sandbox=vm.createContext({console,Date,JSON});
 const stubs={
  './studio-server':{StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x)},
  './film-server':{database:c=>c.DB},
  './trash-ready':{trashReady:async()=>ready.value},
  './library-index':{markDeleted:async()=>{}},
  './org-library':{requireDeleteRight:(ctx,owner)=>{if(owner!==ctx.prefix&&ctx.role!=='owner')throw new StudioError('Only the person who made this, or an owner of your company, can delete it.',403)}},
 };
 const lib=new URL('../lib/trash.ts',import.meta.url);
 const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(lib,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:sandbox});
 await m.link(s=>{const stub=stubs[s];if(!stub)throw new Error('unexpected import '+s);return new vm.SyntheticModule(Object.keys(stub),function(){for(const [k,v] of Object.entries(stub))this.setExport(k,v)},{context:sandbox})});
 await m.evaluate();
 const now=Date.now(),a=userPrefix('a'),b=userPrefix('b');
 const add=(table,id,owner,status)=>table==='storyboards'
  ?sql.prepare('INSERT INTO storyboards(id,org_id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,ORG,owner,'{}',now,now)
  :sql.prepare(`INSERT INTO ${table}(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(id,ORG,owner,owner,status,'{}',now,now);
 add('films','film-done-1',a,'completed');add('films','film-busy-1',a,'in_progress');add('films','film-other-1',b,'completed');
 add('swap_jobs','swap-done-1',a,'failed');add('storyboards','story-one-1',a);
 const ctx={DB:db,prefix:a,...MEMBER,role:'creator'};
 return {trash:m.namespace,ctx,sql,ready,close:()=>sql.close()};
}
const deletedAt=(h,table,id)=>h.sql.prepare(`SELECT deleted_at FROM ${table} WHERE id=?`).get(id).deleted_at;

test('films, swaps and stories go to Deleted and come back; lists leave them out',async()=>{
 const h=await harness();
 try{
  for(const [kind,table,id] of [['films','films','film-done-1'],['swaps','swap_jobs','swap-done-1'],['storyboards','storyboards','story-one-1']]){
   assert.deepEqual({...await h.trash.trashItem(h.ctx,kind,id)},{deleted:true,id});
   assert.ok(deletedAt(h,table,id)>0,kind);
   const listedNow=h.sql.prepare(`SELECT id FROM ${table} WHERE org_id=?${h.trash.listed(false)}`).all(ORG).map(r=>r.id);
   assert.ok(!listedNow.includes(id),kind+' left the list');
   assert.ok(h.sql.prepare(`SELECT id FROM ${table} WHERE org_id=?${h.trash.listed(true)}`).all(ORG).some(r=>r.id===id),kind+' is in Deleted');
   // Deleting twice is harmless (a double click, a second tab).
   await h.trash.trashItem(h.ctx,kind,id);
   assert.deepEqual({...await h.trash.restoreItem(h.ctx,kind,id)},{restored:true,id});
   assert.equal(deletedAt(h,table,id),null,kind+' restored');
  }
 }finally{h.close()}
});

test('only the creator or an owner deletes; work still running cannot be deleted; unknown ids are 404',async()=>{
 const h=await harness();
 try{
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','film-other-1'),e=>e.status===403);
  await h.trash.trashItem({...h.ctx,role:'owner'},'films','film-other-1');
  await assert.rejects(()=>h.trash.restoreItem(h.ctx,'films','film-other-1'),e=>e.status===403);
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','film-busy-1'),e=>e.status===409&&/finish before deleting/.test(e.message));
  h.sql.prepare('UPDATE films SET lock_until=? WHERE id=?').run(Date.now()+60_000,'film-done-1');
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','film-done-1'),e=>e.status===409);
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','film-missing-1'),e=>e.status===404);
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','../x'),e=>e.status===404);
  // Another company's row is not found, whatever the role.
  await assert.rejects(()=>h.trash.trashItem({...h.ctx,org:'other-company',role:'owner'},'films','film-done-1'),e=>e.status===404);
 }finally{h.close()}
});

test('the routes, the lists and the write paths use the trash rule',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 for(const [dir,kind] of [['films','films'],['swaps','swaps'],['storyboards','storyboards']]){
  assert.match(read(`app/api/${dir}/[id]/route.ts`),new RegExp(`export async function DELETE[^\\n]*trashItem\\(await context\\(request,true\\),'${kind}'`));
  assert.match(read(`app/api/${dir}/[id]/[action]/route.ts`),new RegExp(`if\\(action==='restore'\\)return Response\\.json\\(await restoreItem\\(ctx,'${kind}',id\\)\\)`));
  assert.match(read(`app/api/${dir}/route.ts`),/WHERE org_id=\?'\+listed\(deleted,ready\)\+' ORDER BY/);
  assert.match(read(`app/api/${dir}/route.ts`),/ready=await trashReady\(db\)/);
 }
 for(const file of ['lib/film-server.ts','lib/swap-server.ts','lib/storyboard-server.ts'])assert.match(read(file),/WHERE id=\? AND owner=\?'\+notDeleted\(await trashReady\(db\)\)/,file);
 assert.match(read('supabase/migrations/0005_trash.sql'),/alter table studio\.films add column if not exists deleted_at bigint;/);
});

// Before the owner runs 0005 the Studio works as before: lists show every row,
// Deleted is empty, and Delete says it is not available yet.
test('before migration 0005: nothing breaks; Delete answers that it is not available yet',async()=>{
 const h=await harness();
 try{
  h.ready.value=false;
  await assert.rejects(()=>h.trash.trashItem(h.ctx,'films','film-done-1'),e=>e.status===503&&/isn’t available yet/.test(e.message));
  assert.equal(h.trash.listed(false,false),'');
  assert.equal(h.trash.listed(true,false),' AND 1=0');
 }finally{h.close()}
});

test('trashReady finds the column, switches on once it exists, and never hides a real failure',async()=>{
 const {trashReady,notDeleted}=await import('../lib/trash-ready.ts');
 const missing={prepare:()=>({first:async()=>{throw new Error('column "deleted_at" does not exist')}})};
 const broken={prepare:()=>({first:async()=>{throw new Error('connection terminated')}})};
 const fine={prepare:()=>({first:async()=>null})};
 const t0=1_000_000;
 assert.equal(await trashReady(missing,t0),false);
 assert.equal(await trashReady(fine,t0+30_000),false,'checked again only after a minute');
 await assert.rejects(()=>trashReady(broken,t0+61_000),/connection terminated/,'a real failure is not taken for a missing column');
 assert.equal(await trashReady(fine,t0+62_000),true,'the migration ran: on');
 assert.equal(await trashReady(missing,t0+999_000),true,'once on, it stays on');
 assert.equal(notDeleted(true),' AND deleted_at IS NULL');assert.equal(notDeleted(false),'');
});
