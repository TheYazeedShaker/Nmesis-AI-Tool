export const runtime='nodejs';
export const maxDuration=60;
import {context,fail} from '@/lib/studio-server';
import {libraryPage,readQuery} from '@/lib/library-page';
import {getDirectory,type Car} from '@/lib/accounts/directory';
import {brandCarNames,brandCars,inBrand} from '@/lib/brand-scope';
import {carName} from '@/lib/car-names';
// The one shared library, a page at a time, from the database alone:
// ?in=<all|unsorted|deleted|folder>&tool=&car=&who=you|others&q=&sort=new|old|name&offset=&limit=
// A company with several brands sees the work of the brand it works as (and
// work with no car); the master list's cars are cached on the server. The car
// filter lists the company's cars (the chosen brand's), with work or without.
export async function GET(request:Request){try{
 const ctx=await context(request),directory=getDirectory();
 const scoped=!!inBrand(ctx.account);
 let cars:Car[]|null=null;
 if(directory){
  try{cars=await directory.cars(ctx.org)}
  catch(e){
   // Scoping to a brand needs the cars: without them the answer would show every brand's work.
   if(scoped)throw e;
   // Otherwise only the filter's choices are missing: it lists the cars that have work.
   console.warn('library: the company’s cars did not load; the car filter lists cars with work',e instanceof Error?e.name:'UnknownError');
  }
 }
 const names=scoped&&cars?brandCarNames(ctx.account,cars):null;
 const carChoices=cars?brandCars(ctx.account,cars).map(c=>carName(c.brandName,c.modelName)):null;
 return Response.json(await libraryPage(ctx,readQuery(new URL(request.url)),{brandCars:names,carChoices}),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
