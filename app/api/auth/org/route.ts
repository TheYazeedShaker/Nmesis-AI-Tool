export const runtime='nodejs';
import {cookies} from 'next/headers';
import {getStudioContext,ORG_COOKIE,sessionUser} from '@/lib/studio-context';
import {getDirectory} from '@/lib/accounts/directory';
import {MFA_REQUIRED,openCompany} from '@/lib/accounts/context';
import {cookieOptions} from '@/lib/auth/supabase';
import {answer,body,refuse} from '@/lib/auth/respond';
// The company switcher. The choice is only kept when the server agrees the user
// may open that company (an active member, or staff); every later request checks
// it again (lib/accounts/context.ts). The cookie outlives sign-out, so the last
// choice is where the next sign-in lands (re-checked then too).
const ORG_COOKIE_DAYS=90;
export async function POST(request:Request){
 try{
  const d=await body(request);if(!d)return refuse('unknown');
  const user=await sessionUser(),directory=getDirectory();
  if(!user)return refuse('expired',401);
  if(!directory)return refuse('not_configured',503);
  const opened=await openCompany({user,orgId:d.orgId,directory});
  if(!opened.ok)return opened.reason==='mfa_required'?answer({error:MFA_REQUIRED,problem:'mfa_required'},401):answer({error:'You cannot open that company.'},403);
  (await cookies()).set(ORG_COOKIE,opened.ctx.org.id,{...cookieOptions(),maxAge:60*60*24*ORG_COOKIE_DAYS});
  return answer({ok:true,org:{id:opened.ctx.org.id,name:opened.ctx.org.name},viewingAs:opened.ctx.viewingAs});
 }catch(e){console.error('Company switch failed',e instanceof Error?e.name:'UnknownError');return answer({error:'The company could not be changed. Try again.'},500)}
}
// The current choice, for completeness (the workspace reads /api/me).
export async function GET(){const got=await getStudioContext();return got.ok?answer({org:got.ctx.org.id}):answer({error:got.problem==='mfa_required'?MFA_REQUIRED:'Not signed in.',problem:got.problem},401)}
