export const runtime='nodejs';
import {context,fail,StudioError} from '@/lib/studio-server';
import {carConfigurators} from '@/lib/configurators';
import {getDirectory} from '@/lib/accounts/directory';
// The signed-in company's live cars only (staff: every live car), cached 10 minutes
// per company on the server. Never built into the browser bundle.
export async function GET(request:Request){try{
 const ctx=await context(request),directory=getDirectory();if(!directory)throw new StudioError('The company list is not connected yet.',503);
 const cars=await directory.cars(ctx.account.staff?null:ctx.org);
 return Response.json({configurators:carConfigurators(cars)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
