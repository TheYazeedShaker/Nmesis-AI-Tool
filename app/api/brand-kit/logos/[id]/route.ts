export const runtime='nodejs';
import {bucket,context,fail,readJson,StudioError,validId} from '@/lib/studio-server';
import {mediaRedirect} from '@/lib/portable/storage';
import {BrandKitError,findLogo,kitDb,LOGO_NOT_FOUND,logoFilename,logoKey,mayEditBrand,ONLY_EDITORS,parseLogoName,removeLogo,renameLogo} from '@/lib/brand-kit';
// One logo of the company's brand kit. GET: a short-lived signed link to the
// picture (?download=1: as a file), for everyone in the company. PATCH (rename)
// and DELETE: owners and creators. Another company's id reads as not found.
const failure=(e:unknown)=>fail(e instanceof BrandKitError?new StudioError(e.message,e.status):e);
type Params={params:Promise<{id:string}>};
async function logoId({params}:Params){const {id}=await params;if(!validId(id))throw new StudioError(LOGO_NOT_FOUND,404);return id}
export async function GET(request:Request,route:Params){try{
 const id=await logoId(route),ctx=await context(request);
 bucket(ctx.BUCKET);
 const logo=await findLogo(kitDb(ctx.DB),ctx.org,id);
 if(!logo)throw new StudioError(LOGO_NOT_FOUND,404);
 return mediaRedirect(logoKey(ctx.org,id),new URL(request.url).searchParams.has('download')?logoFilename(logo.name,logo.type):undefined);
}catch(e){return failure(e)}}
export async function PATCH(request:Request,route:Params){try{
 const id=await logoId(route),ctx=await context(request,true);
 if(!mayEditBrand(ctx))throw new StudioError(ONLY_EDITORS,403);
 const name=parseLogoName((await readJson(request,2000)).name);
 if(!name.ok)throw new StudioError(name.error);
 return Response.json({logo:await renameLogo(kitDb(ctx.DB),ctx.org,id,name.value)});
}catch(e){return failure(e)}}
export async function DELETE(request:Request,route:Params){try{
 const id=await logoId(route),ctx=await context(request,true);
 if(!mayEditBrand(ctx))throw new StudioError(ONLY_EDITORS,403);
 const store=bucket(ctx.BUCKET);
 await removeLogo(kitDb(ctx.DB),ctx.org,id);
 // The logo is gone from the kit either way; a picture left behind is only logged.
 await store.delete(logoKey(ctx.org,id)).catch(e=>console.error('Brand logo picture not removed',e instanceof Error?e.name:'UnknownError'));
 return Response.json({ok:true});
}catch(e){return failure(e)}}
