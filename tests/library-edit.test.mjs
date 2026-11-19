import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {studioSchemaSql,userPrefix,MEMBER,ORG} from './sqlite-schema.mjs';
import {tsxLoader,rootPath} from './support/load-tsx.mjs';

// Edit from Projects (fix/library-edit). The library keys each item by its kind
// and id together ("visual:<id>"); the editor takes the raw id, and Edit once
// sent it the key, which it refused. Here: real library items (lib/library-page.ts
// on the real schema in SQLite, as /api/library answers) go through the real
// toWork (components/workspace/data.ts) and the library's Edit (editLink), and
// nothing but editorHref may build the editor's address.

const load=tsxLoader();
const {toWork}=load('components/workspace/data.ts');
const {editLink}=load('components/workspace/library.tsx');
const {editorHref}=load('components/canvas/open-in-editor.tsx');
const {workKey,workRef,viewerHref,VISUAL_ID}=load('lib/work-ref.ts');
const {CANT_OPEN,linkProblem,answerProblem}=load('lib/editor/cant-open.ts');

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const compile=f=>ts.transpileModule(readFileSync(new URL('../lib/'+f,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
/** The library on the real schema (the harness of tests/library-page.test.mjs), with one of each kind. */
async function libraryItems(){
 const sql=new DatabaseSync(':memory:');sql.exec(studioSchemaSql());
 const db={prepare(query){let args=[];return{bind(...values){args=values.map(v=>v===undefined?null:v);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:{changes:sql.prepare(query).run(...args).changes}}}}}};
 class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const store={async downloadUrl(k){return 'https://signed.example.test/'+k+'?sig=1'},async head(){return null},async get(){return null},async put(){},async list(){return{objects:[]}}};
 const sandbox=vm.createContext({console,Date,JSON,Promise,Math,Number,String,Map,Set});
 const stubs={
  './studio-server':{StudioError,validId:x=>typeof x==='string'&&/^[a-z0-9-]{8,80}$/.test(x),bucket:x=>x},
  './film-server':{database:c=>c.DB},
  './trash-ready':{foldersReady:async()=>true},
  './library':{companyLibrary:async()=>{throw new Error('the index answers')}},
 };
 const mods={};
 const link=async name=>{
  if(stubs[name])return new vm.SyntheticModule(Object.keys(stubs[name]),function(){for(const [k,v] of Object.entries(stubs[name]))this.setExport(k,v)},{context:sandbox});
  if(mods[name])return mods[name];
  const m=new vm.SourceTextModule(compile(name.replace('./','')+'.ts'),{context:sandbox});mods[name]=m;await m.link(link);return m;
 };
 const page=await link('./library-page');await page.evaluate();const index=mods['./library-index'].namespace;
 const me=userPrefix('a'),colleague=userPrefix('b'),t0=1_700_000_000_000;
 const work=[
  ['keyVisual','visual',1,me,'Key visual','ready'],['lineUp','visual',2,me,'Line-up','ready'],['colleague','visual',3,colleague,'Key visual','ready'],
  ['colleagueLineUp','visual',4,colleague,'Line-up','ready'],['working','visual',5,me,'Key visual','working'],['failed','visual',6,me,'Key visual','failed'],
  ['film','film',7,me,'Film','ready'],['swap','swap',8,me,'Car swap','ready'],['story','story',9,me,'Story','ready'],['deleted','visual',10,me,'Key visual','ready'],
 ];
 for(const [name,kind,n,owner,tool,status] of work)await index.indexItem({DB:db,org:ORG},{kind,id:uuid(n),owner,title:`Demo SUV · ${name}`,tool,car:'Demo SUV',status,assetId:'asset-'+n,createdAt:t0+n*1000,deletedAt:name==='deleted'?t0:null},t0);
 // This company's older work is indexed (0009): the page answers from the index alone.
 sql.prepare('INSERT INTO library_backfills(org_id,started_at,done_at) VALUES(?,1,2)').run(ORG);
 const ctx={DB:db,BUCKET:store,prefix:me,...MEMBER,role:'creator'};
 const q=(p={})=>({place:'all',tool:null,car:null,who:null,q:null,sort:'new',offset:0,limit:40,...p});
 const all=[...(await page.namespace.libraryPage(ctx,q())).items,...(await page.namespace.libraryPage(ctx,q({place:'deleted'}))).items];
 sql.close();
 return Object.fromEntries(work.map(([name,,n])=>[name,all.find(i=>i.id===uuid(n))]));
}

test('Edit on a real library item opens /editor?visual=<its id>: a key visual, a line-up, a colleague’s picture',async()=>{
 const items=await libraryItems();
 for(const name of ['keyVisual','lineUp','colleague','colleagueLineUp']){
  const page=items[name];assert.ok(page,`${name} is in the library`);
  const item=toWork(page);
  assert.equal(item.id,`visual:${page.id}`,'the library still keys the item by kind and id');
  assert.deepEqual(item.ref,{kind:'visual',id:page.id},'and carries the raw id beside it');
  const href=editLink(item);
  assert.equal(href,`/editor?visual=${page.id}`,`${name}: Edit opens the editor on the picture itself`);
  const id=new URL(href,'http://studio.test').searchParams.get('visual');
  assert.match(id,VISUAL_ID,'an id the editor and /api/visuals/<id> accept');
  assert.equal(linkProblem(id),null,'the editor takes it as a link to a picture');
 }
 assert.equal(toWork(items.colleague).person,'A teammate');
 assert.equal(toWork(items.lineUp).status?.label,'Line-up','a line-up shows its tool’s label, and that label is not a state');
});

test('only a finished visual has Edit: never a film, a swap, a story, unfinished or deleted work',async()=>{
 const items=await libraryItems();
 for(const name of ['film','swap','story','working','failed','deleted'])assert.equal(editLink(toWork(items[name])),null,`${name} has no Edit`);
 for(const kind of ['film','swap','story'])assert.equal(editorHref(kind,uuid(1)),null,`editorHref gives a ${kind} no address`);
 // The bug: the library's key is not an id. editorHref refuses it, and so does the editor.
 assert.equal(editorHref('visual',`visual:${uuid(1)}`),null);
 assert.equal(linkProblem(`visual:${uuid(1)}`),'link');
});

test('the library’s key is built and read in one place; routes and links get the kind and raw id',()=>{
 const r={kind:'visual',id:uuid(1)};
 assert.equal(workKey(r),`visual:${uuid(1)}`);
 assert.deepEqual(workRef(workKey(r)),r);
 for(const kind of ['film','swap','story'])assert.deepEqual(workRef(`${kind}:${uuid(2)}`),{kind,id:uuid(2)});
 for(const bad of [uuid(1),'visual:','image:'+uuid(1),':'+uuid(1),''])assert.equal(workRef(bad),null,`"${bad}" is not a library key`);
 assert.equal(new URL(viewerHref(r),'http://studio.test').searchParams.get('open'),`visual:${uuid(1)}`,'Projects opens its viewer on the key');
 const data=readFileSync(new URL('../components/workspace/data.ts',import.meta.url),'utf8');
 assert.match(data,/id:workKey\(i\),ref:\{kind:i\.kind,id:i\.id\}/,'toWork builds the key and keeps the raw id');
 assert.match(data,/for\(const \{kind,id\} of refs\(ids\)\)/,'delete and restore send each kind and raw id');
 assert.match(data,/\{items:refs\(ids\),folderId\}/,'Move sends kinds and raw ids');
 assert.doesNotMatch(data,/indexOf\(':'\)/,'no second parser of the key');
 // The editor's way back opens the picture in Projects (the viewer is keyed by "visual:<id>", not the raw id).
 const editor=readFileSync(new URL('../components/canvas/editor-page.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(editor,/'\/library\?open='\+/,'no hand-built viewer link in the editor');
 assert.equal((editor.match(/viewerHref\(\{kind:'visual',id[:}]/g)||[]).length,3,'Back to the picture, the phone note and Open in Projects');
 const home=readFileSync(new URL('../components/workspace/pages.tsx',import.meta.url),'utf8');
 assert.match(home,/href:i\.kind==='image'\?viewerHref\(i\.ref\):i\.href/,'Home’s recent work opens in Projects through the same link');
});

// ── Nothing but editorHref builds the editor's address ─────────────────────
/** Every string or template piece in a file that names the editor's address. */
function editorAddresses(file,text){
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/\.tsx$/.test(file)?ts.ScriptKind.TSX:/\.m?js$/.test(file)?ts.ScriptKind.JS:ts.ScriptKind.TS);
 const found=[];
 const visit=node=>{
  if((ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))&&/\/editor\?|editor\?visual/.test(node.text))
   found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
  ts.forEachChild(node,visit);
 };
 visit(source);
 return found;
}
const ONLY='components/canvas/open-in-editor.tsx';
function sources(dir){
 return readdirSync(path.join(rootPath,dir)).flatMap(name=>{
  const rel=dir+'/'+name;
  if(statSync(path.join(rootPath,rel)).isDirectory())return sources(rel);
  return /\.(tsx?|m?js)$/.test(name)?[rel]:[];
 });
}

test('the guard finds a hand-built editor address in code, not in comments',()=>{
 assert.deepEqual(editorAddresses('x.tsx',"router.push('/editor?visual='+id)"),['x.tsx:1']);
 assert.deepEqual(editorAddresses('x.tsx','const a=`/editor?visual=${id}`;'),['x.tsx:1']);
 assert.deepEqual(editorAddresses('x.tsx','<Link href="/editor?visual=abc"/>'),['x.tsx:1']);
 assert.deepEqual(editorAddresses('x.tsx','// opens /editor?visual=<id>\n/* /editor?visual= */ const b=1;'),[]);
});

test('nothing in the Studio builds /editor?visual= by hand: only editorHref does',()=>{
 const found=['app','components','lib'].flatMap(sources).filter(f=>f!==ONLY).flatMap(f=>editorAddresses(f,readFileSync(path.join(rootPath,f),'utf8')));
 assert.deepEqual(found,[],'build the editor link with editorHref(kind, id) from components/canvas/open-in-editor.tsx');
 assert.equal(editorAddresses(ONLY,readFileSync(path.join(rootPath,ONLY),'utf8')).length,1,'editorHref is the one place');
 // The tool pages and Projects reach it through the helper.
 for(const f of ['app/key-visual/page.tsx','app/lineup/page.tsx'])assert.match(readFileSync(path.join(rootPath,f),'utf8'),/<OpenInEditor visualId=/,`${f} opens results through OpenInEditor`);
 assert.match(readFileSync(path.join(rootPath,'components/workspace/library.tsx'),'utf8'),/editorHref\(w\.ref\.kind,w\.ref\.id\)/,'Projects’ Edit uses editorHref with the raw id');
});

// ── Why the editor can't open ──────────────────────────────────────────────
test('the editor says which problem it is: a bad link, an unfinished picture, a picture not here, a failed load',()=>{
 for(const bad of [null,'','visual:'+uuid(1),'not an id!','x'])assert.equal(linkProblem(bad),'link');
 assert.equal(linkProblem(uuid(1)),null);
 assert.equal(answerProblem(404,null),'missing','deleted, someone’s “Only me” work, or stored by another Studio');
 assert.equal(answerProblem(200,{status:'pending'}),'pending');
 assert.equal(answerProblem(200,{status:'failed'}),'failed');
 assert.equal(answerProblem(200,{status:'ready'}),null);
 for(const status of [401,403,500,503])assert.equal(answerProblem(status,null),'other');
 assert.equal(answerProblem(200,null),'other');
 assert.equal(CANT_OPEN.missing.title,'This picture isn’t available here');
 const titles=Object.values(CANT_OPEN).map(w=>w.title);
 assert.equal(new Set(titles).size,titles.length,'each case has its own title');
 for(const w of Object.values(CANT_OPEN)){
  assert.doesNotMatch(w.title+w.body,/Choose a picture to edit/,'never as if no picture were chosen');
  assert.doesNotMatch(w.title+w.body,/environment|preview|production|404|error/i,'plain words, no system terms');
 }
 const editor=readFileSync(new URL('../components/canvas/editor-page.tsx',import.meta.url),'utf8');
 assert.match(editor,/answerProblem\(r\.status,d\.visual\)/,'the answer decides the case');
 assert.match(editor,/console\.warn\('\[editor\] the picture did not open',\{problem,reason:/,'the case is logged, never the address');
 assert.match(editor,/problem==='other'&&<Button kind="primary" onClick=\{onRetry\}>Try again<\/Button>/,'a failed load can be tried again');
 assert.doesNotMatch(editor,/Choose a picture to edit/);
});
