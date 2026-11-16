export const runtime='nodejs';
export const maxDuration=300;
import {listed} from '@/lib/trash';
import {trashReady} from '@/lib/trash-ready';
import {context,fail,readJson,validId,bucket,imageKey,StudioError} from '@/lib/studio-server';
import {swapRow} from '@/lib/swap-server';
import {database} from '@/lib/film-server';
import {cleanSwap,publicSwap} from '@/lib/swaps';
import {orgOf} from '@/lib/portable/tenancy';
import {syncWork} from '@/lib/library-sync';
export async function GET(request:Request){try{const ctx=await context(request);const deleted=new URL(request.url).searchParams.get('deleted')==='1',db=database(ctx),ready=await trashReady(db);const rows=await db.prepare('SELECT * FROM swap_jobs WHERE org_id=?'+listed(deleted,ready)+' ORDER BY created_at DESC LIMIT 100').bind(ctx.org).all();return Response.json({swaps:rows.results.map(publicSwap)},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),raw=await readJson(request);let d;try{d=cleanSwap(raw)}catch(e){throw new StudioError((e as Error).message)}if(!validId(d.sourceId)||d.imageIds.some(id=>!validId(id))||new Set(d.imageIds).size!==d.imageIds.length)throw new StudioError('Use saved ad and car references.');const store=bucket(ctx.BUCKET);if(!await store.head(ctx.prefix+'swap-sources/'+d.sourceId+'.mp4'))throw new StudioError('The reference ad could not be found.');for(const id of d.imageIds)if(!await store.head(imageKey(ctx.prefix,id)))throw new StudioError('One of the car views could not be found.');const id=crypto.randomUUID(),now=Date.now();await database(ctx).prepare('INSERT INTO swap_jobs(id,org_id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,orgOf(ctx.prefix),ctx.prefix,ctx.prefix,'draft',JSON.stringify(d),now,now).run();await syncWork(ctx,'swap',id);return Response.json({swap:publicSwap(await swapRow(ctx,id))})}catch(e){return fail(e)}}
