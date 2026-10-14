export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {listTopaz,startTopaz} from '@/lib/topaz-server';
const headers={'Cache-Control':'private, no-store'};
export async function GET(r:Request){try{return Response.json({jobs:await listTopaz(await context(r),new URL(r.url).searchParams.get('parentId')||'')},{headers})}catch(e){return fail(e)}}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new StudioError('Start the upscale in your studio.',403);const ctx=await context(r,true),d=await readJson(r,2048);return Response.json({job:await startTopaz(ctx,d.id,d.parentId,d.edge)},{headers})}catch(e){return fail(e)}}
