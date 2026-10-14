import {context,fail,validId,StudioError} from '@/lib/studio-server';
import {mediaRedirect} from '@/lib/portable/storage';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request),{id}=await params;if(!validId(id))throw new StudioError('Video not found.',404);return mediaRedirect(ctx.prefix+'swap-sources/'+id+'.mp4')}catch(e){return fail(e)}}
