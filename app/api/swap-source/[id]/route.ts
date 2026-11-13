import {context,fail,validId,StudioError} from '@/lib/studio-server';
import {mediaRedirect} from '@/lib/portable/storage';
import {locate} from '@/lib/org-library';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request),{id}=await params;if(!validId(id))throw new StudioError('Video not found.',404);const owner=await locate(ctx,'swap-sources/'+id+'.mp4');if(!owner)throw new StudioError('Video not found.',404);return mediaRedirect(owner+'swap-sources/'+id+'.mp4')}catch(e){return fail(e)}}
