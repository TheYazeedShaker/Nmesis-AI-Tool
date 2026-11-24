export const runtime='nodejs';
import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {BrandFontError,fontsReady,mayUploadFonts,removeFont} from '@/lib/brand-fonts/store';
import {WORDS} from '@/lib/brand-fonts/shared';

// An owner removes one of the company's fonts. Removing is soft (deleted_at):
// its row and licence record stay, no browser can load it any more, and
// designs that use it show "Missing font" (never another font in its place).
const failure=(e:unknown)=>fail(e instanceof BrandFontError?new StudioError(e.message,e.status):e);

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await context(request,true),{id}=await params;
 if(!mayUploadFonts(ctx))throw new StudioError(WORDS.onlyOwners,403);
 if(!validId(id))throw new StudioError(WORDS.notFound,404);
 const db=ctx.DB;if(!db)throw new StudioError('Brand fonts aren’t connected yet.',503);
 if(!await fontsReady(db))throw new StudioError(WORDS.notYet,503);
 if(!await removeFont(db,ctx.org,id,ctx.userId))throw new StudioError(WORDS.notFound,404);
 return Response.json({removed:id});
}catch(e){return failure(e)}}
