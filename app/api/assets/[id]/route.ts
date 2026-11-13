import {context,fail,imageKey,validId,StudioError} from '@/lib/studio-server';
import {getStorage,mediaRedirect} from '@/lib/portable/storage';
import {imageFilename} from '@/lib/image-download';
import {locate} from '@/lib/org-library';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;if(!validId(id))throw new StudioError('Image not found.',404);const ctx=await context(request);const store=getStorage();
// Any member's image in the signed-in user's company; never another company's.
const owner=await locate(ctx,'images/'+id,store);if(!owner)throw new StudioError('Image not found.',404);let key=imageKey(owner,id);if(new URL(request.url).searchParams.has('original')&&await store?.head(owner+'originals/'+id))key=owner+'originals/'+id;const head=await store?.head(key);if(!head)throw new StudioError('Image not found.',404);return mediaRedirect(key,new URL(request.url).searchParams.has('download')?imageFilename('nmesis-'+id,head.httpMetadata.contentType||'image/png'):undefined)}catch(e){return fail(e)}}
