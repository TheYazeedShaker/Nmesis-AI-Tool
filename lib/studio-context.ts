import {cookies} from 'next/headers';
import {authConfigured,verifiedUser,type SessionUser} from '@/lib/auth/supabase';
import {getDirectory,type Directory} from '@/lib/accounts/directory';
import {resolveContext,type StudioContext} from '@/lib/accounts/context';
// The one server-side context per request: { user, org, role, entitlements, staff }.
// The user comes from the Supabase session cookie, verified with Supabase on
// every call; the company from the master list (entitlements cached 60 s per org).
// Nmesis staff also need the six-digit code in this session (Supabase AAL2).
export const ORG_COOKIE='studio_org';
export type ContextProblem='not_configured'|'signed_out'|'no_company'|'mfa_required';
export async function sessionUser():Promise<SessionUser|null>{
 if(!authConfigured())return null;
 return verifiedUser();
}
export async function getStudioContext(deps:{user?:SessionUser|null;directory?:Directory}={}):Promise<{ok:true;ctx:StudioContext}|{ok:false;problem:ContextProblem}>{
 const directory=deps.directory??getDirectory();
 if(!authConfigured()||!directory)return {ok:false,problem:'not_configured'};
 const user=deps.user!==undefined?deps.user:await sessionUser();
 if(!user)return {ok:false,problem:'signed_out'};
 const chosen=(await cookies()).get(ORG_COOKIE)?.value||null;
 const resolved=await resolveContext({user:{id:user.id,email:user.email,aal:user.aal},chosenOrg:chosen,directory});
 return resolved.ok?resolved:{ok:false,problem:resolved.reason};
}
