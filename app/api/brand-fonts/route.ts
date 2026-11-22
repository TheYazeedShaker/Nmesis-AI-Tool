export const runtime='nodejs';
export const maxDuration=60;
import {createHash} from 'node:crypto';
import {bucket,context,fail,StudioError} from '@/lib/studio-server';
import {readStudioForm} from '@/lib/portable/uploads';
import {UPSELL_PLAN} from '@/lib/accounts/plan';
import {sanitiseFont,MAX_FONT_BYTES,REASONS} from '@/lib/brand-fonts/sanitise';
import {cleanName} from '@/lib/brand-fonts/sfnt';
import {addFont,BrandFontError,fontKeys,fontsOnPlan,fontsReady,listFonts,mayUploadFonts,readyCount,sameFile} from '@/lib/brand-fonts/store';
import {acceptedFile,extensionOf,LICENCES,MAX_BRAND_FONTS,WORDS,type BrandFontsState} from '@/lib/brand-fonts/shared';

// The company's own fonts (Brand → Fonts, the editor's font list).
// GET: every member lists them (each ready font's file and preview load
// through /api/brand-fonts/<id>/font|preview, a short-lived signed link).
// POST: an owner uploads one font file, through the Studio's direct upload
// (lib/studio-fetch.ts: the file goes to private storage first, never through
// this function's body), with the licence confirmation. The file is read,
// checked and re-encoded on the server (lib/brand-fonts/sanitise.ts) before
// anything is stored as ready; a refused file is recorded with its reason and
// not kept.
const failure=(e:unknown)=>fail(e instanceof BrandFontError?new StudioError(e.message,e.status):e);
const FORM_MAX=MAX_FONT_BYTES+100_000;

export async function GET(request:Request){try{
 const ctx=await context(request);
 const db=ctx.DB;if(!db)throw new StudioError('Brand fonts aren’t connected yet.',503);
 const ready=await fontsReady(db);
 const state:BrandFontsState={ready,onPlan:fontsOnPlan(ctx.entitlements),mayUpload:mayUploadFonts(ctx),upsell:UPSELL_PLAN['studio.brand_fonts'],fonts:ready?await listFonts(db,ctx.org):[]};
 return Response.json(state,{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e)}}

export async function POST(request:Request){try{
 // context() has already checked the plan (studio.brand_fonts) and that a viewer writes nothing.
 const ctx=await context(request,true);
 if(!mayUploadFonts(ctx))throw new StudioError(WORDS.onlyOwners,403);
 const db=ctx.DB;if(!db)throw new StudioError('Brand fonts aren’t connected yet.',503);
 const store=bucket(ctx.BUCKET);
 if(!await fontsReady(db))throw new StudioError(WORDS.notYet,503);
 if(Number(request.headers.get('content-length')||0)>FORM_MAX)throw new StudioError(WORDS.tooLarge,413);
 const form=await readStudioForm(request,ctx,FORM_MAX),file=form.get('font');
 // The licence confirmation, as shown: its version names the exact words.
 const version=form.get('licenceVersion'),text=typeof version==='string'?LICENCES[version]:undefined;
 if(form.get('licence')!=='confirmed'||!text)throw new StudioError(WORDS.licenceRequired);
 if(!(file instanceof File)||!file.size)throw new StudioError(WORDS.wrongType);
 if(file.size>MAX_FONT_BYTES)throw new StudioError(WORDS.tooLarge,413);
 if(!acceptedFile(file.name))throw new StudioError(WORDS.wrongType);
 if(await readyCount(db,ctx.org)>=MAX_BRAND_FONTS)throw new StudioError(WORDS.full,409);
 const original=new Uint8Array(await file.arrayBuffer());
 const result=await sanitiseFont(original);
 const id=crypto.randomUUID(),now=Date.now(),licence={by:ctx.userId,at:now,version:version as string,text};
 if(!result.ok){
  // Refused: recorded with its reason (the owner sees why); no file is kept.
  const stem=cleanName(file.name.replace(/\.[^.]*$/,''),54)||'Font';
  const format=(['otf','ttf','woff','woff2'] as const).find(f=>f===extensionOf(file.name))||'otf';
  const font=await addFont(db,{id,org:ctx.org,family:result.info?.family||stem,style:result.info?.style||'Regular',weight:result.info?.weight||400,italic:!!result.info?.italic,variable:false,axes:result.info?.axes||[],weightRange:null,
   kind:result.info?.kind||'sans',arabic:!!result.info?.arabic,format,size:original.byteLength,sha256:createHash('sha256').update(original).digest('hex'),keys:{original:fontKeys(ctx.org,id,format).original,woff2:null,preview:null},
   licence,fsType:result.info?.fsType??0,embedding:result.code==='restricted'||result.code==='bitmap-only'?'restricted':'installable',status:'refused',reason:REASONS[result.code],userId:ctx.userId,now});
  console.info('[brand-fonts] a font was refused',{reason:result.code});
  return Response.json({font},{status:422});
 }
 const already=await sameFile(db,ctx.org,result.sha256);
 if(already)throw new StudioError(WORDS.already,409);
 const keys=fontKeys(ctx.org,id,result.format);
 const written:string[]=[];
 const drop=()=>store.delete(written).catch(e=>console.error('[brand-fonts] files not removed after a failed save',e instanceof Error?e.name:'UnknownError'));
 try{
  for(const [key,bytes,type] of [[keys.woff2,result.woff2,'font/woff2'],[keys.preview,result.preview,'font/woff2'],[keys.original,result.original,'application/octet-stream']] as const){
   await store.put(key,bytes,{httpMetadata:{contentType:type}});written.push(key);
  }
  const font=await addFont(db,{id,org:ctx.org,family:result.info.family,style:result.info.style,weight:result.info.weight,italic:result.info.italic,variable:!!result.weightRange,axes:result.axes,weightRange:result.weightRange,
   kind:result.info.kind,arabic:result.info.arabic,format:result.format,size:original.byteLength,sha256:result.sha256,keys,licence,fsType:result.info.fsType,embedding:result.embedding,status:'ready',reason:null,userId:ctx.userId,now});
  return Response.json({font});
 }catch(e){await drop();throw e}
}catch(e){return failure(e)}}
