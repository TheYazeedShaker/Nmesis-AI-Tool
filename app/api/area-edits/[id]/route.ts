export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,validId,StudioError} from '@/lib/studio-server';
import type {Visual} from '@/lib/studio';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await context(request),{id}=await params;if(!validId(id))throw new StudioError('Invalid area edit.');
 const store=bucket(ctx.BUCKET),item=await store.get(ctx.prefix+'visuals/'+id+'.json');
 if(!item)return Response.json({status:'not-found'},{headers:{'Cache-Control':'private, no-store'}});
 const visual=await item.json<Visual>();if(!visual.areaEdit)throw new StudioError('Area edit not found.',404);
 // If saving metadata was interrupted after the image was stored, recover it.
 if(await store.head(imageKey(ctx.prefix,id)))return Response.json({status:'ready',visual:{...visual,status:'ready',error:undefined}},{headers:{'Cache-Control':'private, no-store'}});
 return Response.json({status:visual.status==='failed'?'failed':'pending',error:visual.error},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
