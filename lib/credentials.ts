import {bucket,StudioError,type RequestContext} from '@/lib/studio-server';
import {sealKey,unsealKey,type SealedKey,requireKeySecret} from '@/lib/secret-crypto';
import {credentialContext,keyAccess,keysManagedBy,KEYS_NOT_ON_PLAN} from '@/lib/org-keys';
type Context=Pick<RequestContext,'BUCKET'|'KEY_ENCRYPTION_SECRET'|'OPENAI_API_KEY'|'org'|'role'|'entitlements'|'prefix'>;
const path=(keysPrefix:string)=>keysPrefix+'credentials/openai.json';
export async function credentialStatus(ctx:Context){
 const access=keyAccess(ctx),keys=await credentialContext(ctx);
 const saved=keys&&ctx.BUCKET?await ctx.BUCKET.head(path(keys.prefix)):null;
 return {personalKey:!!saved,generation:!!saved||!!ctx.OPENAI_API_KEY,keySetup:access.manage&&!!ctx.BUCKET&&!!ctx.KEY_ENCRYPTION_SECRET,sponsored:!access.manage,sponsorPending:!access.manage&&!saved&&!ctx.OPENAI_API_KEY,ownKeys:access.own};
}
export async function apiKey(ctx:Context){
 const keys=await credentialContext(ctx);
 const saved=keys&&ctx.BUCKET?await ctx.BUCKET.get(path(keys.prefix)):null;
 if(!saved)return ctx.OPENAI_API_KEY||'';
 requireKeySecret(ctx.KEY_ENCRYPTION_SECRET);if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('The saved connection needs attention. Please contact your company\'s owner.',503);
 try{return await unsealKey(await saved.json<SealedKey>(),ctx.KEY_ENCRYPTION_SECRET,keys!.prefix)}catch{throw new StudioError('The saved connection could not be opened. Please contact your company\'s owner.',503)}
}
async function managed(ctx:Context){
 const access=keyAccess(ctx);if(!access.own)throw new StudioError(KEYS_NOT_ON_PLAN,403);if(!access.manage)throw new StudioError(keysManagedBy('OpenAI'),403);
 return (await credentialContext(ctx))!;
}
export async function saveKey(ctx:Context,key:string){
 const keys=await managed(ctx);
 requireKeySecret(ctx.KEY_ENCRYPTION_SECRET);if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure key storage is not ready yet.',503);
 const sealed=await sealKey(key,ctx.KEY_ENCRYPTION_SECRET,keys.prefix);
 await bucket(ctx.BUCKET).put(path(keys.prefix),JSON.stringify(sealed),{httpMetadata:{contentType:'application/json'}});
}
export async function removeKey(ctx:Context){const keys=await managed(ctx);await bucket(ctx.BUCKET).delete(path(keys.prefix))}
