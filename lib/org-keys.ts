// Provider keys belong to the company, not to one person: one place per
// organization (orgs/<org>/keys/), connected and removed by the company's owners
// when its plan includes studio.own_keys, and used by everyone in it. Without
// studio.own_keys a company has no keys of its own (Nmesis-held keys arrive in S3).
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
