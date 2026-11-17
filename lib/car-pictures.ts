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

// The configurator's asset bucket is private (finish pass). The configurator
// signs links only for the brand folders it has switched to its CDN, so a brand
// name icon may come back as a plain bucket address (or an unsigned CDN one)
// that answers 403. The Studio then reads that object itself, signed with its
// own AWS credentials (S3 GetObject, SigV4), when the owner has named the bucket
// and granted the Studio's IAM user read on it:
//   CONFIGURATOR_ASSET_BUCKET   the bucket's name
//   CONFIGURATOR_ASSET_REGION   its region
//   CONFIGURATOR_ASSET_HOSTS    optional: the CDN host(s) in front of it, comma-separated
// Unset (or malformed): addresses are fetched as before. Nothing here names a
// real bucket or host; they come from the environment only.
export type AssetSource={bucket:string;region:string;hosts:string[]};
const BUCKET=/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,REGION=/^[a-z]{2}(-[a-z]+)+-\d$/,HOST=/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
export function configuratorAssets(env:Record<string,string|undefined>=process.env):AssetSource|null{
 const bucket=(env.CONFIGURATOR_ASSET_BUCKET||'').trim(),region=(env.CONFIGURATOR_ASSET_REGION||'').trim();
 if(!BUCKET.test(bucket)||bucket.includes('..')||!REGION.test(region))return null;
 const hosts=(env.CONFIGURATOR_ASSET_HOSTS||'').split(',').map(h=>h.trim().toLowerCase().replace(/^https:\/\//,'').replace(/\/+$/,'')).filter(h=>HOST.test(h)).slice(0,5);
 return {bucket,region,hosts};
}
const PICTURE_KEY=/\.(avif|png|jpe?g|webp|svg)$/i;
const escaped=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** The object an https address names in the asset bucket (path-style, virtual-host, or a CDN host in front of it), or null. Pictures only. */
export function assetObjectKey(url:string,source:AssetSource):string|null{
 let u:URL;try{u=new URL(url)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password)return null;
 const host=u.hostname.toLowerCase(),path=u.pathname.replace(/^\/+/,''),bucket=source.bucket.toLowerCase();
 let raw:string|null=null;
 if(/^s3([.-][a-z0-9-]+)*\.amazonaws\.com$/.test(host)){const [first,...rest]=path.split('/');if(first.toLowerCase()===bucket)raw=rest.join('/')}
 else if(new RegExp('^'+escaped(bucket)+'\\.s3([.-][a-z0-9-]+)*\\.amazonaws\\.com$').test(host)||source.hosts.includes(host))raw=path;
 if(!raw)return null;
 let key:string;try{key=decodeURIComponent(raw)}catch{return null}
 if(!key||key.length>1024||!PICTURE_KEY.test(key)||key.split('/').some(p=>p==='..'||p==='.'))return null;
 return key;
}
type GetObject=(input:{Bucket:string;Key:string},abortSignal:AbortSignal)=>Promise<{Body?:{transformToByteArray():Promise<Uint8Array>};ContentType?:string;ContentLength?:number}>;
export type AssetRead=(key:string)=>Promise<{bytes:Uint8Array;type:string}>;
/** Reads one object of the asset bucket, signed with the Studio's AWS credentials; never longer than TIMEOUT.image, never larger than IMAGE_LIMIT. */
export function s3AssetReader(source:AssetSource,{getObject,env=process.env}:{getObject?:GetObject;env?:Record<string,string|undefined>}={}):AssetRead{
 let get=getObject;
 return async key=>{
  if(!get){
   if(!env.S3_ACCESS_KEY_ID||!env.S3_SECRET_ACCESS_KEY)throw new Error('the Studio has no AWS credentials');
   const {S3Client,GetObjectCommand}=await import('@aws-sdk/client-s3');
   const client=new S3Client({region:source.region,credentials:{accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:{requestTimeout:TIMEOUT.image,connectionTimeout:5000},maxAttempts:2});
   get=(input,abortSignal)=>client.send(new GetObjectCommand(input),{abortSignal});
  }
  const r=await get({Bucket:source.bucket,Key:key},AbortSignal.timeout(TIMEOUT.image));
  if(Number(r.ContentLength||0)>IMAGE_LIMIT)throw new Error('too large');
  const type=r.ContentType||'';
  if(!IMAGE_TYPE.test(type)&&!(type==='binary/octet-stream'||type==='application/octet-stream'))throw new Error('not a picture');
  if(!r.Body)throw new Error('empty object');
  const bytes=await r.Body.transformToByteArray();
  if(bytes.byteLength>IMAGE_LIMIT)throw new Error('too large');
  return {bytes,type};
 };
}
export type Assets={source:AssetSource;read:AssetRead};
// A link the configurator signed is fetched as it is; an address in the asset
// bucket is read from the bucket when the owner set it up; anything else is fetched.
async function pictureBytes(url:string,{fetchImpl,assets}:{fetchImpl:Fetch;assets?:Assets|null}):Promise<Uint8Array>{
 const signedLink=/[?&]Signature=/.test(url),key=!signedLink&&assets?assetObjectKey(url,assets.source):null;
 if(key)return (await assets!.read(key)).bytes;
 const r=await fetchImpl(url,{signal:AbortSignal.timeout(TIMEOUT.image),redirect:'error',cache:'no-store'});
 if(!r.ok)throw new Error('picture answered '+r.status);
 if(!IMAGE_TYPE.test(r.headers.get('content-type')||''))throw new Error('not a picture');
 return readLimited(r,IMAGE_LIMIT);
}

/** Fetches a picture once, makes the small WebP and stores it under key (kept when it is already there). */
export async function storeSmall(store:Store,key:string,url:string,{fetchImpl=fetch,box,assets}:{fetchImpl?:Fetch;box:{width?:number;height?:number};assets?:Assets|null}){
 if(await store.head(key))return key;
 const bytes=await pictureBytes(url,{fetchImpl,assets});
 const sharp=(await import('sharp')).default;
 const out=await sharp(bytes,{failOn:'none',limitInputPixels:8000*8000}).rotate().resize({...box,fit:'inside',withoutEnlargement:true}).webp({quality:76,alphaQuality:90}).toBuffer();
 await store.put(key,out,{httpMetadata:{contentType:'image/webp'}});
 return key;
}
