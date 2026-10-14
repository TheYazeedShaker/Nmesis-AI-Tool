export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {withImageLock,quoteImage,renderImage,refreshImage,recoverImage,generateImage} from '@/lib/image-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){try{const ctx=await context(request,true),{id,action}=await params,d=action==='render'?await readJson(request):{};const visual=await withImageLock(ctx,id,async row=>{if(action==='generate')await generateImage(ctx,row);else if(action==='quote')await quoteImage(ctx,row);else if(action==='render')await renderImage(ctx,row,d.approvedEstimate,d.approvedRevision);else if(action==='refresh')await refreshImage(ctx,row);else if(action==='recover')await recoverImage(ctx,row);else throw new StudioError('Unknown image action.',404)});return Response.json({visual})}catch(e){return fail(e)}}
