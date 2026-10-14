export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,validId,bucket,imageKey,str,StudioError} from '@/lib/studio-server';
import {database,filmRow} from '@/lib/film-server';
import {draftFor,publicFilm} from '@/lib/films';
export async function GET(request:Request){try{const ctx=await context(request);const rows=await database(ctx).prepare('SELECT * FROM films WHERE owner=? ORDER BY created_at DESC LIMIT 100').bind(ctx.prefix).all();return Response.json({films:rows.results.map(publicFilm)},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request);if(!validId(d.sourceId)||!await bucket(ctx.BUCKET).head(imageKey(ctx.prefix,d.sourceId)))throw new StudioError('Select a saved key visual first.');const id=crypto.randomUUID(),now=Date.now();await database(ctx).prepare('INSERT INTO films(id,owner,payer,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,ctx.prefix,ctx.prefix,'draft',JSON.stringify(draftFor(d.sourceId,str(d.title,70)||'Approved visual',str(d.vehicle,100)||'Selected vehicle')),now,now).run();return Response.json({film:publicFilm(await filmRow(ctx,id))})}catch(e){return fail(e)}}
