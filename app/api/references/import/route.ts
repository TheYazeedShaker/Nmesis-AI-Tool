export const runtime='nodejs';
export const maxDuration=60;
import {bucket,context,fail,imageKey,imageType,readJson,StudioError} from '@/lib/studio-server';
import {referenceProvider} from '@/lib/references';
import {PHOTO_ID,ReferenceProviderError} from '@/lib/references/provider';
// POST {provider, id}: brings one photo of a photo library into the signed-in
// person's own storage, as an upload would be (app/api/assets/route.ts), so
// generation can read it. The server fetches the photo through the provider
// (which also tells the library it was used); only the provider and the photo
// id are read from the body. Answers {id, url, credit}.
export async function POST(request:Request){try{
 const ctx=await context(request,true),store=bucket(ctx.BUCKET),data=await readJson(request,1000);
 const provider=referenceProvider(data.provider);
 if(!provider)throw new StudioError('Choose a photo library.');
 if(typeof data.id!=='string'||!PHOTO_ID.test(data.id))throw new StudioError('Choose a photo to add.');
 if(!provider.available(process.env))throw new StudioError(provider.unavailable,503);
 const got=await provider.fetchForUse(data.id,{signal:request.signal});
 const type=imageType(got.bytes);
 if(!type)throw new StudioError('That photo could not be used. Choose another.',422);
 const id=crypto.randomUUID();
 await store.put(imageKey(ctx.prefix,id),got.bytes,{httpMetadata:{contentType:type}});
 return Response.json({id,url:'/api/assets/'+id,credit:got.photo.credit},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e instanceof ReferenceProviderError?new StudioError(e.message,e.status):e)}}
