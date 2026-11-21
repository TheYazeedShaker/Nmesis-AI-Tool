import {bucket,StudioError} from '../studio-server';
import type {FilmContext} from '../film-server';
import {checkDoc,cleanDoc,readDoc,type EditorDoc} from './doc';
import {allowedBases,pagesOnBase,type Found} from './reopen';
import {DRAFT_MAX_BYTES} from './save';
// Autosave's working draft: the design as the person last left it, kept in
// their own storage (drafts/<picture>.json, one per picture they opened). It is
// written about 2 s after the last change and read when the picture is opened
// again; Save still makes a new version of the picture and never touches the
// draft's picture. Only the design's own fields are kept (cleanDoc): storage
// keys, never an address, so no signed link is ever stored.

export type Draft={doc:EditorDoc;rev:number;savedAt:number};
export const draftKey=(ctx:Pick<FilmContext,'prefix'>,pictureId:string)=>ctx.prefix+'drafts/'+pictureId+'.json';

/** The body of a draft PUT, read with its size limit (before JSON parsing). */
export async function readDraftBody(request:Request):Promise<{doc:unknown;rev:unknown}>{
 if(Number(request.headers.get('content-length')||0)>DRAFT_MAX_BYTES)throw new StudioError('This design is too large to keep as a draft.',413);
 const text=await request.text();
 if(new TextEncoder().encode(text).length>DRAFT_MAX_BYTES)throw new StudioError('This design is too large to keep as a draft.',413);
 let data:unknown;
 try{data=JSON.parse(text)}catch{throw new StudioError('The design could not be read.')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new StudioError('The design could not be read.');
 return data as {doc:unknown;rev:unknown};
}

/** The person's draft for this picture, or null (none, or one that no longer reads). */
export async function readDraft(ctx:FilmContext,pictureId:string):Promise<Draft|null>{
 const kept=await bucket(ctx.BUCKET).get(draftKey(ctx,pictureId));if(!kept)return null;
 let raw:{doc?:unknown;rev?:unknown;savedAt?:unknown};
 try{raw=await kept.json()}catch{console.warn('drafts: a kept draft could not be read',{reason:'json'});return null}
 const checked=readDoc(raw?.doc);
 if(!checked.ok){console.warn('drafts: a kept draft could not be read',{reason:checked.reason});return null}
 return {doc:checked.doc,rev:Number.isInteger(raw.rev)?Number(raw.rev):0,savedAt:Number(raw.savedAt)||0};
}

/** Keeps the draft: a v2 design over this picture's own original (or the picture itself). */
export async function writeDraft(ctx:FilmContext,pic:Found,body:{doc:unknown;rev:unknown},now=Date.now()):Promise<{savedAt:number}>{
 const checked=checkDoc(body.doc);
 if(!checked.ok)throw new StudioError('The design could not be read.');
 const rev=body.rev;
 if(typeof rev!=='number'||!Number.isInteger(rev)||rev<0||rev>1e9)throw new StudioError('The design could not be read.');
 const {bases}=await allowedBases(ctx,pic);
 if(!bases.has(checked.doc.base)||!pagesOnBase(checked.doc))throw new StudioError('The design belongs to a different picture.');
 const draft:Draft={doc:cleanDoc(checked.doc),rev,savedAt:now};
 await bucket(ctx.BUCKET).put(draftKey(ctx,pic.visual.id),JSON.stringify(draft),{httpMetadata:{contentType:'application/json'}});
 return {savedAt:now};
}

export async function deleteDraft(ctx:FilmContext,pictureId:string){
 await bucket(ctx.BUCKET).delete(draftKey(ctx,pictureId));
 return {deleted:true};
}
