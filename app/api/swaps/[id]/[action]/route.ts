export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {withSwapLock,quoteSwap,renderSwap,refreshSwap,recoverSwap,cancelSwap} from '@/lib/swap-server';
import {publicSwap} from '@/lib/swaps';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){try{const ctx=await context(request,true),{id,action}=await params;const data=action==='render'?await readJson(request):{};const row=await withSwapLock(ctx,id,async row=>{if(action==='quote')await quoteSwap(ctx,row);else if(action==='render')await renderSwap(ctx,row,data.approvedEstimate,data.approvedRevision);else if(action==='refresh')await refreshSwap(ctx,row);else if(action==='recover')await recoverSwap(ctx,row);else if(action==='cancel')await cancelSwap(ctx,row);else throw new StudioError('Unknown swap action.',404)});return Response.json({swap:publicSwap(row)})}catch(e){return fail(e)}}
