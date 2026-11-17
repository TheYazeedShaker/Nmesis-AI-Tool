export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {changeRole,removePerson,teamPage} from '@/lib/accounts/team';
import {getTeamStore} from '@/lib/accounts/team-store';
type Params={params:Promise<{id:string}>};
// One person in the company's team (the id is their user id). The company's own
// owners only; the setup SQL's functions check the owner again and log it.
const headers={'Cache-Control':'private, no-store'};
// PATCH { role }: change their role.
export async function PATCH(request:Request,{params}:Params){try{const ctx=await context(request,true),store=getTeamStore(),d=await readJson(request,500);const r=await changeRole(ctx,store,(await params).id,d.role);return Response.json({...r,team:await teamPage(ctx,store)},{headers})}catch(e){return fail(e)}}
// Remove them from the company (their work stays).
export async function DELETE(request:Request,{params}:Params){try{const ctx=await context(request,true),store=getTeamStore();const r=await removePerson(ctx,store,(await params).id);return Response.json({...r,team:await teamPage(ctx,store)},{headers})}catch(e){return fail(e)}}
