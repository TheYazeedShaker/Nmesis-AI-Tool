import {createHash} from 'node:crypto';
import {orgKey} from './portable/tenancy.ts';

// A car's real picture and its brand's logo, from the configurator itself
// (Phase 3 polish). The configurator site serves each car's settings at
// /api/config?brand=&model= and its frame list at /api/exterior-manifest; the
// picture is the frame the configurator opens on (its default grade, colour,
// lighting and angle), the logo is the brand name icon it shows. The Studio
// fetches each once through the server, keeps a small WebP in the company's
// own storage, and serves it on a short-lived signed link. The stored name
// carries a fingerprint of the frame's address, so a changed configurator
// (another frame, colour or grade) makes a new picture; the remembered
// address is re-read every PICTURE_MEMO_MS.
//
// Nothing a person sends reaches these requests except a car or brand id that
// the route has already checked is one of the company's (and both match ID).

export const ID=/^[A-Za-z0-9_-]{1,64}$/;
export const PICTURE_WIDTH=640;
export const LOGO_HEIGHT=96;
const MEMO_MS=10*60_000;
const JSON_LIMIT=2_000_000,IMAGE_LIMIT=15_000_000;
const TIMEOUT={json:10_000,image:15_000};

type Signing={assetSignatures?:Record<string,string>;assetSignaturesHost?:string};
type Grade={id?:string;folder?:string;colorIds?:string[];_colorCdnLinks?:Record<string,Record<string,string>>};
type Colour={id:string;available?:boolean;lightingFolders?:Record<string,string>};
export type CarConfig=Signing&{
 grades?:Grade[];colors?:Colour[];defaults_lighting?:string;
 defaults?:{gradeId?:string;colorId?:string;frameIndex?:number};
 availableIcons?:{brandName?:string};
};
export type ExteriorManifest=Record<string,Record<string,Record<string,string[]>>>;

/** The configurator's address for server requests: CONFIGURATOR_API_ORIGIN (a local stand-in in the UI harness) or CONFIGURATOR_ORIGIN. https only; plain http only for this machine. */
export function configuratorApiOrigin(env:Record<string,string|undefined>=process.env){
 const raw=env.CONFIGURATOR_API_ORIGIN||env.CONFIGURATOR_ORIGIN;
 if(!raw)return null;
 try{const u=new URL(raw);return allowed(u)?u.origin:null}catch{return null}
}
function allowed(u:URL){return !u.username&&!u.password&&(u.protocol==='https:'||u.protocol==='http:'&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))}

// The configurator's own link signing (signAssetUrl on its pages): the
// signature for the first folder of the path, on the signing host only.
function signed(url:string,c:Signing){
 let u:URL;try{u=new URL(url)}catch{return null}
 if(!allowed(u))return null;
 if(!c.assetSignaturesHost||u.host!==c.assetSignaturesHost||u.searchParams.has('Signature'))return u.href;
 const folder=decodeURIComponent(u.pathname.replace(/^\/+/,'').split('/')[0]||'');
 const query=c.assetSignatures?.[folder];
 return query?`${u.href}${u.search?'&':'?'}${query}`:u.href;
}

