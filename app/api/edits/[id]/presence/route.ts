export const runtime='nodejs';
import {context,fail,readJson,StudioError,validId} from '@/lib/studio-server';
import {visiblePicture} from '@/lib/editor/reopen';
import {designOf} from '@/lib/editor/versions';
import {beat,leave,othersOn} from '@/lib/editor/presence';
// The soft lock on the design opened on picture <id> (lib/editor/presence.ts):
// GET says who else has it open (anyone who may see it, viewers too); POST
// {editing} says this person has it open, every 20 s while it is, and answers
// who else has; DELETE says they closed it. The name shown to others is the
// person's own display name from the server, never from the request.
type Params={params:Promise<{id:string}>};
const NO_STORE={'Cache-Control':'private, no-store'};
async function design(request:Request,params:Params['params'],write=false){
 const ctx=await context(request,write),{id}=await params;
 if(!validId(id))throw new StudioError('Image not found.',404);
 const pic=await visiblePicture(ctx,id);if(!pic)throw new StudioError('Image not found.',404);
 return {ctx,designId:await designOf(ctx,pic)};
}
export async function GET(request:Request,{params}:Params){try{
 const {ctx,designId}=await design(request,params);
 return Response.json(await othersOn(ctx,designId),{headers:NO_STORE});
}catch(e){return fail(e)}}
export async function POST(request:Request,{params}:Params){try{
 const {ctx,designId}=await design(request,params,true);
 const {editing}=await readJson(request,2000) as {editing?:unknown};
 if(typeof editing!=='boolean')throw new StudioError('The request could not be read.');
 return Response.json(await beat(ctx,designId,editing),{headers:NO_STORE});
}catch(e){return fail(e)}}
export async function DELETE(request:Request,{params}:Params){try{
 const {ctx,designId}=await design(request,params,true);
 return Response.json({left:await leave(ctx,designId)},{headers:NO_STORE});
}catch(e){return fail(e)}}
