export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {deleteFolder,renameFolder,restoreFolder} from '@/lib/folders';
type Params={params:Promise<{id:string}>};
// Rename.
export async function PATCH(request:Request,{params}:Params){try{const ctx=await context(request,true);return Response.json(await renameFolder(ctx,(await params).id,await readJson(request,2000)))}catch(e){return fail(e)}}
// Delete (its creator or a company owner); its work stays in the library.
export async function DELETE(request:Request,{params}:Params){try{return Response.json(await deleteFolder(await context(request,true),(await params).id))}catch(e){return fail(e)}}
// Undo a delete: { at } is what DELETE answered.
export async function POST(request:Request,{params}:Params){try{const ctx=await context(request,true),d=await readJson(request,2000);return Response.json(await restoreFolder(ctx,(await params).id,d.at))}catch(e){return fail(e)}}
