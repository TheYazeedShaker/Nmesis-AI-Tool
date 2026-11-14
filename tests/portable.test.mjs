import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import * as s3 from '@aws-sdk/client-s3';
import * as signing from '@aws-sdk/s3-request-presigner';
async function moduleAt(path,imports={},extra={}){
 const scope=vm.createContext({Buffer,Response,Request,Headers,Blob,File,FormData,ReadableStream,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,Date,Math,Number,Error,JSON,console,crypto,process:{env:{KEY_ENCRYPTION_SECRET:'ab'.repeat(32)}},...extra});
 const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=new vm.SourceTextModule(code,{context:scope});await m.link(s=>{assert.ok(imports[s],`Missing import ${s}`);return new vm.SyntheticModule(Object.keys(imports[s]),function(){for(const [k,v] of Object.entries(imports[s]))this.setExport(k,v)},{context:scope})});await m.evaluate();return m.namespace;
}
class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
// A stand-in for the `postgres` client: runs the translated statement ($n → ?n) on SQLite.
function sqliteSql(){const db=new DatabaseSync(':memory:');const calls=[];const sql={db,calls,unsafe:async(text,args=[])=>{calls.push({text,args});const st=db.prepare(text.replace(/\$(\d+)/g,'?$1'));if(st.columns().length){const rows=st.all(...args);rows.count=rows.length;return rows}const rows=[];rows.count=Number(st.run(...args).changes);return rows},begin:async fn=>{calls.push({text:'BEGIN'});db.exec('BEGIN');try{const out=await fn(sql);db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};return sql}
const postgresStub={default:()=>{throw new Error('No network in tests')}};
test('placeholders become $1…$n once per statement, never inside literals, identifiers or comments',async()=>{
 const {toPositional}=await moduleAt('lib/portable/database.ts',{'postgres':postgresStub});
 assert.equal(toPositional("SELECT * FROM t WHERE a=? AND b='?' AND c=\"?x\" AND d=?"),"SELECT * FROM t WHERE a=$1 AND b='?' AND c=\"?x\" AND d=$2");
 assert.equal(toPositional("SELECT 'it''s ?' AS x, ? -- why?\n, ? /* ? */ , ?"),"SELECT 'it''s ?' AS x, $1 -- why?\n, $2 /* ? */ , $3");
 assert.equal(toPositional('SELECT 1'),'SELECT 1');
 const {RESERVE_FILM_SQL,RESERVE_SWAP_SQL,RESERVE_IMAGE_SQL}=await import('../lib/film-policy.ts');
 for(const [sql,n] of [[RESERVE_FILM_SQL,8],[RESERVE_SWAP_SQL,8],[RESERVE_IMAGE_SQL,7]]){const out=toPositional(sql);assert.equal(out.includes('?'),false);assert.ok(out.includes('$'+n)&&!out.includes('$'+(n+1)))}
});
test('portable SQL adapter preserves rows, bind isolation, changes and transactional batches',async()=>{
 const sql=sqliteSql();try{
 const {StudioDatabase}=await moduleAt('lib/portable/database.ts',{'postgres':postgresStub});const db=new StudioDatabase(sql);
 sql.db.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY, owner TEXT, status TEXT, note TEXT)');
 const insert=db.prepare('INSERT INTO jobs VALUES(?,?,?,?)');await insert.bind('job','owner','draft',undefined).run();
 assert.equal(sql.calls.at(-1).text,'INSERT INTO jobs VALUES($1,$2,$3,$4)');assert.deepEqual([...sql.calls.at(-1).args],['job','owner','draft',null]);
 const lock=()=>db.prepare("UPDATE jobs SET status='submitted' WHERE id=? AND owner=? AND status='draft'").bind('job','owner').run();
 const first=await lock(),second=await lock();assert.equal(first.meta.changes,1);assert.equal(second.meta.changes,0);assert.equal(first.success,true);assert.equal(first.meta.last_row_id,0);
 assert.equal(await db.prepare('SELECT * FROM jobs WHERE owner=?').bind('other').first(),null);
 assert.equal((await db.prepare('SELECT * FROM jobs').all()).results[0].status,'submitted');
 assert.equal(await db.prepare('SELECT status FROM jobs').first('status'),'submitted');
 const results=await db.batch([db.prepare("UPDATE jobs SET note='a' WHERE id=?").bind('job'),db.prepare("UPDATE jobs SET status='done' WHERE id=?").bind('job')]);
 assert.deepEqual([...results.map(r=>r.meta.changes)],[1,1]);assert.ok(sql.calls.some(c=>c.text==='BEGIN'));
 await assert.rejects(()=>db.batch([db.prepare("UPDATE jobs SET note='b' WHERE id=?").bind('job'),db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').bind('job','x','y','z')]));
 assert.equal(await db.prepare('SELECT note FROM jobs WHERE id=?').bind('job').first('note'),'a');
 }finally{sql.db.close()}
});
test('storage adapter handles streamed bytes, conditional writes, listing and missing objects',async()=>{
 const calls=[];const client={send:async cmd=>{calls.push(cmd);if(cmd instanceof s3.HeadObjectCommand){const e=new Error('Missing');e.$metadata={httpStatusCode:404};throw e}if(cmd instanceof s3.PutObjectCommand){if(cmd.input.IfNoneMatch){const e=new Error('Conflict');e.$metadata={httpStatusCode:412};throw e}return {ETag:'"abc"'}}if(cmd instanceof s3.ListObjectsV2Command)return {Contents:[{Key:'owner/a',Size:4,ETag:'"abc"'}],IsTruncated:true,NextContinuationToken:'next'};if(cmd instanceof s3.GetObjectCommand)return {ETag:'"abc"',ContentLength:4,ContentType:'image/png',Body:{transformToWebStream:()=>new Response('test').body}};return {}}};
 const {StudioBucket}=await moduleAt('lib/portable/storage.ts',{'@aws-sdk/client-s3':s3,'@aws-sdk/s3-request-presigner':signing});const store=new StudioBucket(client,'private');
 assert.equal(await store.head('absent'),null);assert.equal(await store.put('lock','x',{onlyIf:{etagDoesNotMatch:'*'}}),null);
 await store.put('video',new Response('bytes').body,{httpMetadata:{contentType:'video/mp4'},onlyIf:{etagMatches:'old'}});const put=calls.at(-1).input;assert.equal(Buffer.from(put.Body).toString(),'bytes');assert.equal(put.IfMatch,'"old"');
 const object=await store.get('image',{range:{offset:2,length:4}});assert.equal(await object.text(),'test');assert.equal(calls.at(-1).input.Range,'bytes=2-5');assert.equal(object.etag,'abc');
 const list=await store.list({prefix:'owner/',cursor:'old'});assert.equal(list.cursor,'next');assert.equal(list.objects[0].key,'owner/a');
 await store.delete('old');assert.equal(calls.at(-1).input.Key,'old');
});
test('upload tickets are owner-bound, route-bound, expire, reject tampering, and reconstruct large multipart bodies',async()=>{
 const form=new FormData();form.set('instruction','Edit only this area');form.set('working',new Blob([new Uint8Array(5_000_000)],{type:'image/png'}),'frame.png');const multipart=new Response(form),bytes=await multipart.arrayBuffer();let deleted=false;
 const store={head:async()=>({size:bytes.byteLength}),get:async()=>({body:new Response(bytes).body}),delete:async()=>{deleted=true}};
 const api=await moduleAt('lib/portable/uploads.ts',{'node:crypto':crypto,'./storage':{getStorage:()=>store},'@/lib/studio-server':{StudioError},'@/lib/secret-crypto':{keySecretState:()=>({value:'ab'.repeat(32),misconfigured:false}),KEY_STORAGE_MISCONFIGURED:'Secure key storage is misconfigured.'}});
 const data={key:'staging/owner/uploads/example',prefix:'owner/',target:'/api/area-edits',size:bytes.byteLength,type:multipart.headers.get('content-type'),expires:Date.now()+60000};const ticket=api.signTicket(data);
 assert.equal(api.verifyTicket(ticket,'owner/','/api/area-edits').key,data.key);
 assert.throws(()=>api.verifyTicket(ticket,'other/','/api/area-edits'));
 assert.throws(()=>api.verifyTicket(ticket,'owner/','/api/assets'));
 assert.throws(()=>api.verifyTicket(ticket+'x','owner/','/api/area-edits'));
 assert.throws(()=>api.verifyTicket(api.signTicket({...data,expires:0}),'owner/','/api/area-edits'));
 assert.equal(api.uploadTarget('/api/connection'),false);
 const originalTarget='/api/assets/reference-123/original';assert.equal(api.uploadTarget(originalTarget),true);assert.equal(api.uploadTarget('/api/assets/../credentials/original'),false);const originalTicket=api.signTicket({...data,target:originalTarget});assert.equal(api.verifyTicket(originalTicket,'owner/',originalTarget).target,originalTarget);assert.throws(()=>api.verifyTicket(originalTicket,'other/',originalTarget));assert.throws(()=>api.verifyTicket(originalTicket,'owner/','/api/assets/another-123/original'));
 const request=()=>new Request('https://studio.test/api/area-edits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadToken:ticket})});
 await assert.rejects(()=>api.readStudioForm(request(),{prefix:'owner/'},4_000_000));assert.equal(deleted,false);
 const reconstructed=await api.readStudioForm(request(),{prefix:'owner/'},45_000_000);assert.equal(reconstructed.get('instruction'),'Edit only this area');assert.equal(reconstructed.get('working').size,5_000_000);assert.equal(deleted,true);
});
for(const target of ['/api/assets','/api/assets/reference-123/original'])test('browser upload sends large files directly to storage for '+target,async()=>{
 const calls=[];const mock=async(url,init)=>{calls.push({url,init});return calls.length===1?Response.json({url:'https://bucket.test/upload',token:'signed-ticket'}):calls.length===2?new Response(null,{status:200}):Response.json({visual:{id:'ready'}})};
 const {studioFetch}=await moduleAt('lib/studio-fetch.ts',{}, {fetch:mock,window:{location:{origin:'https://studio.test'}}});const form=new FormData();form.set('image',new Blob([new Uint8Array(5_000_000)]),'frame.png');
 await studioFetch(target,{method:target.endsWith('/original')?'PUT':'POST',body:form});assert.equal(calls.length,3);assert.equal(calls[1].url,'https://bucket.test/upload');assert.equal(calls[1].init.credentials,'omit');assert.equal(calls[1].init.body.size>5_000_000,true);assert.equal(calls[2].url,target);assert.equal(calls[2].init.method,target.endsWith('/original')?'PUT':'POST');assert.equal(calls[2].init.body,JSON.stringify({uploadToken:'signed-ticket'}));
});
test('identity comes only from a Supabase session verified on the server; no session or no company means no access',async()=>{
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'Person@Example.test',app_metadata:{}};let answer={data:{user},error:null},configured=true;const seen=[];
 const imports={'next/headers':{cookies:async()=>({get:n=>n==='studio_org'?{value:'chosen-org'}:undefined})},
  '@/lib/auth/supabase':{authConfigured:()=>configured,verifiedUser:async()=>answer.error||!answer.data.user?null:{id:answer.data.user.id,email:answer.data.user.email.toLowerCase(),appMetadata:answer.data.user.app_metadata,aal:'aal1',totp:false}},
  '@/lib/accounts/directory':{getDirectory:()=>({})},
  '@/lib/accounts/context':{resolveContext:async a=>{seen.push(a);return a.user.id===user.id?{ok:true,ctx:{user:a.user}}:{ok:false,reason:'no_company'}}}};
 const m=await moduleAt('lib/studio-context.ts',imports),plain=v=>JSON.parse(JSON.stringify(v));// objects from the module's own context
 assert.equal((await m.getStudioContext()).ok,true);assert.deepEqual(plain(seen[0]),{user:{id:user.id,email:'person@example.test',aal:'aal1'},chosenOrg:'chosen-org',directory:{}});
 // A revoked session still carries a well-formed token; Supabase says so and access ends.
 answer={data:{user:null},error:{code:'session_not_found',message:'Session from session_id claim in JWT does not exist'}};assert.deepEqual(plain(await m.getStudioContext()),{ok:false,problem:'signed_out'});
 answer={data:{user:{...user,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}},error:null};assert.deepEqual(plain(await m.getStudioContext()),{ok:false,problem:'no_company'});
 configured=false;assert.deepEqual(plain(await m.getStudioContext()),{ok:false,problem:'not_configured'});
});
test('S3 conditional writes: If-Match carries the ETag, If-None-Match only "*", and 412/409 mean "not written"',async()=>{
 const calls=[];let fail=0;const client={send:async cmd=>{calls.push(cmd);if(fail){const e=new Error('Precondition');e.$metadata={httpStatusCode:fail};throw e}return {ETag:'"new"'}}};
 const {StudioBucket}=await moduleAt('lib/portable/storage.ts',{'@aws-sdk/client-s3':s3,'@aws-sdk/s3-request-presigner':signing});const store=new StudioBucket(client,'private');
 assert.deepEqual({...await store.put('lock','x',{onlyIf:{etagDoesNotMatch:'*'}})},{key:'lock',etag:'new',size:1});assert.equal(calls.at(-1).input.IfNoneMatch,'*');assert.equal(calls.at(-1).input.IfMatch,undefined);
 await store.put('cache','y',{onlyIf:{etagMatches:'abc'}});assert.equal(calls.at(-1).input.IfMatch,'"abc"');assert.equal(calls.at(-1).input.IfNoneMatch,undefined);
 fail=412;assert.equal(await store.put('lock','x',{onlyIf:{etagDoesNotMatch:'*'}}),null);assert.equal(await store.put('cache','y',{onlyIf:{etagMatches:'stale'}}),null);
 fail=409;assert.equal(await store.put('lock','x',{onlyIf:{etagDoesNotMatch:'*'}}),null);
 fail=500;await assert.rejects(()=>store.put('lock','x',{onlyIf:{etagDoesNotMatch:'*'}}));
 fail=0;const before=calls.length;await assert.rejects(()=>store.put('lock','x',{onlyIf:{etagDoesNotMatch:'abc'}}),/create-if-absent/);assert.equal(calls.length,before);
});
test('storage defaults to AWS S3: region required, no custom endpoint, virtual-hosted addresses',async()=>{
 const {storageClient,getStorage}=await moduleAt('lib/portable/storage.ts',{'@aws-sdk/client-s3':s3,'@aws-sdk/s3-request-presigner':signing},{process:{env:{S3_BUCKET:'example-bucket',S3_ACCESS_KEY_ID:'AKIDEXAMPLE',S3_SECRET_ACCESS_KEY:'example-secret'}}});
 assert.equal(getStorage(),undefined);
 const env={S3_REGION:'eu-central-1',S3_ACCESS_KEY_ID:'AKIDEXAMPLE',S3_SECRET_ACCESS_KEY:'example-secret',S3_FORCE_PATH_STYLE:'true'};
 const aws=storageClient(env);assert.equal(aws.config.isCustomEndpoint,false);assert.equal(aws.config.forcePathStyle,false);assert.equal(await aws.config.region(),'eu-central-1');
 const {StudioBucket}=await moduleAt('lib/portable/storage.ts',{'@aws-sdk/client-s3':s3,'@aws-sdk/s3-request-presigner':signing});
 const url=new URL(await new StudioBucket(aws,'example-bucket').uploadUrl('staging/probe','image/png',4));assert.equal(url.host,'example-bucket.s3.eu-central-1.amazonaws.com');assert.equal(url.pathname,'/staging/probe');
 const local=storageClient({...env,S3_ENDPOINT:'http://127.0.0.1:9000'});assert.equal(local.config.isCustomEndpoint,true);assert.equal(local.config.forcePathStyle,true);
});
test('one helper builds every org-scoped storage prefix and rejects anything else',async()=>{
 const t=await moduleAt('lib/portable/tenancy.ts');const hash='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org='0000000a-0000-4000-8000-00000000000a';
 assert.equal(t.userPrefix(org,hash),'orgs/'+org+'/users/'+hash+'/');assert.equal(t.userOf(t.userPrefix(org,hash)),hash);assert.throws(()=>t.userPrefix(org,'a'.repeat(64)),/Invalid/);
 assert.equal(t.orgKeysPrefix(org),'orgs/'+org+'/keys/');assert.equal(t.orgOf(t.orgKeysPrefix(org)),org);assert.equal(t.isUserPrefix(t.orgKeysPrefix(org)),false);assert.equal(t.orgOf(t.userPrefix('client-2',hash)),'client-2');
 assert.equal(t.isUserPrefix('orgs/nmesis/users/'+hash+'/'),true);assert.equal(t.isUserPrefix('users/'+hash+'/'),false);assert.equal(t.isUserPrefix('orgs/../users/'+hash+'/'),false);
 assert.throws(()=>t.userPrefix('Bad Org',hash));assert.throws(()=>t.userPrefix('nmesis','../x'));assert.throws(()=>t.orgOf('users/'+hash+'/'));assert.throws(()=>t.orgKey('../x','y'));
 assert.equal(t.orgKey('nmesis','keys/x.json'),'orgs/nmesis/keys/x.json');
});
