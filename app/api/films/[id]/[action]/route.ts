export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {withFilmLock,quoteFilm,renderFilm,refreshFilm,cancelFilm,recoverFilm} from '@/lib/film-server';
import {publicFilm} from '@/lib/films';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){try{const ctx=await context(request,true),{id,action}=await params;const d=action==='render'?await readJson(request):{};const row=await withFilmLock(ctx,id,async row=>{if(action==='quote')await quoteFilm(ctx,row);else if(action==='render')await renderFilm(ctx,row,d.approvedEstimate,d.approvedRevision);else if(action==='refresh')await refreshFilm(ctx,row);else if(action==='cancel')await cancelFilm(ctx,row);else if(action==='recover')await recoverFilm(ctx,row);else throw new StudioError('Unknown film action.',404)});return Response.json({film:publicFilm(row)})}catch(e){return fail(e)}}
