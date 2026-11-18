import type {StudioDatabase} from '@/lib/portable/database';
import {can,type Role} from './accounts/can';
import {orgKey} from './portable/tenancy';
// The company's brand kit (migration 0010): logos, up to 8 colours, a heading
// and a body font from a short list, and a one-line brand voice. One kit per
// company (and environment, by row level security). Everyone in the company
// reads it; owners and creators change it (lib/accounts/can.ts), and every
// write route checks that again with the server's own context.
// No server imports here: the Brand screen uses the types, limits and checks
// too. The routes turn a BrandKitError into the Studio's own error.

export const BRAND_FONTS=['System','Inter','Outfit','Poppins','Montserrat','Playfair Display','Roboto','Lato','Oswald'] as const;
export type BrandFont=typeof BRAND_FONTS[number];
export const MAX_LOGOS=12,LOGO_MAX_BYTES=5_000_000,MAX_COLOURS=8,VOICE_MAX=200,LOGO_NAME_MAX=60,COLOUR_NAME_MAX=40;
export const LOGO_TYPES=['image/png','image/jpeg','image/webp'] as const;

export type BrandColour={hex:string;name:string};
export type BrandLogo={id:string;name:string;type:string;size:number;createdAt:number;/** Signed redirect to the picture; add ?download=1 for a file. */url:string};
export type BrandKit={
 /** false until migration 0010 has run: the kit reads as empty and cannot be changed yet. */
 ready:boolean;
 colours:BrandColour[];
 headingFont:BrandFont;
 bodyFont:BrandFont;
 voice:string;
 logos:BrandLogo[];
 updatedAt:number|null;
};
export type BrandKitFields=Pick<BrandKit,'colours'|'headingFont'|'bodyFont'|'voice'>;
/** What a colour picker shows for a box that does not hold a hex colour yet. */
export const PICKER_FALLBACK='#000000';
export const EMPTY_KIT:BrandKit={ready:true,colours:[],headingFont:'System',bodyFont:'System',voice:'',logos:[],updatedAt:null};

export const ONLY_EDITORS='Only owners and creators can change the brand kit.';
export const NOT_YET='The brand kit isn’t available yet. Try again later.';
export const LOGO_NOT_FOUND='Logo not found.';
export const TOO_MANY_LOGOS=`Your brand kit has ${MAX_LOGOS} logos, the most it can hold. Remove one first.`;

// Plain fields: tests may load this file under Node's strip-only TypeScript mode.
export class BrandKitError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

/** Owners and creators of the company, never a member of staff viewing a client. */
export const mayEditBrand=(ctx:{role:Role;account:{viewingAs:boolean}})=>can({role:ctx.role,viewingAs:ctx.account.viewingAs},'brand.edit');

// ── Checks (explicit, at the boundary) ──────────────────────────────────
// One line: every run of spaces, tabs, line breaks or control characters becomes one space.
export const oneLine=(v:unknown)=>typeof v==='string'?v.replace(/[\s\p{Cc}]+/gu,' ').trim():'';
/** "#1A2B3C" from "1a2b3c", "#1a2b3c" or "#abc"; null for anything else. */
export function cleanHex(v:unknown):string|null{
 if(typeof v!=='string')return null;
 const m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
 if(!m)return null;
 const six=m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1];
 return '#'+six.toUpperCase();
}
export const isBrandFont=(v:unknown):v is BrandFont=>typeof v==='string'&&(BRAND_FONTS as readonly string[]).includes(v);

