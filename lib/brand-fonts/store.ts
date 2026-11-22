import type {StudioDatabase} from '@/lib/portable/database';
import {orgKey} from '@/lib/portable/tenancy';
import {can,type Role} from '@/lib/accounts/can';
import {featureOn,type Entitlements} from '@/lib/accounts/plan';
import {BRAND_FONTS_FEATURE,fontUrl,MAX_BRAND_FONTS,previewUrl,WORDS,type BrandFontFile,type BrandFontKind,type Embedding} from './shared';

// The company's own font files in the database (migration 0013,
// studio.brand_fonts) and in storage (orgs/<org>/brand/fonts/<id>/). Every
// statement names the company (`org_id=?`) and the database's row level
// security checks it again: members read, only owners write. A font is never
// deleted: removing one sets deleted_at, so its licence record stays.

type Db=Pick<StudioDatabase,'prepare'>;
export class BrandFontError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

export const fontFolder=(org:string,id:string)=>orgKey(org,`brand/fonts/${id}/`);
export const fontKeys=(org:string,id:string,format:string)=>({original:fontFolder(org,id)+'original.'+format,woff2:fontFolder(org,id)+'font.woff2',preview:fontFolder(org,id)+'preview.woff2'});

/** Owners upload and remove; creators, viewers and staff viewing a company never do. */
export const mayUploadFonts=(ctx:{role:Role;account:{viewingAs:boolean}})=>can({role:ctx.role,viewingAs:ctx.account.viewingAs},'fonts.upload');
/** The plan has brand fonts (no plan key yet means off for clients; Nmesis's own workspace has everything). */
export const fontsOnPlan=(e:Entitlements)=>featureOn(e,BRAND_FONTS_FEATURE);

// Before migration 0013: Postgres 42P01 'relation "brand_fonts" does not exist', SQLite 'no such table: brand_fonts'.
export const missingTable=(e:unknown)=>{const m=e instanceof Error?e.message:String(e);return /brand_fonts/i.test(m)&&/does not exist|no such table/i.test(m)};
async function guard<T>(run:()=>Promise<T>):Promise<T>{try{return await run()}catch(e){if(missingTable(e))throw new BrandFontError(WORDS.notYet,503);throw e}}

type Row={id:string;family:string;style:string;weight:number;italic:number;variable:number;weight_min:number|null;weight_max:number|null;kind:string;arabic:number;format:string;size:number;
 woff2_key:string|null;preview_key:string|null;original_key:string;embedding:string;status:string;reason:string|null;created_at:number};
const COLUMNS='id,family,style,weight,italic,variable,weight_min,weight_max,kind,arabic,format,size,woff2_key,preview_key,original_key,embedding,status,reason,created_at';
const toFile=(r:Row):BrandFontFile=>{
 const ready=r.status==='ready';
 return {id:r.id,family:r.family,style:r.style,weight:Number(r.weight),italic:!!Number(r.italic),weightRange:r.weight_min!=null&&r.weight_max!=null?[Number(r.weight_min),Number(r.weight_max)]:null,
  kind:r.kind as BrandFontKind,arabic:!!Number(r.arabic),format:r.format as BrandFontFile['format'],size:Number(r.size),embedding:r.embedding as Embedding,status:ready?'ready':'refused',reason:r.reason,createdAt:Number(r.created_at),
  url:ready?fontUrl(r.id):null,previewUrl:ready?previewUrl(r.id):null};
};

