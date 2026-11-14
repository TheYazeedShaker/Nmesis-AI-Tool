// Stand-in for '@/lib/studio-context' in the access tests: the signed-in user is
// whoever state.user says (as if Supabase had verified the cookie), and the company
// is resolved by the Studio's real resolveContext against the in-memory directory.
// `aal` is the session's assurance level ('aal2' after the six-digit code).
import {state} from './state.mjs';
import {resolveContext} from '../../lib/accounts/context.ts';
export const ORG_COOKIE='studio_org';
export async function sessionUser(){return state.user}
export async function getStudioContext(){
 if(!state.user)return {ok:false,problem:'signed_out'};
 const resolved=await resolveContext({user:{id:state.user.id,email:state.user.email,aal:state.user.aal||'aal1'},chosenOrg:state.chosenOrg,directory:state.directory});
 return resolved.ok?resolved:{ok:false,problem:resolved.reason};
}
