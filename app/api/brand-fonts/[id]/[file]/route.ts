export const runtime='nodejs';
import {context,fail,StudioError,validId} from '@/lib/studio-server';
import {mediaRedirect} from '@/lib/portable/storage';
import {BrandFontError,readyKeys} from '@/lib/brand-fonts/store';
import {WORDS} from '@/lib/brand-fonts/shared';

// One of the company's ready fonts for the browser: its sanitised WOFF2
// (`font`) or the small preview of its name (`preview`), as a redirect to a
// short-lived signed link to private storage (15 minutes; the canvas loads it
// with FontFace, so the bucket's CORS allows GET from the Studio's address).
// Only the company's members (and staff, read-only) get one; a removed or
// refused font, or another company's, is "not found". The original file is
// never sent.
const failure=(e:unknown)=>fail(e instanceof BrandFontError?new StudioError(e.message,e.status):e);

export async function GET(request:Request,{params}:{params:Promise<{id:string;file:string}>}){try{
 const ctx=await context(request),{id,file}=await params;
 if(!validId(id)||(file!=='font'&&file!=='preview'))throw new StudioError(WORDS.notFound,404);
 const db=ctx.DB;if(!db)throw new StudioError(WORDS.notFound,404);
 const keys=await readyKeys(db,ctx.org,id);
 if(!keys)throw new StudioError(WORDS.notFound,404);
 return await mediaRedirect(file==='font'?keys.woff2:keys.preview);
}catch(e){return failure(e)}}
