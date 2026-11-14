export const runtime='nodejs';
import {getStudioContext} from '@/lib/studio-context';
import {accountSummary,logStaffView} from '@/lib/accounts/summary';
import {MFA_REQUIRED} from '@/lib/accounts/context';
import {getDatabase} from '@/lib/portable/database';
import {NO_COMPANY} from '@/lib/auth/words';
import {answer} from '@/lib/auth/respond';
// Who is signed in, for which company, with what plan. Opening a client's
// workspace as staff is logged here, once per page load.
export async function GET(request:Request){
 try{
  const got=await getStudioContext();
  if(!got.ok)return got.problem==='signed_out'?answer({error:'Please sign in to use your studio.',problem:'signed_out'},401):got.problem==='mfa_required'?answer({error:MFA_REQUIRED,problem:'mfa_required'},401):got.problem==='no_company'?answer({error:NO_COMPANY,problem:'no_company'},403):answer({error:'Signing in is not set up on this Studio yet.',problem:'not_configured'},503);
  const page=new URL(request.url).searchParams.get('page')||'/';
  await logStaffView(getDatabase()?.forUser(got.ctx.user.id),got.ctx,page.startsWith('/')?page:'/');
  return answer(accountSummary(got.ctx));
 }catch(e){console.error('Account summary failed',e instanceof Error?e.name:'UnknownError');return answer({error:'Your account could not be loaded. Try again.'},500)}
}
