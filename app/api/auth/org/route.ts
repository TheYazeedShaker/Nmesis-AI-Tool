export const runtime='nodejs';
import {cookies} from 'next/headers';
import {getStudioContext,ORG_COOKIE,sessionUser} from '@/lib/studio-context';
import {getDirectory,UUID} from '@/lib/accounts/directory';
import {resolveContext} from '@/lib/accounts/context';
import {cookieOptions} from '@/lib/auth/supabase';
import {answer,body,refuse} from '@/lib/auth/respond';
// The company switcher. The choice is only kept when the server agrees the user
// may open that company (an active member, or staff); every later request checks
// it again (lib/accounts/context.ts).
export async function POST(request:Request){
 try{
  const d=await body(request);if(!d)return refuse('unknown');
  const orgId=typeof d.orgId==='string'&&UUID.test(d.orgId)?d.orgId:'';
  const user=await sessionUser(),directory=getDirectory();
  if(!user)return refuse('expired',401);
  if(!directory)return refuse('not_configured',503);
  const resolved=await resolveContext({user:{id:user.id,email:user.email},chosenOrg:orgId,directory});
  if(!orgId||!resolved.ok||resolved.ctx.org.id!==orgId)return answer({error:'You cannot open that company.'},403);
  (await cookies()).set(ORG_COOKIE,orgId,{...cookieOptions(),maxAge:60*60*24*90});
  return answer({ok:true,org:{id:resolved.ctx.org.id,name:resolved.ctx.org.name},viewingAs:resolved.ctx.viewingAs});
 }catch(e){console.error('Company switch failed',e instanceof Error?e.name:'UnknownError');return answer({error:'The company could not be changed. Try again.'},500)}
}
// The current choice, for completeness (the workspace reads /api/me).
export async function GET(){const got=await getStudioContext();return got.ok?answer({org:got.ctx.org.id}):answer({error:'Not signed in.'},401)}
