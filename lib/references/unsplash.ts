import type {ProviderCall,ReferenceCredit,ReferenceEnv,ReferencePhoto,ReferenceProvider,SearchPage,SearchQuery} from './provider.ts';
import {MAX_PAGE,PHOTO_ID,ReferenceProviderError} from './provider.ts';
import {allowedUrl,guardedFetch,readLimited,release,UNREACHABLE} from './fetch.ts';

// Unsplash, through its official API only (docs/references.md has the owner's
// steps). What its API guidelines ask, and where it is done:
//  - the key stays on the server: UNSPLASH_ACCESS_KEY, sent only to
//    api.unsplash.com, never logged, never in a response;
//  - pictures are shown from Unsplash's own image addresses (images.unsplash.com,
//    `thumb` and `src` below), never copied to show them;
//  - every photo carries "Photo by <name> on Unsplash", both links with
//    utm_source and utm_medium (unsplashCredit);
//  - when a photo is used (added to the references, which brings it into the
//    Studio's storage), its links.download_location is requested (track).
// Requests go only to api.unsplash.com and images.unsplash.com, https, with a
// deadline, a size limit and redirects that cannot leave those hosts (fetch.ts).

const API='https://api.unsplash.com';
const API_HOSTS=['api.unsplash.com'] as const;
const IMAGE_HOSTS=['images.unsplash.com'] as const;
export const UNSPLASH_HOSTS=[...API_HOSTS,...IMAGE_HOSTS];
/** Unsplash asks for the app's name as utm_source on every link back to it. */
const UTM='utm_source=nmesis_studio&utm_medium=referral';
const SOURCE_HREF='https://unsplash.com/?'+UTM;
const TIMEOUT={search:8000,photo:8000,image:15000,track:8000};
const JSON_LIMIT=2_000_000;
/** The same ceiling as an upload (app/api/assets/route.ts). */
export const IMAGE_LIMIT=8_000_000;
/** The long edge of the copy brought into the Studio: enough for a reference, small enough to stay well under the limit. */
const USE_WIDTH=2048;
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
const KEY=/^[A-Za-z0-9_-]{16,200}$/;
const USERNAME=/^[A-Za-z0-9_.-]{1,64}$/;
const UNAVAILABLE='The photo library isn\'t set up yet.';
const NOT_USABLE='That photo could not be used. Choose another.';

/** The access key, or null when it is missing or not shaped like one. */
export function unsplashKey(env:ReferenceEnv=process.env){
 const key=(env.UNSPLASH_ACCESS_KEY||'').trim();
 return KEY.test(key)?key:null;
}
function requireKey(env:ReferenceEnv|undefined){
 const key=unsplashKey(env??process.env);
 if(!key)throw new ReferenceProviderError(UNAVAILABLE,503);
 return key;
}

const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';

/** "Photo by <name> on Unsplash": the photographer's page and Unsplash's, both with the utm parameters. Null without a name to credit. */
export function unsplashCredit(user:{name?:unknown;username?:unknown}|undefined):ReferenceCredit|null{
 const username=typeof user?.username==='string'&&USERNAME.test(user.username)?user.username:null;
 const name=clean(user?.name,80)||username;
 if(!name)return null;
 return {name,href:username?`https://unsplash.com/@${username}?${UTM}`:SOURCE_HREF,source:'Unsplash',sourceHref:SOURCE_HREF};
}

type Raw={id?:unknown;width?:unknown;height?:unknown;alt_description?:unknown;description?:unknown;urls?:Record<string,unknown>;links?:Record<string,unknown>;user?:{name?:unknown;username?:unknown}};
/** A photo, and what only the server keeps: the full-size address and the download tracking address. */
type Known={photo:ReferencePhoto;raw:string;track:string};
const image=(v:unknown)=>allowedUrl(v,IMAGE_HOSTS)?.href??null;
const size=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?Math.round(v):0;

/** One photo of an API answer, or null when anything needed is missing or not on Unsplash's own hosts. */
function known(value:unknown):Known|null{
 if(!value||typeof value!=='object')return null;
 const r=value as Raw;
 if(typeof r.id!=='string'||!PHOTO_ID.test(r.id))return null;
 const thumb=image(r.urls?.small),src=image(r.urls?.regular),raw=image(r.urls?.raw);
 const credit=unsplashCredit(r.user);
 if(!thumb||!src||!raw||!credit)return null;
 const track=allowedUrl(r.links?.download_location,API_HOSTS)?.href??`${API}/photos/${r.id}/download`;
 // The photo's own page, built from its id (an id is letters, digits, - and _), with the utm parameters.
 const page=`https://unsplash.com/photos/${r.id}?${UTM}`;
 return {photo:{id:r.id,provider:'unsplash',thumb,src,width:size(r.width),height:size(r.height),alt:clean(r.alt_description,200)||clean(r.description,200),credit:{...credit,page}},raw,track};
}

// Answers remembered for a while per server: Unsplash counts requests per hour
// per key, and an endlessly scrolling grid asks for the same pages again.
const MEMO_MS=10*60_000;
const searches=new Map<string,{at:number;page:SearchPage}>();
const photos=new Map<string,Known>();
function remember<K,V>(map:Map<K,V>,key:K,value:V,max:number){map.delete(key);map.set(key,value);if(map.size>max)map.delete(map.keys().next().value as K)}
/** Forgets remembered searches and photos (tests). */
export function forgetUnsplash(){searches.clear();photos.clear()}

