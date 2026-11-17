export const runtime='nodejs';
import {context,fail,StudioError} from '@/lib/studio-server';
import {getDirectory} from '@/lib/accounts/directory';
import {getStorage} from '@/lib/portable/storage';
import {configuratorApiOrigin,configuratorAssets,ID,LOGO_HEIGHT,logoKey,readCar,s3AssetReader,storeSmall,type Assets} from '@/lib/car-pictures';
// A brand's logo for the top bar and the switcher: the brand name icon its
// configurator shows, made small once and kept in the company's storage, on a
// signed link. Only a brand the person can switch to. The icon is read from the
// configurator's private asset bucket with the Studio's own signed access when
// the owner set it up (lib/car-pictures.ts, CONFIGURATOR_ASSET_*), else from the
// link the configurator gives. 204: no logo (the page shows the brand's name alone).
let assets:Assets|null|undefined;
const assetAccess=()=>{if(assets===undefined){const source=configuratorAssets();assets=source?{source,read:s3AssetReader(source)}:null}return assets};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await context(request),{id}=await params;
 if(!ID.test(id))throw new StudioError('That brand isn’t here.',404);
 const mine=ctx.account.orgs.some(o=>o.brands.some(b=>b.id===id));
 const directory=getDirectory(),store=getStorage(),origin=configuratorApiOrigin();
 if(!mine)throw new StudioError('That brand isn’t here.',404);
 if(!directory||!store||!origin)throw new StudioError('Logos aren’t available on this Studio yet.',503);
 // The first of the brand's cars whose configurator has the icon.
 const cars=(await directory.cars(null)).filter(c=>c.brandId===id).slice(0,3);
 let key:string|null=null;
 for(const car of cars){
  try{
   const {icon}=await readCar(car.brandId,car.modelId,{origin});
   if(icon){key=await storeSmall(store,logoKey(ctx.org,id,icon),icon,{box:{height:LOGO_HEIGHT},assets:assetAccess()});break}
  }catch(e){console.warn('Brand logo unavailable',JSON.stringify({brand:id,reason:e instanceof Error?(e.name==='Error'?e.message:e.name).slice(0,120):'unknown'}))}
 }
 // No frames (or no logo) is expected, not an error: no content, and the page shows the name alone.
 if(!key)return new Response(null,{status:204,headers:{'Cache-Control':'private, max-age=300'}});
 return new Response(null,{status:307,headers:{Location:await store.downloadUrl(key),'Cache-Control':'private, max-age=600'}});
}catch(e){return fail(e)}}
