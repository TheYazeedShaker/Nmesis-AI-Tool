export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {moveItems} from '@/lib/folders';
// Move work into a folder ({ items: [{ kind, id }], folderId }) or out of every folder (folderId: null).
export async function POST(request:Request){try{const ctx=await context(request,true);return Response.json(await moveItems(ctx,await readJson(request,40000)))}catch(e){return fail(e)}}
