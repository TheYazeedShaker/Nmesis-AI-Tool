import {database,type FilmContext} from '../film-server';
import {designsReady} from '../trash-ready';
// The editor's soft lock (migration 0012, studio.design_presence). One person
// edits a design at a time; anyone else who opens it sees "Being edited by
// <name>" and opens it read only, with "Edit anyway". There is no live
// co-editing (owner, 2026-11-21). While the editor is open it says so every
// 20 s (PRESENCE_BEAT_MS); a person not heard from for 45 s has left. The name
// is the person's own display name from their sign-in profile, as the server
// knows it (never their email address, never what the request says).

export const PRESENCE_BEAT_MS=20_000,PRESENCE_GONE_MS=45_000;
export const SOMEONE='A teammate';
export type Present={name:string;editing:boolean};
type Row={person:string;name:string;editing:number;seen_at:number};

/** The name others see: the person's own display name, or a neutral word. */
export function displayName(ctx:Pick<FilmContext,'account'>){
 const name=(ctx.account.user.name||'').replace(/\s+/g,' ').trim();
 return name&&!name.includes('@')?name.slice(0,80):SOMEONE;
}

/** Everyone else with this design open in the last 45 s (one entry each), editors first. */
export async function othersOn(ctx:FilmContext,designId:string,now=Date.now()):Promise<{ready:boolean;others:Present[]}>{
 const db=database(ctx);
 if(!await designsReady(db))return {ready:false,others:[]};
 const rows=(await db.prepare('SELECT person,name,editing,seen_at FROM design_presence WHERE org_id=? AND design_id=? AND person<>? AND seen_at>? ORDER BY editing DESC, seen_at DESC LIMIT 20').bind(ctx.org,designId,ctx.prefix,now-PRESENCE_GONE_MS).all<Row>()).results;
 return {ready:true,others:rows.map(r=>({name:r.name||SOMEONE,editing:Number(r.editing)===1}))};
}

/** This person has the design open (editing or only looking); answers who else has. */
export async function beat(ctx:FilmContext,designId:string,editing:boolean,now=Date.now()){
 const db=database(ctx);
 if(!await designsReady(db))return {ready:false,others:[] as Present[]};
 await db.prepare('INSERT INTO design_presence(org_id,design_id,person,name,editing,seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(environment,org_id,design_id,person) DO UPDATE SET name=excluded.name,editing=excluded.editing,seen_at=excluded.seen_at')
  .bind(ctx.org,designId,ctx.prefix,displayName(ctx),editing?1:0,now).run();
 return othersOn(ctx,designId,now);
}

/** This person closed the design. */
export async function leave(ctx:FilmContext,designId:string){
 const db=database(ctx);
 if(!await designsReady(db))return false;
 await db.prepare('DELETE FROM design_presence WHERE org_id=? AND design_id=? AND person=?').bind(ctx.org,designId,ctx.prefix).run();
 return true;
}
