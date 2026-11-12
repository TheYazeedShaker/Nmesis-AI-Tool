export const runtime='nodejs';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {cleanEmail,problemFor,RECOVERY_SAID} from '@/lib/auth/words';
import {linkOrigin,markLink} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// "Forgot your password?": always the same sentence, whether or not the address
// exists. The recovery mark goes in our own cookie now, because somebody who is
// recovering already has a password and the flag alone would skip the card.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const email=cleanEmail(d.email);
 if(email){
  const {error}=await (await serverAuth()).auth.resetPasswordForEmail(email,{redirectTo:linkOrigin(request)+'/auth/callback'});
  if(error){const problem=problemFor(error);if(problem==='rate_limited'||problem==='unreachable')return refuse(problem,problem==='rate_limited'?429:503);console.warn('Sign-in: recovery email not sent',error.code||error.status||'error')}
  await markLink('recovery');
 }
 return answer({ok:true,said:RECOVERY_SAID});
}
