export const runtime='nodejs';
import {serverAuth,authConfigured,verifiedUser} from '@/lib/auth/supabase';
import {problemFor,safeNext} from '@/lib/auth/words';
import {cleanCode,pickFactor} from '@/lib/auth/mfa';
import {answer,body,refuse} from '@/lib/auth/respond';
// The six-digit code for Nmesis staff: verified with Supabase against the
// account's TOTP factor (the one the admin uses), which raises this session to
// AAL2. Supabase writes the new session cookies through the server client.
// `factorId` is only accepted for the account's own TOTP factor (enrolment).
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const code=cleanCode(d.code);if(!code)return refuse('bad_code',400);
 try{
  const client=await serverAuth(),user=await verifiedUser(client);
  if(!user)return refuse('expired',401);
  const listed=await client.auth.mfa.listFactors();
  if(listed.error)return refuse(problemFor(listed.error),503);
  const factor=pickFactor(listed.data.all,d.factorId);
  if(!factor)return answer({error:'There is no authenticator app on this account yet. Start again to add one.',problem:'no_factor'},409);
  const {error}=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code});
  if(error){const p=problemFor(error);return refuse(p==='unknown'||p==='link_invalid'?'bad_code':p,p==='rate_limited'?429:p==='unreachable'?503:401)}
  return answer({ok:true,next:safeNext(d.next)});
 }catch(e){console.error('Six-digit code check failed',e instanceof Error?e.name:'UnknownError');return refuse('unknown',500)}
}
