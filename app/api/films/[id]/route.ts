export const runtime='nodejs';
export const maxDuration=300;
import {trashItem} from '@/lib/trash';
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {database,filmRow,withFilmLock} from '@/lib/film-server';
import {publicFilm,validateDraft} from '@/lib/films';
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{const ctx=await context(request);return Response.json({film:publicFilm(await filmRow(ctx,(await params).id,true))},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function PATCH(request:Request,{params}:Params){try{const ctx=await context(request,true),d=await readJson(request);const row=await withFilmLock(ctx,(await params).id,async row=>{if(!['draft','quoted'].includes(row.status))throw new StudioError('This film is already submitted. Create another version to change its direction.',409);let clean;try{clean=validateDraft(d,JSON.parse(row.data).sourceId)}catch(e){throw new StudioError((e as Error).message)}await database(ctx).prepare("UPDATE films SET data=?,status='draft',estimate=0,updated_at=?,error=NULL WHERE id=? AND owner=?").bind(JSON.stringify(clean),Date.now(),row.id,ctx.prefix).run()});return Response.json({film:publicFilm(row)})}catch(e){return fail(e)}}

// Delete (to the Deleted view; POST …/restore brings it back). Creator or owner.
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await trashItem(await context(request,true),'films',(await params).id))}catch(e){return fail(e)}}
