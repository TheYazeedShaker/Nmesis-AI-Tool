export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,bucket,validId,StudioError} from '@/lib/studio-server';
import {deleteVisual,restoreVisual} from '@/lib/visual-library';
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{const ctx=await context(request),{id}=await params;if(!validId(id))throw new StudioError('Image not found.',404);const store=bucket(ctx.BUCKET);if(await store.get(ctx.prefix+'deleted-visuals/'+id+'.json'))throw new StudioError('Image not found.',404);const record=await store.get(ctx.prefix+'visuals/'+id+'.json');if(!record)throw new StudioError('Image not found.',404);return Response.json({visual:await record.json()},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
export async function DELETE(request:Request,{params}:Params){try{return Response.json(await deleteVisual(await context(request,true),(await params).id))}catch(e){return fail(e)}}
export async function POST(request:Request,{params}:Params){try{return Response.json(await restoreVisual(await context(request,true),(await params).id))}catch(e){return fail(e)}}
