export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {getTeamStore} from '@/lib/accounts/team-store';
import {setAccess,shareState} from '@/lib/shares';
// Share (lib/shares.ts). GET: who can see this piece of work, its public link
// (on or off, never the address) and the company's people with what each may
// do. PUT { access: 'private' | 'view' | 'edit' }: its creator or a company
// owner chooses who in the company sees it. Work of another company: 404.
type Params={params:Promise<{kind:string;id:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request,{params}:Params){try{const ctx=await context(request),{kind,id}=await params;return Response.json(await shareState(ctx,kind,id,getTeamStore),{headers})}catch(e){return fail(e)}}
export async function PUT(request:Request,{params}:Params){try{const ctx=await context(request,true),{kind,id}=await params,d=await readJson(request,500);await setAccess(ctx,kind,id,d.access);return Response.json(await shareState(ctx,kind,id,getTeamStore),{headers})}catch(e){return fail(e)}}
