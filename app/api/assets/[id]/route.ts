import {context,fail,imageKey,validId,StudioError} from '@/lib/studio-server';
import {getStorage,mediaRedirect} from '@/lib/portable/storage';
import {imageFilename} from '@/lib/image-download';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;if(!validId(id))throw new StudioError('Image not found.',404);const ctx=await context(request),key=imageKey(ctx.prefix,id),head=await getStorage()?.head(key);if(!head)throw new StudioError('Image not found.',404);return mediaRedirect(key,new URL(request.url).searchParams.has('download')?imageFilename('nmesis-'+id,head.httpMetadata.contentType||'image/png'):undefined)}catch(e){return fail(e)}}
