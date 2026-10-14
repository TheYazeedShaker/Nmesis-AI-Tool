import {context,fail,StudioError} from '@/lib/studio-server';
import {swapRow} from '@/lib/swap-server';
import {mediaRedirect} from '@/lib/portable/storage';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request),row=await swapRow(ctx,(await params).id);if(!row.result_key)throw new StudioError('This film is not ready.',404);return mediaRedirect(row.result_key,new URL(request.url).searchParams.has('download')?'nmesis-swap.mp4':undefined)}catch(e){return fail(e)}}
