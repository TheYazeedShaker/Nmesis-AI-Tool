export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {withBoard,planStory,generateFrame} from '@/lib/storyboard-server';
import {database,filmRow,withFilmLock,quoteFilm,renderFilm} from '@/lib/film-server';
import {draftFor,publicFilm,type FilmModelId} from '@/lib/films';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){try{const ctx=await context(request,true),{id,action}=await params,d=await readJson(request);let film;
 const board=await withBoard(ctx,id,d.revision,async(b,save)=>{
 if(action==='plan'){if(d.approved!==true)throw new StudioError('Approve the AI planning request first.');await planStory(ctx,b,d.count===12?12:6);await save(b);return}
 const s=b.shots.find(x=>x.id===d.shotId);if(!s)throw new StudioError('Choose a storyboard shot.');
 if(action==='image'){if(s.filmId){const f=await filmRow(ctx,s.filmId);if(['queued','in_progress','archiving','unknown','submitting'].includes(f.status))throw new StudioError('Resolve the current video render before generating a new image.',409)}if(d.approved!==true)throw new StudioError('Approve this image generation first.');await generateFrame(ctx,b,s,save,d.requestId);return}
 if(action==='render'){if(!s.selected||!s.filmId||s.filmId!==d.filmId)throw new StudioError('The selected clip changed. Get a fresh estimate.',409);film=publicFilm(await withFilmLock(ctx,s.filmId,async row=>{await renderFilm(ctx,row,d.approvedEstimate,d.approvedRevision)}));return}
 if(action==='quote'){if(!s.imageId||s.status!=='ready')throw new StudioError('Generate and review this image first.');if(!s.filmId){const filmId=crypto.randomUUID(),now=Date.now(),draft=draftFor(s.imageId,s.title,b.vehicle);draft.mode='animate';draft.model=b.model as FilmModelId;draft.sound=false;draft.shots=draft.shots.map(()=>({title:s.title,direction:s.motion}));await database(ctx).prepare('INSERT INTO films(id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(filmId,ctx.prefix,ctx.prefix,'draft',JSON.stringify(draft),now,now).run();s.filmId=filmId;await save(b)}const row=await filmRow(ctx,s.filmId);if(['draft','quoted'].includes(row.status))await withFilmLock(ctx,row.id,async r=>{await quoteFilm(ctx,r)});film=publicFilm(await filmRow(ctx,s.filmId));return}
 if(action==='redo-video'){if(s.filmId){const row=await filmRow(ctx,s.filmId);if(!['ready','failed','nsfw','canceled','draft','quoted'].includes(row.status))throw new StudioError('Resolve the current render before creating another paid version.',409);s.oldFilmIds.push(s.filmId);delete s.filmId;delete b.finalUrl;await save(b)}return}
 throw new StudioError('Unknown story action.',404);
 });return Response.json({board,film})}catch(e){return fail(e)}}
