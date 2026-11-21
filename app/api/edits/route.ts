import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=120;
import {bucket,context,fail,imageKey,StudioError,validId} from '@/lib/studio-server';
import {database,type FilmContext} from '@/lib/film-server';
import {publicImage,type ImageRow} from '@/lib/image-server';
import {imageDimensions} from '@/lib/image-dimensions';
import type {Visual} from '@/lib/studio';
import {fromVisual,indexQuietly} from '@/lib/library-index';
import {cleanDoc,layerCount,readDoc} from '@/lib/editor/doc';
import {locate} from '@/lib/org-library';
import {hiddenFromRequester} from '@/lib/shares';
import {foldersReady} from '@/lib/trash-ready';
import {EDIT_MAX_BYTES,editedVisual,fullSize} from '@/lib/editor/save';
import {pagesOnBase,readDesign} from '@/lib/editor/reopen';
import {designIdOf,recordVersion} from '@/lib/editor/versions';

// Save from the canvas editor: the exported design (PNG of its first page, the
// original's full size, uploaded straight to storage by the signed upload path)
// becomes a NEW picture, saved as the editing person's own work. The original
// (anyone's in the company the person may see, as GET /api/visuals/<id> finds
// it) is only read, never written. The design is kept beside it in editor format
// v2 (edits/<id>.json, over the original picture it was made on: pictures by
// storage key, never an address) for editing again later (GET /api/edits/<id>).
// Save makes the next version of the picture opened, in the same design;
// `copy` ("Duplicate design") makes "Copy of <name>", a design of its own in the
// same folder as the picture opened. A version row is kept (migration 0012) so
// the editor can list the design's versions. Nothing is generated and no credits are used.
export async function POST(request:Request){try{
 const ctx=await context(request,true),store=bucket(ctx.BUCKET);
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Save from your studio.',403);
 if(Number(request.headers.get('content-length')||0)>EDIT_MAX_BYTES)throw new StudioError('This design is too large to save.',413);
 const form=await readStudioForm(request,ctx,EDIT_MAX_BYTES);
 const parentId=form.get('parentId');if(!validId(parentId))throw new StudioError('Open a saved picture first.');
 const owner=await locate(ctx,'visuals/'+parentId+'.json');
 if(owner&&(await hiddenFromRequester(ctx,'visual',parentId,owner)||await store.get(owner+'deleted-visuals/'+parentId+'.json')))throw new StudioError('The original picture is unavailable.',404);
 const saved=owner?await store.get(owner+'visuals/'+parentId+'.json'):null;let parent:Visual|null=saved?await saved.json<Visual>():null;
 if(!parent){const row=await database(ctx).prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(parentId,ctx.prefix).first<ImageRow>();if(row)parent=publicImage(row)}
 if(!parent||parent.status!=='ready')throw new StudioError('The original picture is unavailable.',404);
 if(!await store.head(imageKey(owner||ctx.prefix,parentId)))throw new StudioError('The original picture is unavailable.',404);
 let raw:unknown;try{raw=JSON.parse(String(form.get('doc')||''))}catch{throw new StudioError('The design could not be read.')}
 const checked=readDoc(raw);if(!checked.ok)throw new StudioError('The design could not be read.');
 const doc=checked.doc;
 // The picture opened, or (a reopened design) the original kept under the picture opened, and nothing else.
 const kept=parent.edit?await readDesign(ctx,parentId,owner?{owner,visual:parent}:undefined):null;
 if(doc.base!==parentId&&doc.base!==kept?.design.base)throw new StudioError('The design belongs to a different picture.');
 if(!pagesOnBase(doc))throw new StudioError('The design belongs to a different picture.');
 const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>EDIT_MAX_BYTES)throw new StudioError('The exported design is missing.');
 const bytes=new Uint8Array(await file.arrayBuffer());let dimensions;try{dimensions=imageDimensions(bytes)}catch(e){throw new StudioError((e as Error).message)}
 if(dimensions.type!=='image/png')throw new StudioError('Save the design as a PNG.');
 if(!fullSize(parent,dimensions))throw new StudioError(`The design must be the picture’s full size, ${parent.width} × ${parent.height}.`);
 const id=crypto.randomUUID(),copy=form.get('copy')==='1',now=new Date();
 const designId=copy?id:designIdOf(parent,kept?.design.base);
 const visual=editedVisual(parent,{id,width:dimensions.width,height:dimensions.height,layers:layerCount(doc),pages:doc.pages.length,copy,now,designId});
 await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:dimensions.type}});
 await store.put(ctx.prefix+'edits/'+id+'.json',JSON.stringify(cleanDoc(doc)),{httpMetadata:{contentType:'application/json'}});
 await store.put(ctx.prefix+'visuals/'+id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
 await indexQuietly(ctx,fromVisual(ctx.prefix,visual));
 if(copy)await fileWithParent(ctx,parentId,id,now.getTime());
 await recordVersion(ctx,{designId,versionId:id,kind:copy?'copy':'save',parentId:copy?null:parentId,now:now.getTime()});
 return Response.json({visual},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}

/** A duplicated design goes in the folder the picture opened is in (none → none). Before 0006: nowhere. */
async function fileWithParent(ctx:FilmContext,parentId:string,id:string,now:number){
 const db=database(ctx);
 if(!await foldersReady(db))return;
 const at=await db.prepare("SELECT i.folder_id AS folder_id FROM folder_items i JOIN folders f ON f.id=i.folder_id WHERE i.org_id=? AND i.item_kind='visual' AND i.item_id=? AND f.org_id=? AND f.deleted_at IS NULL").bind(ctx.org,parentId,ctx.org).first<{folder_id:string}>();
 if(!at)return;
 await db.prepare("INSERT INTO folder_items(org_id,item_kind,item_id,folder_id,updated_at) VALUES(?,'visual',?,?,?)").bind(ctx.org,id,at.folder_id,now).run();
}
