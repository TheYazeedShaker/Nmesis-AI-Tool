export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,bucket} from '@/lib/studio-server';
import {connectionState,managedVideoKeys,saveVideoCredential} from '@/lib/film-server';
// The company's own Higgsfield key (studio.own_keys). The daily budget is gone:
// every film, swap and image spends the company's credits instead (S3).
export async function GET(request:Request){try{return Response.json(await connectionState(await context(request)),{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request);await saveVideoCredential(ctx,d.key);return Response.json(await connectionState(ctx))}catch(e){return fail(e)}}
export async function DELETE(request:Request){try{const ctx=await context(request,true),keys=await managedVideoKeys(ctx);await bucket(ctx.BUCKET).delete(keys.prefix+'credentials/higgsfield.json');return Response.json(await connectionState(ctx))}catch(e){return fail(e)}}
