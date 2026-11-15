export const runtime='nodejs';
export const maxDuration=300;
import {trashItem} from '@/lib/trash';
import {context,fail} from '@/lib/studio-server';
import {swapRow} from '@/lib/swap-server';
import {publicSwap} from '@/lib/swaps';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request);return Response.json({swap:publicSwap(await swapRow(ctx,(await params).id,true))},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}

// Delete (to the Deleted view; POST …/restore brings it back). Creator or owner.
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await trashItem(await context(request,true),'swaps',(await params).id))}catch(e){return fail(e)}}
