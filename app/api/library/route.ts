export const runtime='nodejs';
export const maxDuration=60;
import {context,fail} from '@/lib/studio-server';
import {libraryPage,readQuery} from '@/lib/library-page';
import {getDirectory} from '@/lib/accounts/directory';
import {brandCarNames,inBrand} from '@/lib/brand-scope';
// The one shared library, a page at a time, from the database alone:
// ?in=<all|unsorted|deleted|folder>&tool=&car=&who=you|others&q=&sort=new|old|name&offset=&limit=
// A company with several brands sees the work of the brand it works as (and
// work with no car); the master list's cars are cached on the server.
export async function GET(request:Request){try{
 const ctx=await context(request),directory=getDirectory();
 const names=inBrand(ctx.account)&&directory?brandCarNames(ctx.account,await directory.cars(ctx.org)):null;
 return Response.json(await libraryPage(ctx,readQuery(new URL(request.url)),{brandCars:names}),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
