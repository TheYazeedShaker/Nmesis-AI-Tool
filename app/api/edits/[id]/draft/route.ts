export const runtime='nodejs';
import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {visiblePicture} from '@/lib/editor/reopen';
import {deleteDraft,readDraft,readDraftBody,writeDraft} from '@/lib/editor/drafts';
// Autosave's working draft of the design opened on picture <id>, the person's
// own (lib/editor/drafts.ts): GET reads it ({draft:null} when there is none yet:
// that is the usual case, not a missing page, so not a 404), PUT keeps it (about 2 s
// after the last change), DELETE drops it. Writes need someone who may make work
// (viewers are refused by the route table); the picture must be one they may
// open, and the design must sit on that picture's own original. Save, which
// makes a new version of the picture, is POST /api/edits.
type Params={params:Promise<{id:string}>};
const NO_STORE={'Cache-Control':'private, no-store'};
async function picture(request:Request,params:Params['params'],write=false){
 const ctx=await context(request,write),{id}=await params;
 if(!validId(id))throw new StudioError('Image not found.',404);
 if(write&&request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Save from your studio.',403);
 const pic=await visiblePicture(ctx,id);if(!pic)throw new StudioError('Image not found.',404);
 return {ctx,pic};
}
export async function GET(request:Request,{params}:Params){try{
 const {ctx,pic}=await picture(request,params);
 const draft=await readDraft(ctx,pic.visual.id);
 return Response.json({draft:draft??null},{headers:NO_STORE});
}catch(e){return fail(e)}}
export async function PUT(request:Request,{params}:Params){try{
 const {ctx,pic}=await picture(request,params,true);
 return Response.json(await writeDraft(ctx,pic,await readDraftBody(request)),{headers:NO_STORE});
}catch(e){return fail(e)}}
export async function DELETE(request:Request,{params}:Params){try{
 const {ctx,pic}=await picture(request,params,true);
 return Response.json(await deleteDraft(ctx,pic.visual.id),{headers:NO_STORE});
}catch(e){return fail(e)}}
