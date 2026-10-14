// Uses only server-verified identity. The browser never supplies a payer or prefix.
export type SponsorContext={email?:string;prefix:string;SHARED_OPENAI_OWNER_EMAIL?:string;SHARED_OPENAI_GUEST_EMAILS?:string;BUCKET?:Pick<R2Bucket,'get'|'head'|'put'>};
const email=(value:string|undefined)=>(value||'').trim().toLowerCase();
export function sponsorship(ctx:SponsorContext){
 const owner=email(ctx.SHARED_OPENAI_OWNER_EMAIL);
 const guests=(ctx.SHARED_OPENAI_GUEST_EMAILS||'').split(',').map(email).filter(Boolean);
 const identity=email(ctx.email);
 return {owner,guests,isOwner:!!owner&&identity===owner,isGuest:!!owner&&identity!==owner&&!!identity&&guests.includes(identity)};
}
const pointerKey=(owner:string)=>'studio/sponsorship/'+encodeURIComponent(owner)+'.json';
export async function registerSponsor(ctx:SponsorContext){
 const access=sponsorship(ctx);if(!access.isOwner||!access.guests.length||!ctx.BUCKET)return;
 if(!await ctx.BUCKET.head(ctx.prefix+'credentials/openai.json')&&!await ctx.BUCKET.head(ctx.prefix+'credentials/higgsfield.json'))return;
 const key=pointerKey(access.owner),previous=await ctx.BUCKET.get(key);
 if(previous){const value=await previous.json<{owner:string;prefix:string}>();if(value.owner===access.owner&&value.prefix===ctx.prefix)return;}
 await ctx.BUCKET.put(key,JSON.stringify({owner:access.owner,prefix:ctx.prefix}),{httpMetadata:{contentType:'application/json'}});
}
export async function sponsoredPrefix(ctx:SponsorContext){
 const access=sponsorship(ctx);if(!access.isGuest||!ctx.BUCKET)return null;
 const record=await ctx.BUCKET.get(pointerKey(access.owner));if(!record)return null;
 const value=await record.json<{owner:string;prefix:string}>();
 if(value.owner!==access.owner||typeof value.prefix!=='string'||!/^users\/[a-f0-9]{64}\/$/.test(value.prefix))return null;
 return value.prefix;
}
