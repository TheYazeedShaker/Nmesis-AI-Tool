export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,StudioError} from '@/lib/studio-server';
import {cleanEmptyVisuals} from '@/lib/visual-library';
export async function POST(request:Request){try{
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Use the studio to clean your library.',403);
  return Response.json(await cleanEmptyVisuals(await context(request,true)),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
