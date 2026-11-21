import {database,type FilmContext} from '../film-server';
import {designsReady} from '../trash-ready';
import type {Visual} from '../studio';
import {allowedBases,pictureAt,type Found} from './reopen';
// A design's version history (migration 0012, studio.design_versions). Every
// picture saved from the editor belongs to one design: the design it was opened
// from (Save, Restore) or a design of its own (Duplicate design). The pictures
// stay where they always were (each person's own work in storage); a row only
// says which design a picture belongs to and how it was made. Nothing is ever
// changed or deleted here: restoring a version makes a new picture and a new row.
// Before 0012 runs, saving works as before (no row) and the history is empty
// with `ready: false`.

export type VersionKind='save'|'restore'|'copy';
export type VersionOut={id:string;title:string;createdAt:number;mine:boolean;kind:VersionKind};
type Row={version_id:string;owner:string;kind:VersionKind;created_at:number};
export const VERSIONS_SHOWN=50;

/**
 * The design a picture belongs to. A picture saved since editor format v2 says
 * so (edit.designId). A plain picture is a design of its own (its id). An older
 * editor save: a duplicate started its own design; any other save belongs to
 * the original under its kept layers (`keptBase`), or, when those are gone, to itself.
 */
export function designIdOf(visual:Pick<Visual,'id'|'edit'>,keptBase?:string|null):string{
 const e=visual.edit;
 if(e?.designId)return e.designId;
 if(!e||e.copy)return visual.id;
 return keptBase||visual.id;
}

/** Keeps one row for a picture just saved, restored or duplicated; quietly nothing before 0012. */
export async function recordVersion(ctx:FilmContext,v:{designId:string;versionId:string;kind:VersionKind;parentId:string|null;restoredFrom?:string|null;now:number}){
 const db=database(ctx);
 if(!await designsReady(db))return false;
 await db.prepare('INSERT INTO design_versions(org_id,design_id,version_id,owner,kind,parent_id,restored_from,created_at) VALUES(?,?,?,?,?,?,?,?)')
  .bind(ctx.org,v.designId,v.versionId,ctx.prefix,v.kind,v.parentId,v.restoredFrom??null,v.now).run();
 return true;
}

/** Whether a picture is one of a design's versions (a row says so). */
export async function versionOf(ctx:FilmContext,versionId:string):Promise<{designId:string;owner:string}|null>{
 const db=database(ctx);if(!await designsReady(db))return null;
 const row=await db.prepare('SELECT design_id,owner FROM design_versions WHERE org_id=? AND version_id=?').bind(ctx.org,versionId).first<{design_id:string;owner:string}>();
 return row?{designId:row.design_id,owner:row.owner}:null;
}

/** A design's versions, newest first: only pictures this person may open (not deleted, not someone else's "Only me"). */
export async function listVersions(ctx:FilmContext,designId:string):Promise<{ready:boolean;versions:VersionOut[]}>{
 const db=database(ctx);
 if(!await designsReady(db))return {ready:false,versions:[]};
 const rows=(await db.prepare('SELECT version_id,owner,kind,created_at FROM design_versions WHERE org_id=? AND design_id=? ORDER BY created_at DESC, version_id DESC LIMIT ?').bind(ctx.org,designId,VERSIONS_SHOWN).all<Row>()).results;
 const seen=await Promise.all(rows.map(async r=>{const pic=await pictureAt(ctx,r.owner,r.version_id);return pic?{id:r.version_id,title:pic.visual.title,createdAt:Number(r.created_at),mine:r.owner===ctx.prefix,kind:r.kind} satisfies VersionOut:null}));
 return {ready:true,versions:seen.filter((v):v is VersionOut=>!!v)};
}

/** The design a picture the person may open belongs to (its kept layers read when it was saved from the editor). */
export async function designOf(ctx:FilmContext,pic:Found):Promise<string>{
 const {kept}=pic.visual.edit&&!pic.visual.edit.designId?await allowedBases(ctx,pic):{kept:null};
 return designIdOf(pic.visual,kept?.base);
}
