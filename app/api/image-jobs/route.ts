export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson} from '@/lib/studio-server';
import {createImage,publicImage,withImageLock,generateImage} from '@/lib/image-server';
export async function POST(request:Request){try{const ctx=await context(request,true),input=await readJson(request,32768),row=await createImage(ctx,input);const visual=input.generate===true?await withImageLock(ctx,row.id,r=>generateImage(ctx,r)):publicImage(row);return Response.json({visual})}catch(e){return fail(e)}}
