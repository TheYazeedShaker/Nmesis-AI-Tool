// Server-only envelope encryption. User identity is authenticated as additional data.
export type SealedKey = {version:1;iv:string;ciphertext:string;verifiedAt:string};
async function wrappingKey(secret:string){
 if(!/^[a-f0-9]{64}$/i.test(secret))throw new Error('Invalid wrapping secret');
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
