export const runtime='nodejs';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {cleanEmail,MAGIC_SAID,problemFor,safeNext} from '@/lib/auth/words';
import {linkOrigin,markLink} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// Email a sign-in link. The same sentence whether or not the address has an
// account; only "slow down" and "unreachable" are said out loud.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const email=cleanEmail(d.email),next=safeNext(d.next);
 if(email){
  const {error}=await (await serverAuth()).auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:linkOrigin(request)+'/auth/callback'+(next!=='/'?'?next='+encodeURIComponent(next):'')}});
  if(error){const problem=problemFor(error);if(problem==='rate_limited'||problem==='unreachable')return refuse(problem,problem==='rate_limited'?429:503);console.warn('Sign-in: magic link not sent',error.code||error.status||'error')}
  await markLink('magic');
 }
 return answer({ok:true,said:MAGIC_SAID});
}
