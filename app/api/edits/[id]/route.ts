export const runtime='nodejs';
import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {readDesign,visiblePicture} from '@/lib/editor/reopen';
// A picture saved from the canvas editor, reopened with its layers: the
// original picture underneath and every layer as it was saved (lib/editor/reopen.ts).
// Read only: nothing is written. 404 when the picture isn't one the person may
// open, has no layers kept (an older save, or not made in the editor), or its
// original is no longer there; the editor then opens the picture plain.
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{
 const ctx=await context(request),{id}=await params;
 if(!validId(id))throw new StudioError('Image not found.',404);
 const pic=await visiblePicture(ctx,id);if(!pic)throw new StudioError('Image not found.',404);
 const kept=await readDesign(ctx,id,pic);
 if(!kept)throw new StudioError('This picture has no layers to reopen.',404);
 return Response.json({design:kept.design,base:{id:kept.base.id,title:kept.base.title,width:kept.base.width??null,height:kept.base.height??null}},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
