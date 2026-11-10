import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,validId,StudioError} from '@/lib/studio-server';
import {imageDimensions} from '@/lib/image-dimensions';
import {MAX_REFERENCE_BYTES} from '@/lib/reference-policy';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await context(request,true),{id}=await params;
  if(!validId(id))throw new StudioError('Reference not found.',404);
  const store=bucket(ctx.BUCKET);if(!await store.head(imageKey(ctx.prefix,id)))throw new StudioError('Save the prepared reference first.',404);
  let bytes:Uint8Array;
  if(request.headers.get('content-type')?.startsWith('application/json')||request.headers.get('content-type')?.startsWith('multipart/form-data')){
   const form=await readStudioForm(request,ctx,MAX_REFERENCE_BYTES+1_000_000),file=form.get('image');
   if(!(file instanceof File)||!file.size||file.size>MAX_REFERENCE_BYTES)throw new StudioError('Choose an image up to 40 MB.',413);
   bytes=new Uint8Array(await file.arrayBuffer());
  }else{
   const length=Number(request.headers.get('content-length'));
   if(!Number.isSafeInteger(length)||length<1||length>MAX_REFERENCE_BYTES)throw new StudioError('Choose an image up to 40 MB.',413);
   bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length!==length||bytes.length>MAX_REFERENCE_BYTES)throw new StudioError('The original upload was incomplete.',413);
  }
  let dimensions;try{dimensions=imageDimensions(bytes)}catch(e){throw new StudioError((e as Error).message)}
  const saved=await store.put(ctx.prefix+'originals/'+id,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:dimensions.type}});
  if(!saved)throw new StudioError('This original is already saved.',409);
  return Response.json({saved:true,...dimensions},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}
}
