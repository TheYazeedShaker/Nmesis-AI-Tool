export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {database,filmRow,withFilmLock} from '@/lib/film-server';
import {publicFilm,validateDraft} from '@/lib/films';
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{const ctx=await context(request);return Response.json({film:publicFilm(await filmRow(ctx,(await params).id))},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function PATCH(request:Request,{params}:Params){try{const ctx=await context(request,true),d=await readJson(request);const row=await withFilmLock(ctx,(await params).id,async row=>{if(!['draft','quoted'].includes(row.status))throw new StudioError('This film is already submitted. Create another version to change its direction.',409);let clean;try{clean=validateDraft(d,JSON.parse(row.data).sourceId)}catch(e){throw new StudioError((e as Error).message)}await database(ctx).prepare("UPDATE films SET data=?,status='draft',estimate=0,updated_at=?,error=NULL WHERE id=? AND owner=?").bind(JSON.stringify(clean),Date.now(),row.id,ctx.prefix).run()});return Response.json({film:publicFilm(row)})}catch(e){return fail(e)}}
