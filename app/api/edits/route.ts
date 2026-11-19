import {readStudioForm} from '@/lib/portable/uploads';
export const runtime='nodejs';
export const maxDuration=120;
import {bucket,context,fail,imageKey,StudioError,validId} from '@/lib/studio-server';
import {database} from '@/lib/film-server';
import {publicImage,type ImageRow} from '@/lib/image-server';
import {imageDimensions} from '@/lib/image-dimensions';
import type {Visual} from '@/lib/studio';
import {fromVisual,indexQuietly} from '@/lib/library-index';
import {checkDoc} from '@/lib/editor/doc';
import {locate} from '@/lib/org-library';
import {hiddenFromRequester} from '@/lib/shares';
import {EDIT_MAX_BYTES,editedVisual,fullSize} from '@/lib/editor/save';

// Save from the canvas editor: the exported design (PNG, the original's full
// size, uploaded straight to storage by the signed upload path) becomes a NEW
// picture, saved as the editing person's own work. The original (anyone's in the company the person
// may see, as GET /api/visuals/<id> finds it) is only read, never written. `copy` makes a separate
// copy instead of the original's next version. The design's layers are kept
// beside it (edits/<id>.json) for editing again later. Nothing is generated and
// no credits are used.
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
 const checked=checkDoc(raw);if(!checked.ok)throw new StudioError('The design could not be read.');
 if(checked.doc.background.visualId!==parentId)throw new StudioError('The design belongs to a different picture.');
 const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>EDIT_MAX_BYTES)throw new StudioError('The exported design is missing.');
 const bytes=new Uint8Array(await file.arrayBuffer());let dimensions;try{dimensions=imageDimensions(bytes)}catch(e){throw new StudioError((e as Error).message)}
 if(dimensions.type!=='image/png')throw new StudioError('Save the design as a PNG.');
 if(!fullSize(parent,dimensions))throw new StudioError(`The design must be the picture’s full size, ${parent.width} × ${parent.height}.`);
 const id=crypto.randomUUID(),copy=form.get('copy')==='1';
 const visual=editedVisual(parent,{id,width:dimensions.width,height:dimensions.height,layers:checked.doc.layers.length,copy,now:new Date()});
 await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:dimensions.type}});
 await store.put(ctx.prefix+'edits/'+id+'.json',JSON.stringify({...checked.doc,background:{visualId:parentId,src:parent.src}}),{httpMetadata:{contentType:'application/json'}});
 await store.put(ctx.prefix+'visuals/'+id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
 await indexQuietly(ctx,fromVisual(ctx.prefix,visual));
 return Response.json({visual},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}
