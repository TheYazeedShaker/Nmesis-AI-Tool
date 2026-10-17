import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {testDatabase} from './helpers/pg.mjs';
import {StudioDatabase,toPositional} from '../lib/portable/database.ts';
import {RESERVE_FILM_SQL,RESERVE_SWAP_SQL,RESERVE_IMAGE_SQL} from '../lib/film-policy.ts';
import * as s3 from '@aws-sdk/client-s3';
import * as signing from '@aws-sdk/s3-request-presigner';
async function moduleAt(path,imports={},extra={}){
 const scope=vm.createContext({Buffer,Response,Request,Headers,Blob,File,FormData,ReadableStream,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,Date,Math,Number,Error,JSON,console,crypto,process:{env:{KEY_ENCRYPTION_SECRET:'test-encryption-secret-32-characters-only'}},...extra});
 const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=new vm.SourceTextModule(code,{context:scope});await m.link(s=>{assert.ok(imports[s],`Missing import ${s}`);return new vm.SyntheticModule(Object.keys(imports[s]),function(){for(const [k,v] of Object.entries(imports[s]))this.setExport(k,v)},{context:scope})});await m.evaluate();return m.namespace;
}
class StudioError extends Error{constructor(message,status=400){super(message);this.status=status}}
test('portable SQL adapter preserves rows, bind isolation and atomic job reservation on Postgres',async()=>{
 const t=await testDatabase();try{const db=t.db;
 await t.pg.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY, owner TEXT, status TEXT)');
 await db.prepare('INSERT INTO jobs VALUES(?,?,?)').bind('job','owner','draft').run();
 const lock=()=>db.prepare("UPDATE jobs SET status='submitted' WHERE id=? AND owner=? AND status='draft'").bind('job','owner').run();
 const first=await lock(),second=await lock();assert.equal(first.meta.changes,1);assert.equal(second.meta.changes,0);
 assert.equal(await db.prepare('SELECT * FROM jobs WHERE owner=?').bind('other').first(),null);
 assert.equal((await db.prepare('SELECT * FROM jobs').all()).results[0].status,'submitted');
 assert.equal(await db.prepare('SELECT status FROM jobs').first('status'),'submitted');
 await db.prepare('INSERT INTO jobs VALUES(?,?,?)').bind('maybe',undefined,'it?s').run();
 assert.deepEqual(await db.prepare("SELECT owner, status, 'literal ?' AS q FROM jobs WHERE id=?").bind('maybe').first(),{owner:null,status:'it?s',q:'literal ?'});
 }finally{await t.close()}
});
test('placeholder rewriting skips literals and comments; serialized statements take the advisory lock first',async()=>{
 assert.equal(toPositional("SELECT ? , '?' , \"a?\" -- ?\n /* ? */ ?::bigint"),"SELECT $1 , '?' , \"a?\" -- ?\n /* ? */ $2::bigint");
 assert.throws(()=>toPositional("SELECT 'open"));
 const log=[];const executor={async query(text){log.push(text);return{rows:[],changes:1}},async transaction(fn){log.push('BEGIN');const r=await fn(executor);log.push('COMMIT');return r}};
 const db=new StudioDatabase(executor);
 await db.prepare('UPDATE t SET a=? WHERE b=?').bind(1,2).run();
 assert.deepEqual(log,['UPDATE t SET a=$1 WHERE b=$2']);log.length=0;
 await db.prepare('/*serialize:budget*/ UPDATE t SET a=?').bind(1).run();
 assert.deepEqual(log,['BEGIN','SELECT pg_advisory_xact_lock(hashtext($1))','/*serialize:budget*/ UPDATE t SET a=$1','COMMIT']);
 for(const sql of [RESERVE_FILM_SQL,RESERVE_SWAP_SQL,RESERVE_IMAGE_SQL])assert.match(sql,/^\/\*serialize:budget\*\//);
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
 const api=await moduleAt('lib/portable/uploads.ts',{'node:crypto':crypto,'./storage':{getStorage:()=>store},'@/lib/studio-server':{StudioError}});
 const data={key:'staging/owner/uploads/example',prefix:'owner/',target:'/api/area-edits',size:bytes.byteLength,type:multipart.headers.get('content-type'),expires:Date.now()+60000};const ticket=api.signTicket(data);
 assert.equal(api.verifyTicket(ticket,'owner/','/api/area-edits').key,data.key);
 assert.throws(()=>api.verifyTicket(ticket,'other/','/api/area-edits'));
 assert.throws(()=>api.verifyTicket(ticket,'owner/','/api/assets'));
 assert.throws(()=>api.verifyTicket(ticket+'x','owner/','/api/area-edits'));
 assert.throws(()=>api.verifyTicket(api.signTicket({...data,expires:0}),'owner/','/api/area-edits'));
 assert.equal(api.uploadTarget('/api/connection'),false);
 const request=()=>new Request('https://studio.test/api/area-edits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadToken:ticket})});
 await assert.rejects(()=>api.readStudioForm(request(),{prefix:'owner/'},4_000_000));assert.equal(deleted,false);
 const reconstructed=await api.readStudioForm(request(),{prefix:'owner/'},45_000_000);assert.equal(reconstructed.get('instruction'),'Edit only this area');assert.equal(reconstructed.get('working').size,5_000_000);assert.equal(deleted,true);
});
test('browser upload sends large files to storage and only a ticket to the generation route',async()=>{
 const calls=[];const mock=async(url,init)=>{calls.push({url,init});return calls.length===1?Response.json({url:'https://bucket.test/upload',token:'signed-ticket'}):calls.length===2?new Response(null,{status:200}):Response.json({visual:{id:'ready'}})};
 const {studioFetch}=await moduleAt('lib/studio-fetch.ts',{}, {fetch:mock,window:{location:{origin:'https://studio.test'}}});const form=new FormData();form.set('image',new Blob([new Uint8Array(5_000_000)]),'frame.png');
 await studioFetch('/api/assets',{method:'POST',body:form});assert.equal(calls.length,3);assert.equal(calls[1].url,'https://bucket.test/upload');assert.equal(calls[1].init.credentials,'omit');assert.equal(calls[1].init.body.size>5_000_000,true);assert.equal(calls[2].url,'/api/assets');assert.equal(calls[2].init.body,JSON.stringify({uploadToken:'signed-ticket'}));
});
test('portable identity uses a verified session and denies removed users; no provider credentials means signed out',async()=>{
 const imports={'next-auth':{getServerSession:async()=>({user:{email:'Owner@Example.test',name:'Owner'}})},'next/navigation':{redirect:()=>{throw new Error('redirect')}},'@/lib/portable/auth-options':{authOptions:{},allowedEmail:email=>email==='owner@example.test'}};
 let auth=await moduleAt('app/chatgpt-auth.ts',imports);assert.equal(await auth.getChatGPTUser(),null);
 auth=await moduleAt('app/chatgpt-auth.ts',imports,{process:{env:{NEXTAUTH_SECRET:'test',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'}}});const user=await auth.getChatGPTUser();assert.equal(user.email,'owner@example.test');assert.equal(user.userId,'google-email:owner@example.test');
 imports['@/lib/portable/auth-options'].allowedEmail=()=>false;
 auth=await moduleAt('app/chatgpt-auth.ts',imports,{process:{env:{NEXTAUTH_SECRET:'test',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'}}});assert.equal(await auth.getChatGPTUser(),null);
 assert.equal(auth.chatGPTSignInPath('//evil.test'),'/api/auth/signin?callbackUrl=%2F');
});
