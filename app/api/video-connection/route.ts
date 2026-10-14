export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,bucket,StudioError} from '@/lib/studio-server';
import {budget,connectionState,database,saveVideoCredential} from '@/lib/film-server';
import {sponsorship} from '@/lib/sponsored-access';
export async function GET(request:Request){try{return Response.json(await connectionState(await context(request)),{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request);await saveVideoCredential(ctx,d.key);return Response.json(await connectionState(ctx))}catch(e){return fail(e)}}
export async function DELETE(request:Request){try{const ctx=await context(request,true);if(sponsorship(ctx).isGuest)throw new StudioError('Your owner manages this connection.',403);await bucket(ctx.BUCKET).delete(ctx.prefix+'credentials/higgsfield.json');return Response.json(await connectionState(ctx))}catch(e){return fail(e)}}
export async function PATCH(request:Request){try{const ctx=await context(request,true);if(sponsorship(ctx).isGuest)throw new StudioError('Your owner manages the budget.',403);const d=await readJson(request);if(typeof d.dailyLimit!=='number'||!Number.isInteger(d.dailyLimit)||d.dailyLimit<0||d.dailyLimit>1000_000_000||typeof d.paused!=='boolean')throw new StudioError('Choose a daily budget between $0 and $1,000.');await budget(ctx,ctx.prefix);await database(ctx).prepare('UPDATE film_budgets SET daily_limit=?,paused=? WHERE payer=?').bind(d.dailyLimit,d.paused?1:0,ctx.prefix).run();return Response.json(await connectionState(ctx))}catch(e){return fail(e)}}
