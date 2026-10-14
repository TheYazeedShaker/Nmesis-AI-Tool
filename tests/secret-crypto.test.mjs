import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sealKey,unsealKey} from '../lib/secret-crypto.ts';
const secret=randomBytes(32).toString('hex');
const example='synthetic-test-credential';
test('encrypts credentials and recovers only for the original user',async()=>{
 const sealed=await sealKey(example,secret,'user-a');
 assert.equal(JSON.stringify(sealed).includes(example),false);
 assert.equal(await unsealKey(sealed,secret,'user-a'),example);
 await assert.rejects(()=>unsealKey(sealed,secret,'user-b'));
});
test('uses a fresh nonce and rejects tampering or a different wrapping secret',async()=>{
 const first=await sealKey(example,secret,'user-a');const second=await sealKey(example,secret,'user-a');
 assert.notEqual(first.iv,second.iv);assert.notEqual(first.ciphertext,second.ciphertext);
 const bytes=Buffer.from(first.ciphertext,'base64');bytes[0]^=1;
 await assert.rejects(()=>unsealKey({...first,ciphertext:bytes.toString('base64')},secret,'user-a'));
 await assert.rejects(()=>unsealKey(first,randomBytes(32).toString('hex'),'user-a'));
});
test('rejects an invalid encryption configuration',async()=>{
 await assert.rejects(()=>sealKey(example,'','user-a'));
});
