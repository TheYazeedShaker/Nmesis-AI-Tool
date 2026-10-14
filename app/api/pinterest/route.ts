export const runtime='nodejs';
export const maxDuration=300;
import {bucket,context,fail,imageKey,imageType,readJson,StudioError} from '@/lib/studio-server';
import {checkedPinterestUrl,publicFetch,boundedBytes,pinMetadata} from '@/lib/pinterest';
export async function POST(request:Request){try{
 const ctx=await context(request,true),store=bucket(ctx.BUCKET),data=await readJson(request);
 if(typeof data.url!=='string'||data.url.length>2000)throw new StudioError('Paste a Pinterest pin link.');
 let pin,image,title,bytes;
 try{
  const input=checkedPinterestUrl(data.url.trim());if(input.hostname!=='pin.it'&&!/^\/pin\/[\w-]+\/?$/.test(input.pathname))throw new Error('Open a specific Pinterest pin and paste its link here.');
  const page=await publicFetch(input.href);pin=page.url;const meta=pinMetadata(new TextDecoder().decode(await boundedBytes(page.response,2_000_000)));image=meta.image;title=meta.title;
  const asset=await publicFetch(image,true);bytes=await boundedBytes(asset.response,8_000_000);
 }catch(e){throw new StudioError(e instanceof Error&&e.name==='Error'?e.message:'Pinterest is taking too long. Try again or add the image in More options.',422)}
 const type=imageType(bytes);if(!type)throw new StudioError('Choose an image pin in PNG, JPEG or WebP format. Video pins need a still image.',422);
 const id=crypto.randomUUID();await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:type}});
 return Response.json({id,url:'/api/assets/'+id,name:title,pin},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
