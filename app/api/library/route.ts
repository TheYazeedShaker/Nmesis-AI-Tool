export const runtime='nodejs';
export const maxDuration=300;
import {context,fail} from '@/lib/studio-server';
import {companyLibrary} from '@/lib/library';
// The one shared library: every kind of work the company has made, with its folders.
export async function GET(request:Request){try{return Response.json(await companyLibrary(await context(request)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
