export const runtime='nodejs';
import {cookies} from 'next/headers';
import {ORG_COOKIE,sessionUser} from '@/lib/studio-context';
import {getDirectory} from '@/lib/accounts/directory';
import {openCompany} from '@/lib/accounts/context';
import {cookieOptions} from '@/lib/auth/supabase';
import {redirect} from '@/lib/auth/respond';
// A deep link to one company's workspace: the admin links to /?org=<id>, the
// proxy sends it here. The server decides: staff open any company (a client's
// read-only, "Viewing as", logged on the page load); a member opens it only when
// they belong to it. Anything else lands on their own workspace with a notice.
export async function GET(request:Request){
 const org=new URL(request.url).searchParams.get('org')||'';
 const back='/?org='+encodeURIComponent(org.slice(0,64));
 try{
  const user=await sessionUser(),directory=getDirectory();
  if(!user)return redirect(request,'/signin?next='+encodeURIComponent(back));
  if(!directory)return redirect(request,'/signin?problem=not_configured');
  const opened=await openCompany({user,orgId:org,directory});
  if(!opened.ok){
   if(opened.reason==='mfa_required')return redirect(request,'/auth/code?next='+encodeURIComponent(back));
   if(opened.reason==='no_company')return redirect(request,'/auth/no-company');
   return redirect(request,'/?opened=refused');
  }
  (await cookies()).set(ORG_COOKIE,opened.ctx.org.id,{...cookieOptions(),maxAge:60*60*24*90});
  return redirect(request,'/');
 }catch(e){console.error('Company link failed',e instanceof Error?e.name:'UnknownError');return redirect(request,'/?opened=failed')}
}
