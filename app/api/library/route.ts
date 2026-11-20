export const runtime='nodejs';
export const maxDuration=60;
import {after} from 'next/server.js';
import {context,fail} from '@/lib/studio-server';
import {backfillOnce} from '@/lib/library-backfill';
import {libraryItem,libraryPage,readQuery} from '@/lib/library-page';
import {workRef} from '@/lib/work-ref';
import {StudioError} from '@/lib/studio-server';
import {getDirectory,type Car} from '@/lib/accounts/directory';
import {brandCarNames,brandCars,inBrand} from '@/lib/brand-scope';
import {carName} from '@/lib/car-names';
import {serverTiming,timed} from '@/lib/server-timing';
// The one shared library, a page at a time, from the database alone:
// ?in=<all|unsorted|deleted|folder>&tool=&car=&who=you|others&q=&sort=new|old|name&offset=&limit=
// or ?item=<kind>:<id>: that one piece of work, for a link to work older than the pages loaded (Projects' ?open=).
// A company with several brands sees the work of the brand it works as (and
// work with no car); the master list's cars are cached on the server. The car
// filter lists the company's cars (the chosen brand's), with work or without.
// Server-Timing: the sign-in check (auth), the context (account), the brand's cars, the page.
export async function GET(request:Request){const timing=serverTiming();try{
 const ctx=await context(request,false,timing),directory=getDirectory();
 // The first open after 0007 fills this company's index, once, after the response (lib/library-backfill.ts).
 // Outside a Next.js request (the route tests) there is no after(): the next real open does it.
 try{after(()=>backfillOnce({DB:ctx.DB,BUCKET:ctx.BUCKET,org:ctx.org}))}catch(e){console.info('library: backfill not scheduled',e instanceof Error?e.message.slice(0,80):'unknown')}
 const scoped=!!inBrand(ctx.account);
 let cars:Car[]|null=null;
 if(directory){
  try{cars=await timing.time('cars',()=>directory.cars(ctx.org))}
  catch(e){
   // Scoping to a brand needs the cars: without them the answer would show every brand's work.
   if(scoped)throw e;
   // Otherwise only the filter's choices are missing: it lists the cars that have work.
   console.warn('library: the company’s cars did not load; the car filter lists cars with work',e instanceof Error?e.name:'UnknownError');
  }
 }
 const names=scoped&&cars?brandCarNames(ctx.account,cars):null;
 const asked=new URL(request.url).searchParams.get('item');
 if(asked!==null){
  const ref=workRef(asked.slice(0,100)),item=ref?await timing.time('item',()=>libraryItem(ctx,ref,{brandCars:names})):null;
  if(!item)throw new StudioError('That piece of work isn’t in your Projects. It may have been deleted, or kept private by the person who made it.',404);
  return timed(Response.json({item},{headers:{'Cache-Control':'private, no-store'}}),timing);
 }
 const carChoices=cars?brandCars(ctx.account,cars).map(c=>carName(c.brandName,c.modelName)):null;
 return timed(Response.json(await timing.time('library',()=>libraryPage(ctx,readQuery(new URL(request.url)),{brandCars:names,carChoices})),{headers:{'Cache-Control':'private, no-store'}}),timing);
}catch(e){return timed(fail(e),timing)}}
