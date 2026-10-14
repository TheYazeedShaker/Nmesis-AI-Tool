import {bucket,StudioError,type StudioEnv} from '@/lib/studio-server';
import {sealKey,unsealKey,type SealedKey} from '@/lib/secret-crypto';
import {registerSponsor,sponsoredPrefix,sponsorship} from '@/lib/sponsored-access';
type Context=StudioEnv&{prefix:string;email?:string};
const path=(ctx:Context)=>ctx.prefix+'credentials/openai.json';
export async function credentialStatus(ctx:Context){
 const access=sponsorship(ctx);await registerSponsor(ctx);
 if(access.isGuest){const prefix=await sponsoredPrefix(ctx);const connected=!!(prefix&&ctx.BUCKET&&await ctx.BUCKET.head(prefix+'credentials/openai.json'));
  return {personalKey:false,generation:connected,keySetup:false,sponsored:true,sponsorPending:!connected};}
 const personal=ctx.BUCKET?await ctx.BUCKET.head(path(ctx)):null;
 return {personalKey:!!personal,generation:!!personal||!!ctx.OPENAI_API_KEY,keySetup:!!ctx.BUCKET&&!!ctx.KEY_ENCRYPTION_SECRET,sharingWith:access.isOwner&&personal?access.guests:[]};
}
export async function apiKey(ctx:Context){
 const access=sponsorship(ctx);const prefix=access.isGuest?await sponsoredPrefix(ctx):ctx.prefix;
 if(!prefix)throw new StudioError('The studio owner needs to open the studio once to activate your shared connection.',503);
 const saved=ctx.BUCKET?await ctx.BUCKET.get(prefix+'credentials/openai.json'):null;
 if(!saved){if(access.isGuest)throw new StudioError('The studio owner’s OpenAI connection is unavailable. Please ask them to reconnect.',503);return ctx.OPENAI_API_KEY||'';}
 if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('The saved connection needs attention. Please contact the studio owner.',503);
 try{return await unsealKey(await saved.json<SealedKey>(),ctx.KEY_ENCRYPTION_SECRET,prefix)}catch{throw new StudioError('The saved connection could not be opened. Please contact the studio owner.',503)}
}
export async function saveKey(ctx:Context,key:string){
 if(sponsorship(ctx).isGuest)throw new StudioError("Your connection is managed by the studio owner.",403);
 if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure key storage is not ready yet.',503);
 const sealed=await sealKey(key,ctx.KEY_ENCRYPTION_SECRET,ctx.prefix);
 await bucket(ctx.BUCKET).put(path(ctx),JSON.stringify(sealed),{httpMetadata:{contentType:'application/json'}});
 await registerSponsor(ctx);
}
export async function removeKey(ctx:Context){if(sponsorship(ctx).isGuest)throw new StudioError("Your connection is managed by the studio owner.",403);await bucket(ctx.BUCKET).delete(path(ctx))}