/** Whether migration 0013 has run. */
export async function fontsReady(db:Db):Promise<boolean>{
 try{await db.prepare('SELECT id FROM brand_fonts WHERE 1=0').first();return true}
 catch(e){if(missingTable(e)){console.info('Brand fonts wait for migration 0013.');return false}throw e}
}
/** The company's fonts (not removed), a family's files together: by family, then weight, upright before italic. */
export async function listFonts(db:Db,org:string):Promise<BrandFontFile[]>{
 const rows=await guard(()=>db.prepare(`SELECT ${COLUMNS} FROM brand_fonts WHERE org_id=? AND deleted_at IS NULL ORDER BY family,weight,italic,created_at,id`).bind(org).all<Row>());
 return rows.results.map(toFile);
}
/** One font's storage keys, when it is the company's, not removed, and ready (what a browser may load). */
export async function readyKeys(db:Db,org:string,id:string):Promise<{woff2:string;preview:string}|null>{
 const r=await guard(()=>db.prepare("SELECT woff2_key,preview_key FROM brand_fonts WHERE id=? AND org_id=? AND deleted_at IS NULL AND status='ready'").bind(id,org).first<{woff2_key:string|null;preview_key:string|null}>());
 return r?.woff2_key&&r.preview_key?{woff2:r.woff2_key,preview:r.preview_key}:null;
}
export async function readyCount(db:Db,org:string){
 const r=await guard(()=>db.prepare("SELECT COUNT(*) AS n FROM brand_fonts WHERE org_id=? AND deleted_at IS NULL AND status='ready'").bind(org).first<{n:number}>());
 return Number(r?.n||0);
}
/** The ready font with this file (SHA-256), if the company has it already. */
export async function sameFile(db:Db,org:string,sha:string):Promise<BrandFontFile|null>{
 const r=await guard(()=>db.prepare(`SELECT ${COLUMNS} FROM brand_fonts WHERE org_id=? AND sha256=? AND deleted_at IS NULL AND status='ready'`).bind(org,sha).first<Row>());
 return r?toFile(r):null;
}

export type NewFont={id:string;org:string;family:string;style:string;weight:number;italic:boolean;variable:boolean;axes:unknown[];weightRange:[number,number]|null;kind:BrandFontKind;arabic:boolean;
 format:string;size:number;sha256:string;keys:{original:string;woff2:string|null;preview:string|null};
 licence:{by:string;at:number;version:string;text:string};fsType:number;embedding:Embedding;status:'ready'|'refused';reason:string|null;userId:string;now:number};
/** Records an uploaded font (ready, or refused with its reason). A ready one fails when the company is full or has the file already. */
export async function addFont(db:Db,f:NewFont):Promise<BrandFontFile>{
 const values=[f.id,f.org,f.family,f.style,f.weight,f.italic?1:0,f.variable?1:0,JSON.stringify(f.axes),f.weightRange?.[0]??null,f.weightRange?.[1]??null,f.kind,f.arabic?1:0,f.format,f.size,f.sha256,
  f.keys.original,f.keys.woff2,f.keys.preview,f.licence.by,f.licence.at,f.licence.version,f.licence.text,f.fsType,f.embedding,f.status,f.reason,f.userId,f.now];
 // A ready font takes a place only while there is one (one statement: two uploads can't both take the last).
 const room=f.status==='ready'?` WHERE (SELECT COUNT(*) FROM brand_fonts WHERE org_id=? AND deleted_at IS NULL AND status='ready')<CAST(? AS INTEGER)`:'';
 const r=await guard(()=>db.prepare(`INSERT INTO brand_fonts(id,org_id,family,style,weight,italic,variable,axes,weight_min,weight_max,kind,arabic,format,size,sha256,original_key,woff2_key,preview_key,licence_by,licence_at,licence_version,licence_text,fs_type,embedding,status,reason,created_by,created_at)
  SELECT ?,?,?,?,CAST(? AS INTEGER),CAST(? AS INTEGER),CAST(? AS INTEGER),?,CAST(? AS INTEGER),CAST(? AS INTEGER),?,CAST(? AS INTEGER),?,CAST(? AS BIGINT),?,?,?,?,?,CAST(? AS BIGINT),?,?,CAST(? AS INTEGER),?,?,?,?,CAST(? AS BIGINT)${room}`)
  .bind(...values,...f.status==='ready'?[f.org,MAX_BRAND_FONTS]:[]).run()).catch(e=>{
   if(/brand_fonts_env_org_file|UNIQUE constraint failed: brand_fonts\.(environment|org_id|sha256)/i.test(e instanceof Error?e.message:''))throw new BrandFontError(WORDS.already,409);
   throw e;
  });
 if(!r.meta.changes)throw new BrandFontError(WORDS.full,409);
 const row=await db.prepare(`SELECT ${COLUMNS} FROM brand_fonts WHERE id=? AND org_id=?`).bind(f.id,f.org).first<Row>();
 if(!row)throw new BrandFontError(WORDS.notFound,404);
 return toFile(row);
}
/** Removes a font (soft): designs that use it show "Missing font". */
export async function removeFont(db:Db,org:string,id:string,userId:string,now=Date.now()):Promise<boolean>{
 const r=await guard(()=>db.prepare('UPDATE brand_fonts SET deleted_at=CAST(? AS BIGINT),deleted_by=? WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(now,userId,id,org).run());
 return r.meta.changes>0;
}
