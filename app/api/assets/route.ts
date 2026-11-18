import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,imageType,StudioError} from '@/lib/studio-server';
import {UPLOADS_SHOWN,uploadMarkKey,uploadsFrom,uploadsPrefix} from '@/lib/uploads';
// POST: a picture the person adds (a car view, a reference, a crop) becomes one
// of their assets. With `upload=1` it is also one of their Uploads (the left
// navigation's Uploads panel): a small mark beside it, listed by GET.
export async function POST(request:Request){try{
 const ctx=await context(request,true);const store=bucket(ctx.BUCKET);
 if(Number(request.headers.get('content-length')||0)>9_000_000)throw new StudioError('Choose an image under 8 MB.',413);
 const form=await readStudioForm(request,ctx,9_000_000);const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>8_000_000)throw new StudioError('Choose a PNG, JPEG or WebP image under 8 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());const type=imageType(bytes);if(!type)throw new StudioError('Only PNG, JPEG and WebP images are supported.');
 const id=crypto.randomUUID();await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:type}});
 if(form.get('upload')==='1')await store.put(uploadMarkKey(ctx.prefix,id),'{}',{httpMetadata:{contentType:'application/json'}});
 return Response.json({id,url:'/api/assets/'+id});
 }catch(e){return fail(e)}}
// GET: the signed-in person's own Uploads, newest first (their prefix only).
export async function GET(request:Request){try{
 const ctx=await context(request);const store=bucket(ctx.BUCKET);
 const listed=await store.list({prefix:uploadsPrefix(ctx.prefix),limit:1000});
 return Response.json({uploads:uploadsFrom(listed.objects,ctx.prefix).slice(0,UPLOADS_SHOWN)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return fail(e)}}
