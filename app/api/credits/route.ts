export const runtime='nodejs';
import {context,fail} from '@/lib/studio-server';
import {creditOverview} from '@/lib/credits/usage';
// The company's credits for the workspace: the top-bar meter, the 80% / 100%
// banner and the "N credits" shown before every paid action. Credits only.
export async function GET(request:Request){try{return Response.json(await creditOverview(await context(request)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
