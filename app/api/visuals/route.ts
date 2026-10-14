export const runtime='nodejs';
export const maxDuration=300;
import {context,fail} from '@/lib/studio-server';
import {visualLibrary} from '@/lib/visual-library';
export async function GET(request:Request){try{return Response.json(await visualLibrary(await context(request),new URL(request.url).searchParams.get('deleted')==='1'),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
