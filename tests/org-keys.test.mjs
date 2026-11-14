// Company keys (lib/org-keys.ts) replace the old email-based sponsorship: one key
// place per company, managed by its owners when the plan includes studio.own_keys.
import test from 'node:test';import assert from 'node:assert/strict';
import {register} from 'node:module';
register('../scripts/verify/hooks.mjs',import.meta.url);
const {keyAccess,keysPrefix,credentialContext}=await import('../lib/org-keys.ts');
const legacy={legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}};
const plan=(own)=>({legacy:false,status:'active',planId:'p',planName:'P',endsOn:null,features:{'studio.enabled':true,'studio.own_keys':own}});
const ctx=(role,entitlements,org='0000000a-0000-4000-8000-00000000000a')=>({org,role,entitlements,prefix:`orgs/${org}/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/`});
test('only a company owner manages keys, and only when the plan includes own keys',()=>{
 assert.deepEqual(keyAccess(ctx('owner',legacy)),{own:true,manage:true});
 assert.deepEqual(keyAccess(ctx('creator',legacy)),{own:true,manage:false});
 assert.deepEqual(keyAccess(ctx('viewer',plan(true))),{own:true,manage:false});
 assert.deepEqual(keyAccess(ctx('owner',plan(false))),{own:false,manage:false});
 assert.deepEqual(keyAccess(ctx('owner',{...plan(true),status:'ended'})),{own:false,manage:false});
});
test('the key place is the company\'s, never a person\'s, and absent without own keys',async()=>{
 const c=ctx('creator',legacy);
 assert.equal(keysPrefix(c),'orgs/0000000a-0000-4000-8000-00000000000a/keys/');
 assert.equal((await credentialContext(c)).prefix,'orgs/0000000a-0000-4000-8000-00000000000a/keys/');
 assert.equal((await credentialContext(ctx('owner',plan(false)))),null);
 assert.notEqual(keysPrefix(ctx('owner',legacy,'0000000b-0000-4000-8000-00000000000b')),keysPrefix(c),'companies never share a key place');
});
