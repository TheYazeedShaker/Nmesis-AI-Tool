import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import {studioSchemaSql,userPrefix,MEMBER,ORG} from './sqlite-schema.mjs';

// The library at scale (lib/library-index.ts, lib/library-page.ts, migration
// 0007) on the real schema in SQLite: a page at a time from the database
// alone, filters, folders with their sub-folders, Deleted, counts, signed
// thumbnails without a storage read. tests/postgres.test.mjs checks the table
// under row level security.
const compile=f=>ts.transpileModule(readFileSync(new URL('../lib/'+f,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function harness(n=1000){
 const sql=new DatabaseSync(':memory:');sql.exec(studioSchemaSql());
 const db={prepare(query){let args=[];return{bind(...values){args=values.map(v=>v===undefined?null:v);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const reads=[],store={signed:0,async downloadUrl(k){this.signed++;return 'https://signed.example.test/'+k+'?sig=1'},async head(k){reads.push(k);return null},async get(k){reads.push(k);return null},async put(){},async list(){reads.push('list');return{objects:[]}}};
 const ready={index:true,folders:true};
 const sandbox=vm.createContext({console,Date,JSON,Promise,Math,Number,String,Map,Set});
 const stubs={
  './studio-server':{StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x),bucket:x=>x},
  './film-server':{database:c=>c.DB},
  './trash-ready':{foldersReady:async()=>ready.folders},
  './library':{companyLibrary:async()=>{throw new Error('the group 1 feed must not be used once the index is ready')}},
 };
 const mods={};
 const load=async name=>{
  if(stubs[name])return new vm.SyntheticModule(Object.keys(stubs[name]),function(){for(const [k,v] of Object.entries(stubs[name]))this.setExport(k,v)},{context:sandbox});
  if(mods[name])return mods[name];
  const m=new vm.SourceTextModule(compile(name.replace('./','')+'.ts'),{context:sandbox});mods[name]=m;await m.link(load);return m;
 };
 const page=await load('./library-page');await page.evaluate();const index=mods['./library-index'];
 const a=userPrefix('a'),b=userPrefix('b'),t0=1_700_000_000_000;
 const ctx={DB:db,BUCKET:store,prefix:a,...MEMBER,role:'creator'};
 // n pieces of work: mostly key visuals, some line-ups, films, swaps, stories; two people; a few deleted.
 for(let i=0;i<n;i++){
  const kind=i%10===7?'film':i%10===8?'swap':i%10===9?'story':'visual';
  const e={kind,id:`item-${String(i).padStart(5,'0')}`,owner:i%3?a:b,title:`${['Demo SUV','Demo Saloon','Demo Hatch'][i%3]} · scene ${i}`,tool:kind==='film'?'Film':kind==='swap'?'Car swap':kind==='story'?'Story':i%5===0?'Line-up':'Key visual',
   car:['Demo SUV','Demo Saloon','Demo Hatch'][i%3],status:i%41===3?'working':'ready',assetId:`asset-${i}`,createdAt:t0+i*1000,deletedAt:i%97===5?t0:null};
  await index.namespace.indexItem({DB:db,org:ORG},e,t0);
  if(i%2===0)sql.prepare('UPDATE library_items SET thumb_key=? WHERE id=?').run(`${e.owner}thumbs/asset-${i}.webp`,e.id);
 }
 sql.prepare("INSERT INTO folders(id,org_id,parent_id,name,created_by,created_at,updated_at) VALUES('folder-top',?,NULL,'Launch',?,1,1),('folder-sub',?,'folder-top','Social',?,1,1),('folder-old',?,NULL,'Gone',?,1,1)").run(ORG,a,ORG,a,ORG,a);
 sql.prepare("UPDATE folders SET deleted_at=5 WHERE id='folder-old'").run();
 // This company's older work is indexed (0009, lib/library-backfill.ts); a test below takes the mark away.
 sql.prepare("INSERT INTO library_backfills(org_id,started_at,done_at) VALUES(?,1,2),('other-company',1,2)").run(ORG);
 const file=(kind,id,f)=>sql.prepare('INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,?,?,?,1)').run(ORG,kind,id,f);
 for(let i=0;i<30;i++)file(i%10===7?'film':i%10===8?'swap':i%10===9?'story':'visual',`item-${String(i).padStart(5,'0')}`,i<20?'folder-top':i<25?'folder-sub':'folder-old');
 const q=(p={})=>({place:'all',tool:null,car:null,who:null,q:null,sort:'new',offset:0,limit:40,...p});
 return {page:page.namespace,index:index.namespace,ctx,q,sql,store,reads,ready,close:()=>sql.close()};
}

test('a thousand pieces of work, 40 at a time, newest first, from the database alone',async()=>{
 const h=await harness(1000);
 try{
  const first=await h.page.libraryPage(h.ctx,h.q());
  assert.equal(first.indexed,true);
  assert.equal(first.items.length,40);
  const deleted=[...Array(1000).keys()].filter(i=>i%97===5).length;
  assert.equal(first.total,1000-deleted);
  assert.equal(first.items[0].id,'item-00999');
  assert.equal(first.next,40);
  assert.deepEqual(h.reads,[],'no storage read');
  assert.equal(h.store.signed,first.items.filter(i=>i.thumb?.startsWith('https://signed')).length+first.folders.reduce((n,f)=>n+f.covers.length,0),'thumbnails are signed links, made without a read');
  for(const i of first.items){
   if(i.status==='ready')assert.match(i.thumb,/^https:\/\/signed\.example\.test\/.*thumbs\/|^\/api\/assets\/asset-\d+\?thumb=1$/);
   assert.equal(i.full,i.status==='ready'?`/api/assets/asset-${Number(i.id.slice(5))}`:null,'the full picture only through the viewer route');
  }
  let seen=new Set(first.items.map(i=>i.id)),next=first.next;
  while(next!==null){const p=await h.page.libraryPage(h.ctx,h.q({offset:next}));for(const i of p.items)seen.add(i.id);next=p.next}
  assert.equal(seen.size,1000-deleted,'every piece once, no repeats');
  // Items 0–24 are in live folders (25–29 are in a deleted one, so not in a folder); deleted work is not counted.
  const filedLive=[...Array(25).keys()].filter(i=>i%97!==5).length;
  assert.deepEqual({...first.counts},{all:1000-deleted,unsorted:1000-deleted-filedLive,deleted},'work in a deleted folder is not in a folder');
 }finally{h.close()}
});

test('filters, search, sort and places are the server’s',async()=>{
 const h=await harness(300);
 try{
  const films=await h.page.libraryPage(h.ctx,h.q({tool:'Film'}));
  assert.ok(films.items.length>0&&films.items.every(i=>i.tool==='Film'&&i.kind==='film'));
  assert.ok((await h.page.libraryPage(h.ctx,h.q({car:'Demo Hatch'}))).items.every(i=>i.car==='Demo Hatch'));
  const mine=await h.page.libraryPage(h.ctx,h.q({who:'you',limit:100}));
  assert.ok(mine.items.every(i=>i.mine));
  assert.ok((await h.page.libraryPage(h.ctx,h.q({who:'others'}))).items.every(i=>!i.mine));
  const found=await h.page.libraryPage(h.ctx,h.q({q:'SCENE 12'}));
  assert.equal(found.total,11,'scene 12 and scenes 120–129, whatever the case');
  assert.ok(found.items.every(i=>/scene 12/.test(i.title)));
  assert.equal((await h.page.libraryPage(h.ctx,h.q({q:'50%_'}))).total,0,'% and _ are letters, not wildcards');
  assert.equal((await h.page.libraryPage(h.ctx,h.q({sort:'old'}))).items[0].id,'item-00000');
  const top=await h.page.libraryPage(h.ctx,h.q({place:'folder-top',limit:100}));
  assert.equal(top.total,24,'a folder shows its sub-folder’s work too (item 5 is deleted)');
  assert.equal((await h.page.libraryPage(h.ctx,h.q({place:'folder-sub'}))).total,5);
  assert.equal(top.folders.find(f=>f.id==='folder-top').count,24);
  assert.ok(!top.folders.some(f=>f.id==='folder-old'),'a deleted folder is not listed');
  const gone=await h.page.libraryPage(h.ctx,h.q({place:'deleted'}));
  assert.ok(gone.items.length>0&&gone.items.every(i=>i.deleted));
  await assert.rejects(()=>h.page.libraryPage(h.ctx,h.q({place:'folder-old'})),e=>e.status===404);
  await assert.rejects(()=>h.page.libraryPage({...h.ctx,org:'other-company'},h.q({place:'folder-top'})),e=>e.status===404,'another company’s folder');
  assert.equal((await h.page.libraryPage({...h.ctx,org:'other-company'},h.q())).total,0,'another company sees none of it');
 }finally{h.close()}
});

test('the query is checked: places, tools and page sizes',()=>{
 return harness(1).then(h=>{try{
  const read=s=>h.page.readQuery(new URL('https://studio.test/api/library?'+s));
  assert.equal(read('limit=5000').limit,100);
  assert.equal(read('').limit,40);
  assert.equal(read('offset=-5').offset,0);
  assert.equal(read('sort=sideways').sort,'new');
  assert.equal(read('who=everyone').who,null);
  assert.throws(()=>read('tool=Teleport'),e=>e.status===400);
  assert.throws(()=>read('in=../x'),e=>e.status===404);
 }finally{h.close()}});
});

test('the index keeps its row in step: changes, deleted marks, thumbnails kept',async()=>{
 const h=await harness(0);
 try{
  const e={kind:'visual',id:'item-k1',owner:userPrefix('a'),title:'First',tool:'Key visual',car:'Demo SUV',status:'working',assetId:'asset-k1',createdAt:1};
  await h.index.indexItem({DB:h.ctx.DB,org:ORG},e,10);
  h.sql.prepare("UPDATE library_items SET thumb_key='thumbs/k1.webp' WHERE id='item-k1'").run();
  await h.index.indexItem({DB:h.ctx.DB,org:ORG},{...e,title:'Second',status:'ready'},20);
  let row=h.sql.prepare("SELECT * FROM library_items WHERE id='item-k1'").get();
  assert.equal(row.title,'Second');assert.equal(row.status,'ready');assert.equal(row.thumb_key,'thumbs/k1.webp','a thumbnail is kept');assert.equal(row.created_at,1);
  await h.index.markDeleted({DB:h.ctx.DB,org:ORG},'visual','item-k1',30);
  await h.index.indexItem({DB:h.ctx.DB,org:ORG},{...e,title:'Third'},40);
  row=h.sql.prepare("SELECT * FROM library_items WHERE id='item-k1'").get();
  assert.equal(row.deleted_at,30,'saving again does not undelete');
  await h.index.markDeleted({DB:h.ctx.DB,org:ORG},'visual','item-k1',null);
  assert.equal(h.sql.prepare("SELECT deleted_at FROM library_items WHERE id='item-k1'").get().deleted_at,null);
  await h.index.removeFromIndex({DB:h.ctx.DB,org:ORG},'visual','item-k1');
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM library_items").get().n,0);
  assert.equal(h.index.plainStatus('in_progress'),'working');assert.equal(h.index.plainStatus('nsfw'),'failed');assert.equal(h.index.plainStatus('completed'),'ready');
  const film=h.index.fromFilm({id:'f1',owner:'o/',status:'queued',data:JSON.stringify({title:'Teaser',vehicle:'Demo SUV',sourceId:'s1'}),created_at:5,deleted_at:null});
  assert.deepEqual({kind:film.kind,title:film.title,car:film.car,status:film.status,assetId:film.assetId},{kind:'film',title:'Teaser',car:'Demo SUV',status:'working',assetId:'s1'});
 }finally{h.close()}
});

test('the hooks: every path that saves work keeps the index in step',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 for(const f of ['app/api/generate/route.ts','app/api/google/generate/route.ts','app/api/area-edits/route.ts','app/api/upscale-import/route.ts','lib/topaz-server.ts'])assert.match(read(f),/indexQuietly\(ctx,fromVisual\(ctx\.prefix,(record|visual)\)\)/,f);
 assert.match(read('lib/image-server.ts'),/const row=await imageRow\(ctx,id\);await indexJob\(ctx,row\);return publicImage\(row\)/);
 for(const [f,k] of [['lib/film-server.ts','film'],['lib/swap-server.ts','swap'],['lib/storyboard-server.ts','story']])assert.match(read(f),new RegExp(`await syncWork\\(ctx,'${k}',id\\)`),f);
 assert.match(read('lib/trash.ts'),/await markDeleted\(ctx,INDEX_KIND\[kind\],id,now\)/);
 assert.match(read('lib/visual-library.ts'),/await markDeleted\(ctx,'visual',id,Date\.now\(\)\)/);
 assert.match(read('app/api/library/route.ts'),/libraryPage\(ctx,readQuery/);
 assert.match(read('components/ds/media.tsx'),/rootMargin: '200px'/);
});

test('a company with several brands sees the chosen brand’s work (and work with no car); a doubled brand in old names is mended',async()=>{
 const h=await harness(30);
 try{
  const add=(id,car,title)=>h.index.indexItem({DB:h.ctx.DB,org:ORG},{kind:'visual',id,owner:h.ctx.prefix,title,tool:'Key visual',car,status:'ready',assetId:null,createdAt:1_800_000_000_000,deletedAt:null},1);
  await add('brand-old-01','Sample Sample Pickup','Sample Sample Pickup · Dunes');  // saved before the naming rule
  await add('brand-new-01','Sample Pickup','Sample Pickup · City');
  await add('brand-none-1',null,'Mood board');
  const p=await h.page.libraryPage(h.ctx,h.q({limit:100}),{brandCars:['Sample Pickup','Sample Sample Pickup']});
  const ids=p.items.map(i=>i.id);
  assert.ok(ids.includes('brand-old-01')&&ids.includes('brand-new-01')&&ids.includes('brand-none-1'));
  assert.ok(p.items.every(i=>i.car===null||i.car==='Sample Pickup'),'only the brand’s cars, and work with no car');
  assert.equal(p.items.find(i=>i.id==='brand-old-01').title,'Sample Pickup · Dunes','the doubled brand is mended when shown');
  assert.deepEqual([...p.cars],['Sample Pickup'],'one name in the car filter');
  assert.equal(p.counts.all,p.total,'the counts follow the brand');
  // The car filter finds both spellings.
  const one=await h.page.libraryPage(h.ctx,h.q({car:'Sample Pickup'}));
  assert.deepEqual([...one.items.map(i=>i.id)].sort(),['brand-new-01','brand-old-01']);
  // One brand, or none: everything, as before.
  assert.ok((await h.page.libraryPage(h.ctx,h.q({limit:100}))).items.some(i=>i.car==='Demo SUV'));
 }finally{h.close()}
});

test('the car filter lists every car of the company (the chosen brand’s), with work or without, each named once',async()=>{
 const h=await harness(30);
 try{
  // The company's cars, as the route names them (lib/car-names.ts): "Sample 6", never "Sample Sample 6".
  const add=(id,car)=>h.index.indexItem({DB:h.ctx.DB,org:ORG},{kind:'visual',id,owner:h.ctx.prefix,title:`${car} · Coast`,tool:'Key visual',car,status:'ready',assetId:null,createdAt:1_800_000_000_000,deletedAt:null},1);
  await add('sample-5-01','Sample Sample 5');  // old work with the doubled brand
  const choices=['Sample 5','Sample 6','Sample 10'];
  const p=await h.page.libraryPage(h.ctx,h.q(),{carChoices:choices});
  assert.deepEqual([...p.cars],['Demo Hatch','Demo Saloon','Demo SUV','Sample 5','Sample 6','Sample 10'],'the company’s cars without work, the cars with work, A–Z, numbers in order');
  assert.ok(!p.cars.some(c=>/Sample Sample/.test(c)),'no doubled brand');
  // A company with several brands: the chosen brand's cars only, with or without work.
  const brand=await h.page.libraryPage(h.ctx,h.q(),{brandCars:['Sample 5','Sample Sample 5','Sample 6','Sample Sample 6'],carChoices:['Sample 5','Sample 6']});
  assert.deepEqual([...brand.cars],['Sample 5','Sample 6']);
  // Choosing a car with no work answers nothing, not an error.
  const none=await h.page.libraryPage(h.ctx,h.q({car:'Sample 6'}),{carChoices:choices});
  assert.equal(none.total,0);assert.deepEqual([...none.items],[]);
  // Without the company's cars (no directory): the cars with work, as before.
  assert.deepEqual([...(await h.page.libraryPage(h.ctx,h.q())).cars],['Demo Hatch','Demo Saloon','Demo SUV','Sample 5']);
  // carList on its own.
  assert.deepEqual([...h.page.carList(['IM 6',' IM 5 ',''],['IM IM 6','IM 5'])],['IM 5','IM 6']);
  assert.deepEqual([...h.page.carList(null,[])],[]);
 }finally{h.close()}
});

test('until the company’s older work is indexed (0009), the library shows the older feed',async()=>{
 const h=await harness(20);
 try{
  h.sql.prepare('DELETE FROM library_backfills').run();
  await assert.rejects(()=>h.page.libraryPage(h.ctx,h.q()),/group 1 feed/);
 }finally{h.close()}
});
