import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {mediaRedirect} from '@/lib/portable/storage';
import {BrandFontError,readyKeys} from './store';
import {WORDS} from './shared';

// One of the company's ready fonts for the browser (app/api/brand-fonts/<id>/font
// and /preview): its sanitised WOFF2 or the small preview of its name, as a
// redirect to a short-lived signed link to private storage (15 minutes; the
// canvas loads it with FontFace, so the bucket's CORS allows GET from the
// Studio's address). Only the company's members (and staff, read-only) get one;
// a removed or refused font, or another company's, is "not found". The original
// file is never sent.
export async function serveBrandFont(request:Request,params:Promise<{id:string}>,file:'font'|'preview'){try{
 const ctx=await context(request),{id}=await params;
 if(!validId(id))throw new StudioError(WORDS.notFound,404);
 const db=ctx.DB;if(!db)throw new StudioError(WORDS.notFound,404);
 const keys=await readyKeys(db,ctx.org,id);
 if(!keys)throw new StudioError(WORDS.notFound,404);
 return await mediaRedirect(file==='font'?keys.woff2:keys.preview);
}catch(e){return fail(e instanceof BrandFontError?new StudioError(e.message,e.status):e)}}
