import {bucket,imageKey,validId} from '../studio-server';
import {database,type FilmContext} from '../film-server';
import {publicImage,type ImageRow} from '../image-server';
import {locate} from '../org-library';
import {hiddenFromRequester} from '../shares';
import {resolveVisual} from '../visual-library';
import type {Visual} from '../studio';
import {checkDoc,type EditorDoc} from './doc';
// Reopening a picture saved from the canvas editor (GET /api/edits/<id>, and
// the save route when a reopened design is saved again). A saved design keeps
// its layers beside it (edits/<id>.json, written by POST /api/edits), over the
// ORIGINAL picture it was made on (doc.background). Reopening gives that
// original back underneath with every layer, editable; nothing is written.
// Both pictures follow the same rules as opening a picture
// (GET /api/visuals/<id>): someone in the company who may see it, not deleted,
// not another person's "Only me", and its image still there. Anything else
// answers null: the editor then opens the saved picture plain, as any other.

type Found={owner:string;visual:Visual};
/** A picture the person may open, as GET /api/visuals/<id> finds it; null otherwise. */
export async function visiblePicture(ctx:FilmContext,id:string):Promise<Found|null>{
 if(!validId(id))return null;
 const store=bucket(ctx.BUCKET),owner=await locate(ctx,'visuals/'+id+'.json');
 if(owner){
  if(await hiddenFromRequester(ctx,'visual',id,owner)||await store.get(owner+'deleted-visuals/'+id+'.json'))return null;
  const record=await store.get(owner+'visuals/'+id+'.json');if(!record)return null;
  const visual=await resolveVisual({...ctx,prefix:owner},await record.json<Visual>());
  return visual.status==='ready'?{owner,visual}:null;
 }
 // A render still kept only as the person's own job (no record yet), as the save route reads it.
 const row=ctx.DB?await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(id,ctx.prefix).first<ImageRow>():null;
 const visual=row?publicImage(row):null;
 return visual?.status==='ready'&&await store.head(imageKey(ctx.prefix,id))?{owner:ctx.prefix,visual}:null;
}

/** The design saved with picture `id`, over its original (the address the person may load), or null. */
export async function readDesign(ctx:FilmContext,id:string,saved?:Found):Promise<{design:EditorDoc;base:Visual}|null>{
 const pic=saved||await visiblePicture(ctx,id);if(!pic)return null;
 const store=bucket(ctx.BUCKET),kept=await store.get(pic.owner+'edits/'+id+'.json');
 if(!kept)return null;
 let raw:unknown;
 try{raw=await kept.json()}catch{console.warn('edits: the kept layers could not be read',{reason:'json'});return null}
 const checked=checkDoc(raw);
 if(!checked.ok){console.warn('edits: the kept layers could not be read',{reason:checked.reason});return null}
 const baseId=checked.doc.background.visualId;
 const base=baseId===id?pic:await visiblePicture(ctx,baseId);
 // The original is gone (deleted, "Only me", its image missing): the saved picture opens plain.
 if(!base)return null;
 if(base.visual.width&&base.visual.height&&(base.visual.width!==checked.doc.width||base.visual.height!==checked.doc.height))return null;
 return {design:{...checked.doc,background:{visualId:baseId,src:base.visual.src}},base:base.visual};
}
