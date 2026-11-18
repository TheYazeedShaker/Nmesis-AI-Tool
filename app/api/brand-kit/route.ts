export const runtime='nodejs';
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {BrandKitError,kitDb,mayEditBrand,ONLY_EDITORS,parseKit,readKit,saveKit} from '@/lib/brand-kit';
// The company's brand kit. GET: everyone in the company. PUT (colours, fonts,
// voice; a field left out keeps its value): owners and creators only. The
// company is always the signed-in person's own (ctx.org), never the body's.
const failure=(e:unknown)=>fail(e instanceof BrandKitError?new StudioError(e.message,e.status):e);
export async function GET(request:Request){try{
 const ctx=await context(request);
 return Response.json({kit:await readKit(kitDb(ctx.DB),ctx.org)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e)}}
export async function PUT(request:Request){try{
 const ctx=await context(request,true);
 if(!mayEditBrand(ctx))throw new StudioError(ONLY_EDITORS,403);
 const parsed=parseKit(await readJson(request,8000));
 if(!parsed.ok)throw new StudioError(parsed.error);
 return Response.json({kit:await saveKit(kitDb(ctx.DB),ctx.org,ctx.userId,parsed.fields)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e)}}
