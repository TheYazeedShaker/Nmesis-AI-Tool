export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {invitePerson,teamPage} from '@/lib/accounts/team';
import {getTeamStore} from '@/lib/accounts/team-store';
import {linkOrigin} from '@/lib/auth/flow';
// Company settings → Team. GET: everyone in the company. POST { email, role }:
// the company's own owners invite someone (docs/supabase-setup.sql section 7).
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{const ctx=await context(request);return Response.json(await teamPage(ctx,getTeamStore()),{headers})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),store=getTeamStore(),d=await readJson(request,2000);const r=await invitePerson(ctx,store,d,linkOrigin(request));return Response.json({...r,team:await teamPage(ctx,store)},{headers})}catch(e){return fail(e)}}
