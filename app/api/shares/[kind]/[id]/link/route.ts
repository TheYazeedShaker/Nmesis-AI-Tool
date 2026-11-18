export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {resolveLinkOrigin} from '@/lib/auth/origin';
import {createLink,linkUrl,turnOffLink} from '@/lib/shares';
// The public view link of a piece of work (lib/shares.ts), for its creator or a
// company owner. POST { days: 1 | 7 | 30 }: makes a new link (the previous one
// stops working) and answers its address once; only its hash is kept.
// DELETE: turns it off. The address is the Studio's stable one (lib/auth/origin.ts).
type Params={params:Promise<{kind:string;id:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request,{params}:Params){try{const ctx=await context(request,true),{kind,id}=await params,d=await readJson(request,200);const made=await createLink(ctx,kind,id,d.days);return Response.json({url:linkUrl(resolveLinkOrigin(request.url),made.token),expiresAt:made.expiresAt,days:made.days},{headers})}catch(e){return fail(e)}}
export async function DELETE(request:Request,{params}:Params){try{const ctx=await context(request,true),{kind,id}=await params;return Response.json(await turnOffLink(ctx,kind,id),{headers})}catch(e){return fail(e)}}
