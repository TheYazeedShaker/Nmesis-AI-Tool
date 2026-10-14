export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {boardRow,withBoard,checkAssets} from '@/lib/storyboard-server';
import {editBoard} from '@/lib/storyboards';
import {filmRow} from '@/lib/film-server';
import {FILM_MODELS} from '@/lib/films';
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{return Response.json({board:await boardRow(await context(request),(await params).id)},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function PATCH(request:Request,{params}:Params){try{const ctx=await context(request,true),d=await readJson(request,80000);const board=await withBoard(ctx,(await params).id,d.revision,async(b,save)=>{let next;try{next=editBoard(b,d)}catch(e){throw new StudioError((e as Error).message)}if(!FILM_MODELS.some(m=>m.id===next.model&&!m.reference))throw new StudioError('Choose an image-to-video model.');for(const s of b.shots){if(s.filmId&&next.shots.find(x=>x.id===s.id)?.filmId!==s.filmId){const f=await filmRow(ctx,s.filmId);if(['queued','in_progress','archiving','unknown','submitting'].includes(f.status))throw new StudioError('Resolve the current video render before changing its references or direction.',409)}}await checkAssets(ctx,next);await save(next)});return Response.json({board})}catch(e){return fail(e)}}
