export const runtime='nodejs';
import {context,fail,StudioError} from '@/lib/studio-server';
import {carConfigurators} from '@/lib/configurators';
import {getDirectory} from '@/lib/accounts/directory';
import {brandCars} from '@/lib/brand-scope';
// The signed-in company's live cars only (staff: every live car), cached 10 minutes
// per company on the server. Never built into the browser bundle. A company with
// several brands sees the cars of the brand it works as.
export async function GET(request:Request){try{
 const ctx=await context(request),directory=getDirectory();if(!directory)throw new StudioError('The company list is not connected yet.',503);
 const cars=ctx.account.staff?await directory.cars(null):brandCars(ctx.account,await directory.cars(ctx.org));
 return Response.json({configurators:carConfigurators(cars)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
