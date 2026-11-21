export const runtime='nodejs';
import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {visiblePicture} from '@/lib/editor/reopen';
import {designOf,listVersions} from '@/lib/editor/versions';
// The version history of the design opened on picture <id> (lib/editor/versions.ts):
// every picture saved, restored or duplicated into it, newest first, that the
// person may open. Read only. `ready: false` (and no versions) until migration 0012.
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{
 const ctx=await context(request),{id}=await params;
 if(!validId(id))throw new StudioError('Image not found.',404);
 const pic=await visiblePicture(ctx,id);if(!pic)throw new StudioError('Image not found.',404);
 const designId=await designOf(ctx,pic);
 return Response.json({designId,...await listVersions(ctx,designId)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