type Parsed<T>={ok:true;value:T}|{ok:false;error:string};
export function parseColours(v:unknown):Parsed<BrandColour[]>{
 if(!Array.isArray(v))return {ok:false,error:'Colours must be a list.'};
 if(v.length>MAX_COLOURS)return {ok:false,error:`A brand kit holds up to ${MAX_COLOURS} colours.`};
 const out:BrandColour[]=[];
 for(const [i,item] of v.entries()){
  const c=item&&typeof item==='object'&&!Array.isArray(item)?item as Record<string,unknown>:null;
  const hex=cleanHex(c?.hex);
  if(!hex)return {ok:false,error:`Colour ${i+1} isn’t a hex colour. Use 6 digits, 0–9 and A–F.`};
  if(c?.name!==undefined&&c.name!==null&&typeof c.name!=='string')return {ok:false,error:`Colour ${i+1} has a name that isn’t text.`};
  const name=oneLine(c?.name);
  if(name.length>COLOUR_NAME_MAX)return {ok:false,error:`A colour name is at most ${COLOUR_NAME_MAX} characters.`};
  out.push({hex,name});
 }
 return {ok:true,value:out};
}
export function parseVoice(v:unknown):Parsed<string>{
 if(typeof v!=='string')return {ok:false,error:'The brand voice must be text.'};
 const voice=oneLine(v);
 if(voice.length>VOICE_MAX)return {ok:false,error:`The brand voice is one line of up to ${VOICE_MAX} characters.`};
 return {ok:true,value:voice};
}
/** The fields a PUT may change; a field left out keeps its saved value. */
export function parseKit(input:Record<string,unknown>):{ok:true;fields:Partial<BrandKitFields>}|{ok:false;error:string}{
 const fields:Partial<BrandKitFields>={};
 if(input.colours!==undefined){const c=parseColours(input.colours);if(!c.ok)return c;fields.colours=c.value}
 if(input.headingFont!==undefined){if(!isBrandFont(input.headingFont))return {ok:false,error:'Choose a heading font from the list.'};fields.headingFont=input.headingFont}
 if(input.bodyFont!==undefined){if(!isBrandFont(input.bodyFont))return {ok:false,error:'Choose a body font from the list.'};fields.bodyFont=input.bodyFont}
 if(input.voice!==undefined){const v=parseVoice(input.voice);if(!v.ok)return v;fields.voice=v.value}
 return {ok:true,fields};
}
/** A name somebody typed (renaming): required, one line, at most 60 characters. */
export function parseLogoName(v:unknown):Parsed<string>{
 const name=oneLine(v);
 if(!name)return {ok:false,error:'Give the logo a name.'};
 if(name.length>LOGO_NAME_MAX)return {ok:false,error:`A logo name is at most ${LOGO_NAME_MAX} characters.`};
 return {ok:true,value:name};
}
/** A new logo's name: the one typed, else the file's name without its extension, else "Logo". */
export function uploadName(typed:unknown,fileName:string):Parsed<string>{
 if(oneLine(typed))return parseLogoName(typed);
 const fromFile=oneLine(fileName.replace(/\.[a-z0-9]{1,5}$/i,'')).slice(0,LOGO_NAME_MAX).trim();
 return {ok:true,value:fromFile||'Logo'};
}

// ── Where things live ───────────────────────────────────────────────────
export const logoKey=(org:string,id:string)=>orgKey(org,'brand/logos/'+id);
export const logoUrl=(id:string)=>'/api/brand-kit/logos/'+encodeURIComponent(id);
const EXT:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
export const logoFilename=(name:string,type:string)=>(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'logo')+'.'+(EXT[type]||'png');

// ── The database (ctx.DB; `?` placeholders, every value a parameter) ──────
type Db=Pick<StudioDatabase,'prepare'>;
type KitRow={colours:string|null;heading_font:string|null;body_font:string|null;voice:string|null;updated_at:number|null};
type LogoRow={id:string;name:string;content_type:string;size:number;created_at:number};
export function kitDb<T>(db:T|undefined):T{if(!db)throw new BrandKitError('The brand kit is not connected yet.',503);return db}
// Before migration 0010: Postgres 42P01 'relation "brand_kits" does not exist', SQLite 'no such table: brand_kits'.
export function missingTable(e:unknown){const m=e instanceof Error?e.message:String(e);return /brand_(kits|logos)/i.test(m)&&/does not exist|no such table/i.test(m)}
async function guard<T>(run:()=>Promise<T>):Promise<T>{
 try{return await run()}
 catch(e){if(missingTable(e))throw new BrandKitError(NOT_YET,503);throw e}
}
const toLogo=(r:LogoRow):BrandLogo=>({id:r.id,name:r.name,type:r.content_type,size:Number(r.size),createdAt:Number(r.created_at),url:logoUrl(r.id)});
// Saved colours are read back through the same check; one that no longer passes is dropped.
function storedColours(text:string|null|undefined):BrandColour[]{
 if(!text)return [];
 let value:unknown;
 try{value=JSON.parse(text)}catch{console.warn('Brand kit colours could not be read; showing none.');return []}
 if(!Array.isArray(value))return [];
 return value.slice(0,MAX_COLOURS).flatMap(c=>{const one=parseColours([c]);return one.ok?one.value:[]});
}