function apiFailure(response:Response){
 const status=response.status;
 console.error('Reference library request failed',JSON.stringify({provider:'unsplash',status,remaining:response.headers.get('x-ratelimit-remaining')}));
 if(status===429||status===403&&response.headers.get('x-ratelimit-remaining')==='0')return new ReferenceProviderError('The photo library has had a lot of searches this hour. Try again in a few minutes.',429);
 if(status===401)return new ReferenceProviderError('The photo library refused the Studio\'s access key. Ask Nmesis to check it.',503);
 if(status===404)return new ReferenceProviderError('That photo is no longer in the photo library.',404);
 return new ReferenceProviderError(UNREACHABLE,502);
}

const apiHeaders=(key:string)=>({Authorization:'Client-ID '+key,'Accept-Version':'v1',Accept:'application/json'});
async function apiJson(url:string,key:string,call:ProviderCall,timeout:number):Promise<unknown>{
 const response=await guardedFetch(url,{hosts:API_HOSTS,timeout,signal:call.signal,fetch:call.fetch,headers:apiHeaders(key)});
 if(!response.ok){await release(response);throw apiFailure(response)}
 const text=new TextDecoder().decode(await readLimited(response,JSON_LIMIT,UNREACHABLE));
 try{return JSON.parse(text)}catch{throw new ReferenceProviderError(UNREACHABLE,502)}
}

// Unsplash's rule: a photo that is used is reported to its download_location.
// A failure here is logged (status only) and does not undo what the person did.
async function track(url:string,key:string,call:ProviderCall){
 try{
  const response=await guardedFetch(url,{hosts:API_HOSTS,timeout:TIMEOUT.track,signal:call.signal,fetch:call.fetch,headers:apiHeaders(key)});
  await release(response);
  if(!response.ok)console.error('Reference library download tracking failed',JSON.stringify({provider:'unsplash',status:response.status}));
 }catch(e){
  console.error('Reference library download tracking failed',JSON.stringify({provider:'unsplash',error:e instanceof ReferenceProviderError?e.status:'UnknownError'}));
 }
}

export const unsplash:ReferenceProvider={
 id:'unsplash',
 label:'Unsplash',
 unavailable:UNAVAILABLE,
 available:(env=process.env)=>unsplashKey(env)!==null,
 async search({query,page,perPage}:SearchQuery,call:ProviderCall={}):Promise<SearchPage>{
  const key=requireKey(call.env);
  const q=clean(query,100);
  if(!q)return {photos:[],nextPage:null};
  const memo=`${q.toLowerCase()}|${page}|${perPage}`,hit=searches.get(memo);
  if(hit&&Date.now()-hit.at<MEMO_MS)return hit.page;
  const url=new URL(API+'/search/photos');
  url.searchParams.set('query',q);url.searchParams.set('page',String(page));url.searchParams.set('per_page',String(perPage));url.searchParams.set('content_filter','high');
  const body=await apiJson(url.href,key,call,TIMEOUT.search) as {total_pages?:unknown;results?:unknown}|null;
  const results=Array.isArray(body?.results)?body.results:[];
  const found=results.map(known).filter((k):k is Known=>k!==null);
  for(const k of found)remember(photos,k.photo.id,k,2000);
  const pages=typeof body?.total_pages==='number'?body.total_pages:0;
  const out={photos:found.map(k=>k.photo),nextPage:results.length>0&&page<pages&&page<MAX_PAGE?page+1:null};
  remember(searches,memo,{at:Date.now(),page:out},300);
  return out;
 },
 async fetchForUse(id:string,call:ProviderCall={}){
  const key=requireKey(call.env);
  if(!PHOTO_ID.test(id))throw new ReferenceProviderError('That photo is no longer in the photo library.',404);
  // The full-size address comes from Unsplash's own answer (remembered from a
  // search, or asked for now), never from the request.
  const photo=photos.get(id)??known(await apiJson(`${API}/photos/${encodeURIComponent(id)}`,key,call,TIMEOUT.photo));
  if(!photo||photo.photo.id!==id)throw new ReferenceProviderError(NOT_USABLE,422);
  const url=new URL(photo.raw);
  url.searchParams.set('w',String(USE_WIDTH));url.searchParams.set('fit','max');url.searchParams.set('fm','jpg');url.searchParams.set('q','85');
  const response=await guardedFetch(url.href,{hosts:IMAGE_HOSTS,timeout:TIMEOUT.image,signal:call.signal,fetch:call.fetch,headers:{Accept:IMAGE_TYPES.join(',')}});
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok||!IMAGE_TYPES.includes(type)){
   await release(response);
   console.error('Reference library picture refused',JSON.stringify({provider:'unsplash',status:response.status,type:type.slice(0,40)}));
   throw new ReferenceProviderError(NOT_USABLE,502);
  }
  const bytes=await readLimited(response,IMAGE_LIMIT,'That photo is too large to use. Choose another.');
  await track(photo.track,key,call);
  return {bytes,type,photo:photo.photo};
 },
};
