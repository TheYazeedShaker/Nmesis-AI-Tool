export const runtime='nodejs';
import {serverAuth,authConfigured,verifiedUser} from '@/lib/auth/supabase';
import {getDirectory} from '@/lib/accounts/directory';
import {problemFor} from '@/lib/auth/words';
import {groupedSecret,qrImageSrc} from '@/lib/auth/mfa';
import {answer,body,refuse} from '@/lib/auth/respond';
// Adding an authenticator app, for a member of Nmesis staff who somehow has none
// (normally they already use one in the admin: one Supabase user, one factor).
// Unfinished enrolments are removed first so the new one can take their place;
// a verified factor is never touched here.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 if(!await body(request))return refuse('unknown');
 try{
  const client=await serverAuth(),user=await verifiedUser(client),directory=getDirectory();
  if(!user)return refuse('expired',401);
  if(!directory)return refuse('not_configured',503);
  if(!await directory.staffRole(user.id))return answer({error:'Only Nmesis staff add an authenticator app here.'},403);
  const listed=await client.auth.mfa.listFactors();
  if(listed.error)return refuse(problemFor(listed.error),503);
  const totp=listed.data.all.filter(f=>f.factor_type==='totp');
  if(totp.some(f=>f.status==='verified'))return answer({error:'This account already has an authenticator app. Enter its six-digit code.',problem:'has_factor'},409);
  for(const stale of totp){const {error}=await client.auth.mfa.unenroll({factorId:stale.id});if(error)console.warn('Six-digit code: an unfinished enrolment could not be removed',error.code||'error')}
  const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Nmesis '+new Date().toISOString().slice(0,10)});
  if(error||!data)return refuse(error?problemFor(error):'unknown',503);
  return answer({factorId:data.id,qr:qrImageSrc(data.totp.qr_code),secret:groupedSecret(data.totp.secret)});
 }catch(e){console.error('Authenticator enrolment failed',e instanceof Error?e.name:'UnknownError');return refuse('unknown',500)}
}
