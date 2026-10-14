export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,StudioError} from '@/lib/studio-server';
import {provider,videoCredential} from '@/lib/film-server';
import {providerUrl} from '@/lib/film-policy';
import {providerFailureMessage} from '@/lib/provider-failure';
import {swapRow} from '@/lib/swap-server';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const ctx=await context(request),row=await swapRow(ctx,(await params).id);
 if(!row.provider_id||!row.status_url)throw new StudioError('Higgsfield has not returned a request ID for this swap.',409);
 const credential=await videoCredential(ctx);if(credential.prefix!==row.payer)throw new StudioError('The video connection owner changed.',409);
 const result=await provider(credential.key,providerUrl(row.status_url,'status',row.provider_id));
 if(result.request_id!==row.provider_id)throw new StudioError('The video service returned another request.',502);
 return Response.json({status:result.status,reason:providerFailureMessage(result.error||result.detail,'Higgsfield did not provide a specific failure reason.')},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
