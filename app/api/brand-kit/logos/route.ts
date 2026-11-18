export const runtime='nodejs';
export const maxDuration=60;
import {bucket,context,fail,imageType,StudioError} from '@/lib/studio-server';
import {readStudioForm} from '@/lib/portable/uploads';
import {addLogo,BrandKitError,kitDb,LOGO_MAX_BYTES,logoCount,logoKey,MAX_LOGOS,mayEditBrand,ONLY_EDITORS,TOO_MANY_LOGOS,uploadName} from '@/lib/brand-kit';
// Adds a logo to the company's brand kit (owners and creators): a multipart
// form with `logo` (PNG, JPEG or WebP, checked by its bytes, up to 5 MB) and an
// optional `name`. Stored under orgs/<org>/brand/logos/<id>; at most 12.
const failure=(e:unknown)=>fail(e instanceof BrandKitError?new StudioError(e.message,e.status):e);
// The file plus the form around it.
const FORM_MAX=LOGO_MAX_BYTES+100_000;
const TOO_LARGE='Choose a logo up to 5 MB.';
export async function POST(request:Request){try{
 const ctx=await context(request,true);
 if(!mayEditBrand(ctx))throw new StudioError(ONLY_EDITORS,403);
 const store=bucket(ctx.BUCKET),db=kitDb(ctx.DB);
 if(Number(request.headers.get('content-length')||0)>FORM_MAX)throw new StudioError(TOO_LARGE,413);
 // Full already: say so before anything is read or stored.
 if(await logoCount(db,ctx.org)>=MAX_LOGOS)throw new StudioError(TOO_MANY_LOGOS,409);
 const form=await readStudioForm(request,ctx,FORM_MAX),file=form.get('logo');
 if(!(file instanceof File)||!file.size)throw new StudioError('Choose a PNG, JPEG or WebP logo.');
 if(file.size>LOGO_MAX_BYTES)throw new StudioError(TOO_LARGE,413);
 const bytes=new Uint8Array(await file.arrayBuffer()),type=imageType(bytes);
 if(!type)throw new StudioError('Only PNG, JPEG and WebP logos are supported.');
 const name=uploadName(form.get('name'),file.name);
 if(!name.ok)throw new StudioError(name.error);
 const id=crypto.randomUUID(),key=logoKey(ctx.org,id);
 await store.put(key,bytes,{httpMetadata:{contentType:type}});
 // The row decides (the twelfth place may have just been taken); without it the picture goes.
 const drop=()=>store.delete(key).catch(e=>console.error('Brand logo picture not removed after a failed save',e instanceof Error?e.name:'UnknownError'));
 let logo;
 try{logo=await addLogo(db,{id,org:ctx.org,name:name.value,type,size:bytes.byteLength,userId:ctx.userId})}
 catch(e){await drop();throw e}
 if(!logo){await drop();throw new StudioError(TOO_MANY_LOGOS,409)}
 return Response.json({logo});
}catch(e){return failure(e)}}