/** The company's kit. Before migration 0010: an empty kit with ready:false. */
export async function readKit(db:Db,org:string):Promise<BrandKit>{
 let row:KitRow|null,logos:LogoRow[];
 try{
  [row,logos]=await Promise.all([
   db.prepare('SELECT colours,heading_font,body_font,voice,updated_at FROM brand_kits WHERE org_id=?').bind(org).first<KitRow>(),
   db.prepare('SELECT id,name,content_type,size,created_at FROM brand_logos WHERE org_id=? AND deleted_at IS NULL ORDER BY created_at,id').bind(org).all<LogoRow>().then(r=>r.results),
  ]);
 }catch(e){
  if(!missingTable(e))throw e;
  console.info('The brand kit waits for migration 0010.');
  return {...EMPTY_KIT,ready:false};
 }
 const heading=row?.heading_font,body=row?.body_font,at=row?.updated_at;
 return {
  ready:true,
  colours:storedColours(row?.colours),
  headingFont:isBrandFont(heading)?heading:'System',
  bodyFont:isBrandFont(body)?body:'System',
  voice:oneLine(row?.voice).slice(0,VOICE_MAX),
  logos:logos.map(toLogo),
  updatedAt:at!=null?Number(at):null,
 };
}

/** Saves the fields given (the rest keep their saved values); answers the whole kit. */
export async function saveKit(db:Db,org:string,userId:string,fields:Partial<BrandKitFields>,now=Date.now()):Promise<BrandKit>{
 const current=await readKit(db,org);
 if(!current.ready)throw new BrandKitError(NOT_YET,503);
 const next:BrandKitFields={colours:fields.colours??current.colours,headingFont:fields.headingFont??current.headingFont,bodyFont:fields.bodyFont??current.bodyFont,voice:fields.voice??current.voice};
 await guard(()=>db.prepare(`INSERT INTO brand_kits(org_id,colours,heading_font,body_font,voice,updated_by,updated_at) VALUES(?,?,?,?,?,?,CAST(? AS BIGINT))
  ON CONFLICT(environment,org_id) DO UPDATE SET colours=excluded.colours,heading_font=excluded.heading_font,body_font=excluded.body_font,voice=excluded.voice,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
  .bind(org,JSON.stringify(next.colours),next.headingFont,next.bodyFont,next.voice,userId,now).run());
 return {...current,...next,updatedAt:now};
}

export async function logoCount(db:Db,org:string){
 const row=await guard(()=>db.prepare('SELECT COUNT(*) AS n FROM brand_logos WHERE org_id=? AND deleted_at IS NULL').bind(org).first<{n:number}>());
 return Number(row?.n)||0;
}
/** Adds the row while the company has fewer than MAX_LOGOS; null when it is full. */
export async function addLogo(db:Db,logo:{id:string;org:string;name:string;type:string;size:number;userId:string},now=Date.now()):Promise<BrandLogo|null>{
 const r=await guard(()=>db.prepare(`INSERT INTO brand_logos(id,org_id,name,content_type,size,created_by,created_at)
  SELECT ?,?,?,?,CAST(? AS BIGINT),?,CAST(? AS BIGINT) WHERE (SELECT COUNT(*) FROM brand_logos WHERE org_id=? AND deleted_at IS NULL)<CAST(? AS BIGINT)`)
  .bind(logo.id,logo.org,logo.name,logo.type,logo.size,logo.userId,now,logo.org,MAX_LOGOS).run());
 if(!r.meta.changes)return null;
 return toLogo({id:logo.id,name:logo.name,content_type:logo.type,size:logo.size,created_at:now});
}
/** The company's own logo, or null (another company's id reads as not found). */
export async function findLogo(db:Db,org:string,id:string):Promise<BrandLogo|null>{
 const row=await guard(()=>db.prepare('SELECT id,name,content_type,size,created_at FROM brand_logos WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(id,org).first<LogoRow>());
 return row?toLogo(row):null;
}
export async function renameLogo(db:Db,org:string,id:string,name:string):Promise<BrandLogo>{
 const r=await guard(()=>db.prepare('UPDATE brand_logos SET name=? WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(name,id,org).run());
 if(!r.meta.changes)throw new BrandKitError(LOGO_NOT_FOUND,404);
 const logo=await findLogo(db,org,id);
 if(!logo)throw new BrandKitError(LOGO_NOT_FOUND,404);
 return logo;
}
/** Marks the logo removed; the route then deletes its picture. */
export async function removeLogo(db:Db,org:string,id:string,now=Date.now()){
 const r=await guard(()=>db.prepare('UPDATE brand_logos SET deleted_at=CAST(? AS BIGINT) WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(now,id,org).run());
 if(!r.meta.changes)throw new BrandKitError(LOGO_NOT_FOUND,404);
}
