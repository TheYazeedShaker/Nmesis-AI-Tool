export const runtime='nodejs';
export const maxDuration=300;
import {context,fail} from '@/lib/studio-server';
import {swapRow} from '@/lib/swap-server';
import {publicSwap} from '@/lib/swaps';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request);return Response.json({swap:publicSwap(await swapRow(ctx,(await params).id))},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
