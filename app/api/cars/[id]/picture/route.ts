export const runtime='nodejs';
import {context,fail,StudioError} from '@/lib/studio-server';
import {getDirectory} from '@/lib/accounts/directory';
import {getStorage} from '@/lib/portable/storage';
import {configuratorApiOrigin,ID,PICTURE_WIDTH,pictureKey,readCar,storeSmall} from '@/lib/car-pictures';
// A car's real picture for Home and the car picker: the configurator's opening
// frame, made small once and kept in the company's storage, on a signed link.
// Only a car the company may use (staff: any live car). 404: the car has no
// frames: 204 (the page shows a neutral car instead).
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await context(request),{id}=await params;
 const [brandId,modelId,...rest]=id.split('.');
 if(rest.length||!ID.test(brandId||'')||!ID.test(modelId||''))throw new StudioError('That car isn’t here.',404);
 const directory=getDirectory(),store=getStorage(),origin=configuratorApiOrigin();
 if(!directory||!store||!origin)throw new StudioError('Car pictures aren’t available on this Studio yet.',503);
 const cars=await directory.cars(ctx.account.staff?null:ctx.org);
 if(!cars.some(c=>c.brandId===brandId&&c.modelId===modelId))throw new StudioError('That car isn’t here.',404);
 let key:string|null=null;
 try{
  const {frame}=await readCar(brandId,modelId,{origin});
  if(frame)key=await storeSmall(store,pictureKey(ctx.org,brandId,modelId,frame),frame,{box:{width:PICTURE_WIDTH}});
 }catch(e){console.warn('Car picture unavailable',JSON.stringify({car:id,reason:e instanceof Error?e.message.slice(0,120):'unknown'}))}
 // No frames (or no logo) is expected, not an error: no content, and the page shows its placeholder.
 if(!key)return new Response(null,{status:204,headers:{'Cache-Control':'private, max-age=300'}});
 return new Response(null,{status:307,headers:{Location:await store.downloadUrl(key),'Cache-Control':'private, max-age=600'}});
}catch(e){return fail(e)}}
