export const runtime='nodejs';
import {context,fail} from '@/lib/studio-server';
import {companyOverview} from '@/lib/company';
// Company settings: the company, its plan and its brands (everyone in it reads).
export async function GET(request:Request){try{return Response.json(await companyOverview(await context(request)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
