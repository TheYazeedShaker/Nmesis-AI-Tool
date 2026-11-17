// Provider keys belong to the company, not to one person: one place per
// organization (orgs/<org>/keys/), connected and removed by the company's owners
// when its plan includes studio.own_keys, and used by everyone in it. Without
// studio.own_keys a company has no keys of its own: Nmesis's keys make the calls (S3).
// Uses only server-verified identity; the browser never supplies a prefix.
import {orgKeysPrefix} from './portable/tenancy';
import {featureOn,type Entitlements,type Role} from './accounts/plan';
export type KeyContext={org:string;role:Role;entitlements:Entitlements;prefix:string};
export function keyAccess(ctx:Pick<KeyContext,'role'|'entitlements'>){
 const own=featureOn(ctx.entitlements,'studio.own_keys');
 return {own,manage:own&&ctx.role==='owner'};
}
export const keysPrefix=(ctx:Pick<KeyContext,'org'>)=>orgKeysPrefix(ctx.org);
export const KEYS_NOT_ON_PLAN='Connecting your own provider keys is not on your company\'s plan. It is available on Enterprise; ask Nmesis.';
export const keysManagedBy=(provider:string)=>`Your company's owner manages the ${provider} connection.`;
// The context to read and write provider credentials with: the company's key
// place, or null when the plan has no keys of its own.
export async function credentialContext<T extends KeyContext>(ctx:T):Promise<T|null>{
 return keyAccess(ctx).own?{...ctx,prefix:keysPrefix(ctx)}:null;
}
// S3: Nmesis pays the providers. A company uses its own key only while its plan
// includes studio.own_keys; otherwise Nmesis's keys (server variables) make the
// call and the company spends credits. A key saved earlier by a company that has
// since lost the feature stays stored (never deleted) and is ignored.
export type KeyProvider='openai'|'google'|'higgsfield'|'topaz';
export const keyFile=(provider:KeyProvider)=>`credentials/${provider}.json`;
export const NMESIS_PROVIDES='Nmesis provides the AI for your plan.';
export const KEYS_IGNORED_NOTE='Your company saved its own provider keys earlier. Your plan no longer includes your own keys, so the Studio uses the AI Nmesis provides and your credits instead. The saved keys are kept, not deleted, and are used again if the feature comes back.';
// Providers whose stored company key is being ignored because studio.own_keys is off.
export async function ignoredKeys(ctx:Pick<KeyContext,'org'|'role'|'entitlements'>&{BUCKET?:{head(key:string):Promise<unknown>}}):Promise<KeyProvider[]>{
 if(keyAccess(ctx).own||!ctx.BUCKET)return [];
 const bucket=ctx.BUCKET,prefix=keysPrefix(ctx),all:KeyProvider[]=['openai','google','higgsfield','topaz'];
 const found=await Promise.all(all.map(async p=>!!await bucket.head(prefix+keyFile(p)).catch(()=>null)));
 return all.filter((_,i)=>found[i]);
}
