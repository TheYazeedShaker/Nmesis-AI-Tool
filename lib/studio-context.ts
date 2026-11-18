import {cookies} from 'next/headers';
import {authConfigured,verifiedUser,type SessionUser} from '@/lib/auth/supabase';
import {getDirectory,type Directory} from '@/lib/accounts/directory';
import {resolveContext,type Resolved,type StudioContext} from '@/lib/accounts/context';
import {ttlCache} from '@/lib/accounts/cache';
import type {Timing} from '@/lib/server-timing';
// The one server-side context per request: { user, org, role, entitlements, staff }.
// The user comes from the Supabase session cookie, verified with Supabase
// (getUser); the company from the master list (entitlements cached 60 s per org).
// Nmesis staff also need the six-digit code in this session (Supabase AAL2).
export const ORG_COOKIE='studio_org';
// Which of the company's brands the person works as (only a wish, like the company: honoured when it is one of the company's brands).
export const BRAND_COOKIE='studio_brand';
export type ContextProblem='not_configured'|'signed_out'|'no_company'|'mfa_required';
// The resolved context, reused for a few seconds per person, company choice and
// sign-in level (F-060): a page's burst of requests (/api/me, /api/credits, the
// lists, each poll) reads the master list once instead of once each. A change of
// membership, role or support access takes effect within CONTEXT_REUSE_MS. Only
// for the real directory: tests that pass their own see every change at once.
export const CONTEXT_REUSE_MS=10_000;
const recent=ttlCache<Resolved>(CONTEXT_REUSE_MS,1000);
// The session itself is verified with Supabase on every request (never reused),
// so a session ended elsewhere stops at once; a page's requests check it in
// parallel, so it costs one wait, not one per request.
export async function sessionUser():Promise<SessionUser|null>{
 if(!authConfigured())return null;
 return verifiedUser();
}
export async function getStudioContext(deps:{user?:SessionUser|null;directory?:Directory;timing?:Timing}={}):Promise<{ok:true;ctx:StudioContext}|{ok:false;problem:ContextProblem}>{
 const directory=deps.directory??getDirectory(),timing=deps.timing;
 if(!authConfigured()||!directory)return {ok:false,problem:'not_configured'};
 const user=deps.user!==undefined?deps.user:timing?await timing.time('auth',sessionUser):await sessionUser();
 if(!user)return {ok:false,problem:'signed_out'};
 const jar=await cookies(),chosen=jar.get(ORG_COOKIE)?.value||null,brand=jar.get(BRAND_COOKIE)?.value?.slice(0,64)||null;
 const resolve=()=>resolveContext({user:{id:user.id,email:user.email,aal:user.aal,name:user.name},chosenOrg:chosen,chosenBrand:brand,directory});
 const read=()=>deps.directory?resolve():recent(`${user.id}|${user.aal||''}|${chosen||''}|${brand||''}`,resolve);
 const resolved=timing?await timing.time('account',read):await read();
 return resolved.ok?resolved:{ok:false,problem:resolved.reason};
}
