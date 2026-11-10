export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,readJson,StudioError} from '@/lib/studio-server';
import {pinterestReference,highestPinterestImage} from '@/lib/pinterest';
import {PREPARED_REFERENCE_BYTES} from '@/lib/reference-policy';
export async function POST(request:Request){try{
 const ctx=await context(request,true),store=bucket(ctx.BUCKET),data=await readJson(request);
 if(typeof data.url!=='string'||data.url.length>2000)throw new StudioError('Paste a Pinterest pin link.');
 let reference,asset;
 try{reference=await pinterestReference(data.url);asset=await highestPinterestImage(reference.image)}
 catch(e){throw new StudioError(e instanceof Error&&e.name==='Error'?e.message:'Pinterest is taking too long. Try again or paste or upload the image.',422)}
 const id=crypto.randomUUID(),needsPreparation=asset.bytes.length>PREPARED_REFERENCE_BYTES;
 // Large originals stay separate until the browser has prepared a model-safe copy.
 await store.put(needsPreparation?ctx.prefix+'originals/'+id:imageKey(ctx.prefix,id),asset.bytes,{httpMetadata:{contentType:asset.type}});
 return Response.json({id,url:'/api/assets/'+id+(needsPreparation?'?original=1':''),name:reference.title,pin:reference.pin,width:asset.width,height:asset.height,original:asset.original,needsPreparation},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
