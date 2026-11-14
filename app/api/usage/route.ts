export const runtime='nodejs';
import {context,fail} from '@/lib/studio-server';
import {usagePage} from '@/lib/credits/usage';
// The Usage page (company owners, and Nmesis staff with support access): credits
// used and left this period, by person and by tool, the last 50 actions, packs.
export async function GET(request:Request){try{return Response.json(await usagePage(await context(request)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