/** The frame the configurator opens on, signed, or null when the car has no frames. Pure: the same rule as the configurator's getFramePath. */
export function openingFrame(config:CarConfig,manifest:ExteriorManifest,origin:string):string|null{
 const grades=Array.isArray(config.grades)?config.grades:[];
 const grade=grades.find(g=>g.id===config.defaults?.gradeId)||grades[0];
 if(!grade?.folder)return null;
 const colours=(Array.isArray(config.colors)?config.colors:[]).filter(c=>c&&c.available!==false&&(!grade.colorIds||grade.colorIds.includes(c.id)));
 const colour=colours.find(c=>c.id===config.defaults?.colorId)||colours[0];
 const lighting=config.defaults_lighting;
 if(!colour||!lighting)return null;
 const folder=colour.lightingFolders?.[lighting]??colour.id;
 const cdn=grade._colorCdnLinks?.[colour.id]?.[lighting];
 const files=manifest?.[grade.folder]?.[lighting]?.[folder];
 if(!cdn||!Array.isArray(files)||!files.length)return null;
 const at=Math.max(0,Number(config.defaults?.frameIndex??1)-1);
 const file=files[at]??files[0];
 if(typeof file!=='string'||!/^[^/?#]+\.(avif|png|jpe?g|webp)$/i.test(file))return null;
 let base:URL;try{base=new URL(cdn.replace(/\/+$/,'')+'/'+encodeURIComponent(file),origin)}catch{return null}
 return signed(base.href,config);
}

/** The brand name icon the configurator shows, signed, or null. */
export function brandIcon(config:CarConfig,origin:string):string|null{
 const icon=config.availableIcons?.brandName;
 if(typeof icon!=='string'||!icon)return null;
 try{return signed(new URL(icon,origin).href,config)}catch{return null}
}

/** The address without its signature: what the stored picture's name is made from. */
export const unsigned=(url:string)=>{const u=new URL(url);u.search='';return u.href};
const fingerprint=(url:string)=>createHash('sha256').update(unsigned(url)).digest('hex').slice(0,16);

export const pictureKey=(org:string,brandId:string,modelId:string,frame:string)=>orgKey(org,`cars/${brandId}/${modelId}/${fingerprint(frame)}.webp`);
export const logoKey=(org:string,brandId:string,icon:string)=>orgKey(org,`brands/${brandId}/${fingerprint(icon)}.webp`);

type Fetch=typeof fetch;
async function readLimited(r:Response,limit:number){
 const length=Number(r.headers.get('content-length')||0);
 if(length>limit)throw new Error('too large');
 const body=new Uint8Array(await r.arrayBuffer());
 if(body.byteLength>limit)throw new Error('too large');
 return body;
}
async function getJson<T>(f:Fetch,url:string):Promise<T>{
 const r=await f(url,{signal:AbortSignal.timeout(TIMEOUT.json),headers:{Accept:'application/json'},redirect:'error',cache:'no-store'});
 if(!r.ok)throw new Error('configurator answered '+r.status);
 return JSON.parse(new TextDecoder().decode(await readLimited(r,JSON_LIMIT))) as T;
}

// What each car's configurator said, remembered for a while per server.
type Known={frame:string|null;icon:string|null;at:number};
const memo=new Map<string,Known>();
export function forgetConfigurators(){memo.clear()}

export async function readCar(brandId:string,modelId:string,{origin,fetchImpl=fetch,now=Date.now()}:{origin:string;fetchImpl?:Fetch;now?:number}):Promise<Known>{
 if(!ID.test(brandId)||!ID.test(modelId))throw new Error('Invalid car.');
 const key=brandId+'.'+modelId,seen=memo.get(key);
 if(seen&&now-seen.at<MEMO_MS)return seen;
 const q=`?brand=${encodeURIComponent(brandId)}&model=${encodeURIComponent(modelId)}`;
 const [config,manifest]=await Promise.all([getJson<CarConfig>(fetchImpl,origin+'/api/config'+q),getJson<ExteriorManifest>(fetchImpl,origin+'/api/exterior-manifest'+q)]);
 const known={frame:openingFrame(config,manifest,origin),icon:brandIcon(config,origin),at:now};
 memo.set(key,known);if(memo.size>2000)memo.delete(memo.keys().next().value as string);
 return known;
}

type Store={head(key:string):Promise<unknown>;put(key:string,value:Uint8Array|Buffer,options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>};
const IMAGE_TYPE=/^image\/(png|jpe?g|webp|avif|svg\+xml)(;|$)/i;

/** Fetches a picture once, makes the small WebP and stores it under key (kept when it is already there). */
export async function storeSmall(store:Store,key:string,url:string,{fetchImpl=fetch,box}:{fetchImpl?:Fetch;box:{width?:number;height?:number}}){
 if(await store.head(key))return key;
 const r=await fetchImpl(url,{signal:AbortSignal.timeout(TIMEOUT.image),redirect:'error',cache:'no-store'});
 if(!r.ok)throw new Error('picture answered '+r.status);
 if(!IMAGE_TYPE.test(r.headers.get('content-type')||''))throw new Error('not a picture');
 const bytes=await readLimited(r,IMAGE_LIMIT);
 const sharp=(await import('sharp')).default;
 const out=await sharp(bytes,{failOn:'none',limitInputPixels:8000*8000}).rotate().resize({...box,fit:'inside',withoutEnlargement:true}).webp({quality:76,alphaQuality:90}).toBuffer();
 await store.put(key,out,{httpMetadata:{contentType:'image/webp'}});
 return key;
}
