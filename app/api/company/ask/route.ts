export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {askNmesis} from '@/lib/company';
// "Ask Nmesis" { topic: 'seats' | 'pack' | 'plan' }: the company's own owners
// send Nmesis one short email from Company settings or Usage.
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request,500);return Response.json(await askNmesis(ctx,d),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
