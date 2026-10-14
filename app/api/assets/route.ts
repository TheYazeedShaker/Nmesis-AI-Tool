import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,imageType,StudioError} from '@/lib/studio-server';
export async function POST(request:Request){try{
 const ctx=await context(request,true);const store=bucket(ctx.BUCKET);
 if(Number(request.headers.get('content-length')||0)>9_000_000)throw new StudioError('Choose an image under 8 MB.',413);
 const form=await readStudioForm(request,ctx,9_000_000);const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>8_000_000)throw new StudioError('Choose a PNG, JPEG or WebP image under 8 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());const type=imageType(bytes);if(!type)throw new StudioError('Only PNG, JPEG and WebP images are supported.');
 const id=crypto.randomUUID();await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:type}});
 return Response.json({id,url:'/api/assets/'+id});
 }catch(e){return fail(e)}}
