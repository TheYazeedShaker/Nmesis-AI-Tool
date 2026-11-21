import {bucket,imageKey,validId} from '../studio-server';
import {database,type FilmContext} from '../film-server';
import {publicImage,type ImageRow} from '../image-server';
import {locate} from '../org-library';
import {hiddenFromRequester} from '../shares';
import {resolveVisual} from '../visual-library';
import type {Visual} from '../studio';
import {pictureKey,readDoc,type EditorDoc} from './doc';
// Reopening a picture saved from the canvas editor (GET /api/edits/<id>, and
// the routes that save, restore or autosave a design). A saved design keeps its
// layers beside it (edits/<id>.json, written by POST /api/edits), over the
// ORIGINAL picture it was made on (doc.base). Reopening gives that original
// back underneath with every layer, editable; nothing is written. A design
// kept in format v1 (before editor format v2) is upgraded as it is read
// (lib/editor/doc.ts readDoc), so it opens exactly as it was saved.
// Both pictures follow the same rules as opening a picture
// (GET /api/visuals/<id>): someone in the company who may see it, not deleted,
// not another person's "Only me", and its image still there. Anything else
// answers null: the editor then opens the saved picture plain, as any other.

export type Found={owner:string;visual:Visual};
/** A picture the person may open, as GET /api/visuals/<id> finds it; null otherwise. */
export async function visiblePicture(ctx:FilmContext,id:string):Promise<Found|null>{
 if(!validId(id))return null;
 const owner=await locate(ctx,'visuals/'+id+'.json');
 if(owner)return pictureAt(ctx,owner,id);
 // A render still kept only as the person's own job (no record yet), as the save route reads it.
 const store=bucket(ctx.BUCKET);
 const row=ctx.DB?await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(id,ctx.prefix).first<ImageRow>():null;
 const visual=row?publicImage(row):null;
 return visual?.status==='ready'&&await store.head(imageKey(ctx.prefix,id))?{owner:ctx.prefix,visual}:null;
}
/** The picture saved under one member's prefix (a version row says whose), with the same rules; null otherwise. */
export async function pictureAt(ctx:FilmContext,owner:string,id:string):Promise<Found|null>{
 if(!validId(id)||!owner.startsWith(`orgs/${ctx.org}/users/`))return null;
 const store=bucket(ctx.BUCKET);
 if(await hiddenFromRequester(ctx,'visual',id,owner)||await store.get(owner+'deleted-visuals/'+id+'.json'))return null;
 const record=await store.get(owner+'visuals/'+id+'.json');if(!record)return null;
 const visual=await resolveVisual({...ctx,prefix:owner},await record.json<Visual>());
 return visual.status==='ready'?{owner,visual}:null;
}

/** The design saved with picture `id`, over its original (always format v2), or null. */
export async function readDesign(ctx:FilmContext,id:string,saved?:Found):Promise<{design:EditorDoc;base:Visual;from:1|2}|null>{
 const pic=saved||await visiblePicture(ctx,id);if(!pic)return null;
 const store=bucket(ctx.BUCKET),kept=await store.get(pic.owner+'edits/'+id+'.json');
 if(!kept)return null;
 let raw:unknown;
 try{raw=await kept.json()}catch{console.warn('edits: the kept layers could not be read',{reason:'json'});return null}
 const checked=readDoc(raw);
 if(!checked.ok){console.warn('edits: the kept layers could not be read',{reason:checked.reason});return null}
 const doc=checked.doc,baseId=doc.base;
 const base=baseId===id?pic:await visiblePicture(ctx,baseId);
 // The original is gone (deleted, "Only me", its image missing): the saved picture opens plain.
 if(!base)return null;
 if(base.visual.width&&base.visual.height&&(base.visual.width!==doc.width||base.visual.height!==doc.height))return null;
 return {design:doc,base:base.visual,from:checked.from||2};
}

/** The originals a design of picture `id` may sit on: the picture itself, and the original under the design kept with it. */
export async function allowedBases(ctx:FilmContext,pic:Found):Promise<{bases:Set<string>;kept:EditorDoc|null}>{
 const kept=pic.visual.edit?await readDesign(ctx,pic.visual.id,pic):null;
 return {bases:new Set([pic.visual.id,...kept?[kept.design.base]:[]]),kept:kept?.design||null};
}
/** A design's pages may only show its own original underneath (a blank page is a colour). */
export const pagesOnBase=(doc:EditorDoc)=>doc.pages.every(p=>p.background.kind!=='picture'||p.background.asset===pictureKey(doc.base));
