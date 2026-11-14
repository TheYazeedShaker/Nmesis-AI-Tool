import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const scope=vm.createContext({Response,console:{error(){}},Error});
const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../lib/studio-server.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context:scope});
class PlanError extends Error{}
const imports={'@/lib/portable/tenancy':{userPrefix:()=>''},'@/lib/portable/database':{getDatabase:()=>undefined},'@/lib/portable/storage':{getStorage:()=>undefined},'@/lib/studio-context':{getStudioContext:async()=>({ok:false,problem:'signed_out'})},'@/lib/accounts/plan':{checkRoute:()=>{},PlanError},'@/lib/auth/words':{NO_COMPANY:''},'@/lib/secret-crypto':{keySecretState:()=>({value:undefined,misconfigured:false}),KeyStorageMisconfigured:class extends Error{}},'@/lib/provider-credit':await import('../lib/provider-credit.ts'),'@/lib/accounts/context':{MFA_REQUIRED:''}};
await m.link(s=>new vm.SyntheticModule(Object.keys(imports[s]),function(){for(const [k,v] of Object.entries(imports[s]))this.setExport(k,v)},{context:scope}));await m.evaluate();
const error=(status,body)=>m.namespace.providerError(Response.json({error:body},{status}));
test('image failures distinguish invalid keys, missing permissions, model access, quota and rate limits',async()=>{
 assert.match((await error(401,{code:'invalid_api_key'})).message,/reconnect an active key/);
 assert.match((await error(403,{message:'Missing scopes: api.images.write',code:'insufficient_permissions'})).message,/api.images.write/);
 assert.match((await error(404,{code:'model_not_found'})).message,/model is unavailable/);
 assert.equal((await error(429,{code:'insufficient_quota',message:'You exceeded your current quota, please check your plan and billing details.'})).message,'Your OpenAI account has no credit left. Add credit at OpenAI, then try again. Nothing was charged here.');
 assert.equal((await error(429,{code:'insufficient_quota'})).status,402);
 assert.match((await error(400,{code:'billing_hard_limit_reached',message:'Billing hard limit has been reached'})).message,/^Your OpenAI account has no credit left/);
 assert.match((await error(403,{message:'Your billing is not active.'})).message,/^Your OpenAI account has no credit left/);
 assert.match((await error(429,{code:'rate_limit_exceeded'})).message,/temporarily rate-limited/);
});
test('provider diagnostics redact keys, bearer credentials and URLs before display',async()=>{
 const e=await error(403,{message:'key sk-proj-secret123 Bearer private-secret https://example.com/?key=secret'});assert(!e.message.includes('secret'));assert.match(e.message,/\[redacted\]/);
});
