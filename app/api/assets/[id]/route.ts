import {context,fail,imageKey,validId,StudioError} from '@/lib/studio-server';
import {getStorage,mediaRedirect} from '@/lib/portable/storage';
import {imageFilename} from '@/lib/image-download';
import {locate} from '@/lib/org-library';
import {makeThumb} from '@/lib/library-index';
import {hiddenFromRequester} from '@/lib/shares';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;if(!validId(id))throw new StudioError('Image not found.',404);const ctx=await context(request);const store=getStorage();
// Any member's image in the signed-in user's company; never another company's.
const owner=await locate(ctx,'images/'+id,store);if(!owner)throw new StudioError('Image not found.',404);
// Someone else's "Only me" picture (lib/shares.ts, 0011): as if it were not there.
if(await hiddenFromRequester(ctx,'visual',id,owner))throw new StudioError('Image not found.',404);
// ?thumb=1: the small WebP the library shows (made once, here, for work saved before thumbnails).
if(new URL(request.url).searchParams.has('thumb')&&store){const thumb=await makeThumb(store,owner,id).catch(()=>null);if(thumb)return mediaRedirect(thumb)}
let key=imageKey(owner,id);if(new URL(request.url).searchParams.has('original')&&await store?.head(owner+'originals/'+id))key=owner+'originals/'+id;const head=await store?.head(key);if(!head)throw new StudioError('Image not found.',404);return mediaRedirect(key,new URL(request.url).searchParams.has('download')?imageFilename('nmesis-'+id,head.httpMetadata.contentType||'image/png'):undefined)}catch(e){return fail(e)}}
