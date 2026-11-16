export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {createFolder} from '@/lib/folders';
// A new folder (or sub-folder). The list comes with the library (/api/library).
export async function POST(request:Request){try{const ctx=await context(request,true);return Response.json(await createFolder(ctx,await readJson(request,2000)))}catch(e){return fail(e)}}
