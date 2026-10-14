export const runtime='nodejs';
export const maxDuration=300;
import {context,readJson,fail} from '@/lib/studio-server';
import {smartInput,buildSmartPlan} from '@/lib/smart-reference-server';
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request);return Response.json(await buildSmartPlan(ctx,smartInput(d,ctx)))}catch(e){return fail(e)}}
