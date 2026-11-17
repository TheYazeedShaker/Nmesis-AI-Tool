export const runtime='nodejs';
import {context,fail} from '@/lib/studio-server';
import {creditOverview} from '@/lib/credits/usage';
import {serverTiming,timed} from '@/lib/server-timing';
// The company's credits for the workspace: the top-bar meter, the 80% / 100%
// banner and the "N credits" shown before every paid action. Credits only.
// Server-Timing: the sign-in check (auth), the context (account), the credits.
export async function GET(request:Request){
 const timing=serverTiming();
 try{const ctx=await context(request,false,timing);return timed(Response.json(await timing.time('credits',()=>creditOverview(ctx)),{headers:{'Cache-Control':'private, no-store'}}),timing)}
 catch(e){return timed(fail(e),timing)}
}
