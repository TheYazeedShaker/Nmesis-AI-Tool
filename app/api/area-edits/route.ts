import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,StudioError,validId,str,providerError} from '@/lib/studio-server';
import {googleKey,renderGoogleImage} from '@/lib/gemini-server';
import {geminiImageModel} from '@/lib/image-models';
import {googleAreaInputs,googleAreaPrompt,normalizeGoogleArea} from '@/lib/google-area-edit';
import {apiKey} from '@/lib/credentials';
import {database} from '@/lib/film-server';
import {publicImage,type ImageRow} from '@/lib/image-server';
import {imageDimensions} from '@/lib/image-dimensions';
import {areaSize,areaRenderSize,readPng,selectionMask,providerMask,compositeArea,areaPrompt,edgeBlend,featherSelection,contentAwareMatte,contextRegion,cropSelection,cropWorkingImage,areaIntent,resolveAreaIntent} from '@/lib/area-edit';
import {encode} from 'fast-png';
import {textureFill} from '@/lib/texture-fill';
import {placementBounds,objectLayerPrompt,compositeObjectLayer} from '@/lib/object-layer';
import type {Visual} from '@/lib/studio';
export async function POST(request:Request){let record:Visual|undefined,store:R2Bucket|undefined,recordKey='',reserved=false;
 try{
  const ctx=await context(request,true);store=bucket(ctx.BUCKET);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Start the edit from your studio.',403);
  const max=45_000_000;if(Number(request.headers.get('content-length')||0)>max)throw new StudioError('The edit files are too large.',413);
  const form=await readStudioForm(request,ctx,max);
  const id=form.get('id'),parentId=form.get('parentId'),instruction=str(form.get('instruction'),1500);
  if(!validId(id)||!validId(parentId))throw new StudioError('Choose a saved visual.');if(instruction.length<3)throw new StudioError('Describe the change for the selected area.');
  const provider=form.get('provider')||'openai';if(provider!=='openai'&&provider!=='google')throw new StudioError('Choose ChatGPT or Google for area editing.');
  let model:string;try{model=provider==='google'?geminiImageModel(form.get('model')).id:ctx.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst'}catch(e){throw new StudioError((e as Error).message)}
  const saved=await store.get(ctx.prefix+'visuals/'+parentId+'.json');let parent:Visual|null=saved?await saved.json<Visual>():null;
  if(!parent){const row=await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(parentId,ctx.prefix).first<ImageRow>();if(row)parent=publicImage(row)}
  const original=await store.get(imageKey(ctx.prefix,parentId));if(!parent||parent.status!=='ready'||!original)throw new StudioError('The original visual is unavailable.',404);
  const originalBytes=new Uint8Array(await original.arrayBuffer());let dimensions,work,mask:Uint8Array;
  const fileBytes=async(name:string,limit:number)=>{const f=form.get(name);if(!(f instanceof File)||!f.size||f.size>limit)throw new StudioError('Invalid '+name+' image.');return new Uint8Array(await f.arrayBuffer())};
  let base=originalBytes;let working:Uint8Array=await fileBytes('working',12_000_000);const maskBytes=await fileBytes('selection',10_000_000);
  try{dimensions=imageDimensions(originalBytes);work=areaSize(dimensions.width,dimensions.height);if(dimensions.type!=='image/png'||originalBytes[24]!==8||![0,2,4,6].includes(originalBytes[25])){base=await fileBytes('normalized',30_000_000);const d=imageDimensions(base);if(d.width!==dimensions.width||d.height!==dimensions.height)throw new Error('The edit image dimensions changed.')}const w=readPng(working,2048*2048);if(w.width!==work.width||w.height!==work.height)throw new Error('The working image dimensions changed.');mask=selectionMask(maskBytes,dimensions.width,dimensions.height)}catch(e){throw new StudioError((e as Error).message)}
  const reference=form.get('reference');let referenceBytes:Uint8Array|undefined,referenceType='';if(reference instanceof File&&reference.size){if(reference.size>8_000_000)throw new StudioError('Choose a reference under 8 MB.');referenceBytes=new Uint8Array(await reference.arrayBuffer());try{referenceType=imageDimensions(referenceBytes).type}catch{throw new StudioError('Choose a PNG, JPEG or WebP reference.')}}
  let blending:number;try{blending=edgeBlend(form.get('edgeBlending'))}catch(e){throw new StudioError((e as Error).message)}
  const awareValue=form.get('contentAware');if(awareValue!==null&&awareValue!=='true'&&awareValue!=='false')throw new StudioError('Choose a supported repair setting.');
  let contentAware=awareValue==='true';let intent;try{intent=resolveAreaIntent(areaIntent(form.get('intent')),instruction)}catch(e){throw new StudioError((e as Error).message)}
  const addObject=intent==='add'&&provider==='openai';if(intent==='add')contentAware=true;
  const matte=contentAware?contentAwareMatte(mask,dimensions.width,dimensions.height,blending):featherSelection(mask,dimensions.width,dimensions.height,blending);
  const generationMatte=contentAware?contentAwareMatte(matte,dimensions.width,dimensions.height,32):mask;
  const region=addObject?contextRegion(generationMatte,dimensions.width,dimensions.height):contentAware?{x:0,y:0,width:dimensions.width,height:dimensions.height}:undefined;
  let editMask=mask,maskWidth=dimensions.width,maskHeight=dimensions.height;
  if(region){work=areaRenderSize(region.width,region.height);working=cropWorkingImage(base,region,work);editMask=cropSelection(generationMatte,dimensions.width,region);maskWidth=region.width;maskHeight=region.height}
  else if(work.width*work.height<1024*1024){work=areaRenderSize(dimensions.width,dimensions.height);working=cropWorkingImage(base,{x:0,y:0,width:dimensions.width,height:dimensions.height},work)}
  const key=provider==='google'?await googleKey(ctx):await apiKey(ctx);if(!key)throw new StudioError('Connect OpenAI to use area editing.',503);
  const googleInput=provider==='google'?googleAreaInputs(working,editMask,maskWidth,maskHeight,work):undefined;
  if(googleInput&&googleInput.images.reduce((n,i)=>n+i.bytes.length,referenceBytes?.length||0)>12_000_000)throw new StudioError('Use a smaller area reference; Nano Banana inputs must stay under 12 MB total.');
  const prompt=provider==='google'?googleAreaPrompt(instruction,!!referenceBytes,intent,contentAware):addObject?objectLayerPrompt(instruction,placementBounds(mask,dimensions.width,dimensions.height,region!),!!referenceBytes):areaPrompt(instruction,!!referenceBytes,intent,contentAware),maskId=crypto.randomUUID(),referenceId=referenceBytes?crypto.randomUUID():undefined;
  record={...parent,id,title:parent.title+' · area edit',src:'/api/assets/'+id,status:'pending',createdAt:new Date().toISOString(),provider,model,prompt,error:undefined,upscale:undefined,estimate:undefined,jobStatus:undefined,revision:undefined,pricingDescription:undefined,areaEdit:{parentId,parentSrc:parent.src,maskId,referenceId,instruction,contentAware,intent,method:addObject?'object-layer':contentAware?'scene-fill':'masked-edit',region,edgeBlending:blending,renderWidth:work.width,renderHeight:work.height}};
  recordKey=ctx.prefix+'visuals/'+id+'.json';reserved=!!await store.put(recordKey,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!reserved)throw new StudioError('This edit has already been submitted. Refresh saved visuals before retrying.',409);
  await store.put(imageKey(ctx.prefix,maskId),maskBytes,{httpMetadata:{contentType:'image/png'}});if(referenceBytes&&referenceId)await store.put(imageKey(ctx.prefix,referenceId),referenceBytes,{httpMetadata:{contentType:referenceType}});
  let candidate:Uint8Array;
  if(googleInput){
   const inputs=[...googleInput.images];if(referenceBytes)inputs.push({bytes:referenceBytes,type:referenceType});
   const rendered=await renderGoogleImage(key,model,'2048x1152',prompt,inputs,googleInput.aspectRatio);
   try{candidate=normalizeGoogleArea(rendered.bytes,googleInput.frame,googleInput.region,work)}catch(e){throw new StudioError((e as Error).message,502)}
  }else{
  const payload=new FormData();payload.set('model',record.model!);payload.set('prompt',prompt);payload.set('size',work.width+'x'+work.height);payload.set('quality','high');payload.set('n','1');payload.set('output_format','png');payload.append('image[]',new Blob([working as BlobPart],{type:'image/png'}),'visual.png');if(referenceBytes)payload.append('image[]',new Blob([referenceBytes as BlobPart],{type:referenceType}),'area-reference.'+(referenceType==='image/jpeg'?'jpg':referenceType==='image/webp'?'webp':'png'));if(addObject)payload.set('background','transparent');else payload.set('mask',new Blob([providerMask(editMask,maskWidth,maskHeight,work) as BlobPart],{type:'image/png'}),'mask.png');
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+key},body:payload,signal:AbortSignal.timeout(240000)});if(!response.ok)throw await providerError(response);
  const result:any=await response.json(),encoded=result.data?.[0]?.b64_json;if(typeof encoded!=='string'||encoded.length>35_000_000)throw new StudioError('The image service returned no usable edit.',502);
  candidate=Buffer.from(encoded,'base64');result.data=undefined;
  }
  let composite;try{
   if(contentAware&&(intent==='remove'||intent==='repair')){
    const proposal=readPng(candidate,2048*2048);if(proposal.width!==work.width||proposal.height!==work.height)throw new Error('The image service changed the frame size. Your original is preserved.');
    const fill=textureFill(readPng(base),proposal,mask,matte);if(fill){candidate=encode(fill);record.areaEdit!.method='texture-fill'}
   }
   composite=addObject?compositeObjectLayer(base,candidate,matte,work,region!):compositeArea(base,candidate,matte,work,region,contentAware&&blending>0,contentAware&&blending>0?mask:undefined)}catch(e){throw new StudioError((e as Error).message,502)}
  await store.put(imageKey(ctx.prefix,id),composite,{httpMetadata:{contentType:'image/png'}});record={...record,status:'ready',width:dimensions.width,height:dimensions.height,size:dimensions.width+'x'+dimensions.height};await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
  return Response.json({visual:record},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){if(reserved&&record&&store){record.status='failed';record.error=e instanceof StudioError?e.message:'The area edit was interrupted. Check saved visuals before retrying.';await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}}).catch(()=>{})}const response=fail(e);if(!record)response.headers.set('X-Area-Edit-Not-Started','true');return response}
}
