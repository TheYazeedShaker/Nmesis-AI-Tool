export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,StudioError} from '@/lib/studio-server';
import {refreshTopaz} from '@/lib/topaz-server';
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new StudioError('Refresh the upscale in your studio.',403);return Response.json({job:await refreshTopaz(await context(r,true),(await params).id)},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
