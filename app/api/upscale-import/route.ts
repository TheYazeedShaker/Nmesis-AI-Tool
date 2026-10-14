import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,StudioError,validId} from '@/lib/studio-server';
import {database} from '@/lib/film-server';
import {publicImage,type ImageRow} from '@/lib/image-server';
import {upscaleModel} from '@/lib/upscale-models';
import {imageDimensions} from '@/lib/image-dimensions';
import type {Visual} from '@/lib/studio';

export async function POST(request:Request){try{
  const ctx=await context(request,true),store=bucket(ctx.BUCKET);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Import from your studio.',403);
  const max=31_000_000;if(Number(request.headers.get('content-length')||0)>max)throw new StudioError('Choose an image under 30 MB.',413);
  const form=await readStudioForm(request,ctx,max);
  const parentId=form.get('parentId');if(!validId(parentId))throw new StudioError('Choose a saved visual first.');
  let model;try{model=upscaleModel(form.get('model'))}catch(e){throw new StudioError((e as Error).message)}
  const saved=await store.get(ctx.prefix+'visuals/'+parentId+'.json');let parent:Visual|null=saved?await saved.json<Visual>():null;
  if(!parent){const row=await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(parentId,ctx.prefix).first<ImageRow>();if(row)parent=publicImage(row)}
  if(!parent||parent.status!=='ready')throw new StudioError('The original visual is unavailable.',404);
  const original=await store.head(imageKey(ctx.prefix,parentId));if(!original)throw new StudioError('The original image is unavailable.',404);
  const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>30_000_000)throw new StudioError('Choose a PNG, JPEG or WebP under 30 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());let dimensions;try{dimensions=imageDimensions(bytes)}catch(e){throw new StudioError((e as Error).message)}
  if(parent.width&&parent.height){
    if(dimensions.width<=parent.width||dimensions.height<=parent.height)throw new StudioError('The imported image must be larger than the original.');
    if(Math.abs(dimensions.width/dimensions.height-parent.width/parent.height)/(parent.width/parent.height)>.01)throw new StudioError('The image shape changed. Export the upscale with the original aspect ratio.');
  }
  const id=crypto.randomUUID(),{width,height,type}=dimensions;
  const visual:Visual={id,title:parent.title+' · upscaled',src:'/api/assets/'+id,status:'ready',createdAt:new Date().toISOString(),width,height,size:width+'x'+height,provider:parent.provider,model:parent.model,vehicle:parent.vehicle,configurator:parent.configurator,sourceId:parent.sourceId,moodId:parent.moodId,brief:parent.brief,prompt:parent.prompt,finish:parent.finish,angle:parent.angle,pin:parent.pin,upscale:{modelId:model.id,parentId,parentSrc:parent.src,method:'external-import'}};
  await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:type}});
  await store.put(ctx.prefix+'visuals/'+id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
  return Response.json({visual},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
