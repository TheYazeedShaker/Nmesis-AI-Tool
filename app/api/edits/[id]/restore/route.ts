export const runtime='nodejs';
import {bucket,context,fail,imageKey,readJson,StudioError,validId} from '@/lib/studio-server';
import {fromVisual,indexQuietly} from '@/lib/library-index';
import {cleanDoc,layerCount} from '@/lib/editor/doc';
import {pagesOnBase,readDesign,visiblePicture} from '@/lib/editor/reopen';
import {editedVisual} from '@/lib/editor/save';
import {designOf,recordVersion} from '@/lib/editor/versions';
// Restore an earlier version of a design (POST /api/edits/<version>/restore
// {parentId}): a NEW picture, the next version of the picture opened
// (`parentId`), whose image and kept design are copies of that version's.
// Nothing is deleted or written over: the version restored, the picture
// opened and the original stay exactly as they were. Only a version of the
// same design as the picture opened can be restored into it.
type Params={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:Params){try{
 const ctx=await context(request,true),{id:versionId}=await params,store=bucket(ctx.BUCKET);
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Restore from your studio.',403);
 const {parentId}=await readJson(request,2000) as {parentId?:unknown};
 if(!validId(versionId)||!validId(parentId))throw new StudioError('Choose a version to restore.',404);
 const [version,parent]=await Promise.all([visiblePicture(ctx,versionId),visiblePicture(ctx,parentId)]);
 if(!version)throw new StudioError('That version is no longer available.',404);
 if(!parent)throw new StudioError('The picture you opened is unavailable.',404);
 const [versionDesign,parentDesign]=await Promise.all([designOf(ctx,version),designOf(ctx,parent)]);
 if(versionDesign!==parentDesign)throw new StudioError('That version belongs to another design.');
 const kept=await readDesign(ctx,versionId,version);
 if(!kept||!pagesOnBase(kept.design))throw new StudioError('That version has no layers to restore.',404);
 const image=await store.get(imageKey(version.owner,versionId));
 if(!image)throw new StudioError('That version is no longer available.',404);
 const bytes=new Uint8Array(await image.arrayBuffer()),type=image.httpMetadata?.contentType||'image/png';
 const id=crypto.randomUUID(),now=new Date(),design=cleanDoc(kept.design);
 const visual=editedVisual(parent.visual,{id,width:version.visual.width||design.width,height:version.visual.height||design.height,layers:layerCount(design),pages:design.pages.length,copy:false,now,designId:parentDesign,restoredFrom:versionId});
 await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:type}});
 await store.put(ctx.prefix+'edits/'+id+'.json',JSON.stringify(design),{httpMetadata:{contentType:'application/json'}});
 await store.put(ctx.prefix+'visuals/'+id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
 await indexQuietly(ctx,fromVisual(ctx.prefix,visual));
 await recordVersion(ctx,{designId:parentDesign,versionId:id,kind:'restore',parentId,restoredFrom:versionId,now:now.getTime()});
 return Response.json({visual,design},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
