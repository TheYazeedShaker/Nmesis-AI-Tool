export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson} from '@/lib/studio-server';
import {database} from '@/lib/film-server';
import {editBoard,type Storyboard} from '@/lib/storyboards';
import {checkAssets} from '@/lib/storyboard-server';
import {VIDEO_MODEL,FILM_MODELS} from '@/lib/films';
export async function GET(request:Request){try{const ctx=await context(request);const rows=await database(ctx).prepare('SELECT id,data,revision,updated_at FROM storyboards WHERE owner=? ORDER BY updated_at DESC LIMIT 60').bind(ctx.prefix).all<any>();return Response.json({boards:rows.results.map(r=>({...JSON.parse(r.data),id:r.id,revision:r.revision,updatedAt:r.updated_at}))},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request,80000),id=crypto.randomUUID(),now=Date.now();const base:Storyboard={id,revision:1,title:'Untitled story',vehicle:'Your car',configurator:'',views:[],idea:'',direction:'',moodId:'',pin:'',shots:[],model:VIDEO_MODEL,brand:'',tagline:'',updatedAt:now};const b=editBoard(base,d);if(!FILM_MODELS.some(m=>m.id===b.model&&!m.reference))b.model=VIDEO_MODEL;await checkAssets(ctx,b);await database(ctx).prepare('INSERT INTO storyboards(id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,ctx.prefix,JSON.stringify(b),now,now).run();return Response.json({board:b})}catch(e){return fail(e)}}
