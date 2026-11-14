// Server-only envelope encryption. User identity is authenticated as additional data.
export type SealedKey = {version:1;iv:string;ciphertext:string;verifiedAt:string};
// KEY_ENCRYPTION_SECRET is an AES-256 key written as hex: exactly 64 hex
// characters (32 bytes), e.g. the output of `openssl rand -hex 32`.
export const KEY_SECRET_RULE='KEY_ENCRYPTION_SECRET must be exactly 64 hex characters (32 bytes), e.g. the output of openssl rand -hex 32';
export const KEY_STORAGE_MISCONFIGURED='Secure key storage is misconfigured.';
export const validKeySecret=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
// Plain fields: tests load this file under Node's strip-only TypeScript mode.
export class KeyStorageMisconfigured extends Error{status:number;constructor(){super(KEY_STORAGE_MISCONFIGURED);this.name='KeyStorageMisconfigured';this.status=503}}
// The configured secret, checked once per process (and again only if the value
// changes). A set but malformed value is reported in one server log line that
// names the variable and the rule, never the value, and then reads as unusable.
let checked:{raw:string;value:string|undefined;misconfigured:boolean}|undefined;
export function keySecretState(raw:string|undefined=globalThis.process?.env?.KEY_ENCRYPTION_SECRET):{value:string|undefined;misconfigured:boolean}{
 const text=typeof raw==='string'?raw:'';
 if(checked?.raw===text)return checked;
 const trimmed=text.trim(),ok=validKeySecret(trimmed);
 checked={raw:text,value:ok?trimmed:undefined,misconfigured:!!trimmed&&!ok};
 if(checked.misconfigured)console.error('Secure key storage is off: '+KEY_SECRET_RULE+'. Never change it once keys are saved.');
 return checked;
}
// Before saving or opening a key: a malformed secret fails with one clear 503
// instead of a generic error. A missing secret is left to the caller's own sentence.
export function requireKeySecret(value:string|undefined){
 if(value!==undefined&&value!==''){if(!validKeySecret(value))throw new KeyStorageMisconfigured();return}
 if(keySecretState().misconfigured)throw new KeyStorageMisconfigured();
}
async function wrappingKey(secret:string){
 if(!validKeySecret(secret))throw new Error('Invalid wrapping secret');
 const bytes=new Uint8Array(secret.match(/../g)!.map(x=>parseInt(x,16)));
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealKey(value:string,secret:string,identity:string):Promise<SealedKey>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(identity)},await wrappingKey(secret),new TextEncoder().encode(value));
 return {version:1,iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(ciphertext).toString('base64'),verifiedAt:new Date().toISOString()};
}
export async function unsealKey(record:SealedKey,secret:string,identity:string){
 if(record.version!==1)throw new Error('Unsupported credential version');
 const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(record.iv,'base64'),additionalData:new TextEncoder().encode(identity)},await wrappingKey(secret),Buffer.from(record.ciphertext,'base64'));
 return new TextDecoder().decode(value);
}
