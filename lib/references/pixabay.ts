import type {ProviderCall,ReferenceCredit,ReferenceEnv,ReferencePhoto,ReferenceProvider,SearchPage,SearchQuery} from './provider.ts';
import {MAX_PAGE,PHOTO_ID,ReferenceProviderError} from './provider.ts';
import {allowedUrl,guardedFetch,readLimited,release,UNREACHABLE} from './fetch.ts';

// Pixabay, through its official API only (docs/references.md has the owner's
// steps). What its API terms ask, and where it is done:
//  - the key stays on the server: PIXABAY_API_KEY, sent only to pixabay.com's
//    API (as its `key` parameter, so no address with it is ever logged or
//    returned), never to a browser;
//  - search answers are kept for 24 hours (KEEP_MS): in this server's memory and
//    in the Studio's own storage through the route's cache (call.cache), so
//    every server of one Studio shares them;
//  - no permanent hotlinking: search results show Pixabay's own picture
//    addresses for a while (they expire), and a photo that is used is copied
//    into the Studio's storage (fetchForUse, through the import route), never
//    kept as an address;
//  - where the images come from is shown with the results ("Image by <name> on
//    Pixabay", both linked);
//  - 100 requests a minute: the server stops asking once Pixabay says none are
//    left, until its reset.
// Requests go only to pixabay.com (its API and its /get/ pictures) and
// cdn.pixabay.com, https, with a deadline, a size limit and redirects that
// cannot leave those hosts (fetch.ts).

const API='https://pixabay.com/api/';
const API_HOSTS=['pixabay.com'] as const;
const IMAGE_HOSTS=['pixabay.com','cdn.pixabay.com'] as const;
export const PIXABAY_HOSTS=[...IMAGE_HOSTS];
const SOURCE_HREF='https://pixabay.com/';
const TIMEOUT={search:8000,photo:8000,image:15000};
const JSON_LIMIT=2_000_000;
/** The same ceiling as an upload (app/api/assets/route.ts). */
const IMAGE_LIMIT=8_000_000;
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
/** Pixabay keys are digits, a dash and hex. */
const KEY=/^[A-Za-z0-9-]{16,100}$/;
const USERNAME=/^[A-Za-z0-9_.-]{1,64}$/;
/** Pixabay's own rule: keep every answer 24 hours. */
export const KEEP_MS=24*60*60_000;
/** Pixabay answers at most 500 photos for one search (its totalHits). */
const MAX_HITS=500;
const UNAVAILABLE='Pixabay isn\'t set up yet.';
const NOT_USABLE='That photo could not be used. Choose another.';
const GONE='That photo is no longer on Pixabay.';

/** The API key, or null when it is missing or not shaped like one. */
export function pixabayKey(env:ReferenceEnv=process.env){
 const key=(env.PIXABAY_API_KEY||'').trim();
 return KEY.test(key)?key:null;
}
function requireKey(env:ReferenceEnv|undefined){
 const key=pixabayKey(env??process.env);
 if(!key)throw new ReferenceProviderError(UNAVAILABLE,503);
 return key;
}

const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const size=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?Math.round(v):0;

/** "Image by <name> on Pixabay": the person's Pixabay page and Pixabay's. Null without a name to credit. */
export function pixabayCredit(hit:{user?:unknown;user_id?:unknown}|undefined):ReferenceCredit|null{
 const name=clean(hit?.user,80);
 if(!name)return null;
 const userId=typeof hit?.user_id==='number'&&Number.isSafeInteger(hit.user_id)&&hit.user_id>0?hit.user_id:null;
 const href=userId&&USERNAME.test(name)?`https://pixabay.com/users/${name}-${userId}/`:SOURCE_HREF;
 return {name,href,source:'Pixabay',sourceHref:SOURCE_HREF};
}

type Raw={id?:unknown;pageURL?:unknown;tags?:unknown;webformatURL?:unknown;largeImageURL?:unknown;imageWidth?:unknown;imageHeight?:unknown;user?:unknown;user_id?:unknown};
/** A photo, and what only the server keeps: the address of the size brought into the Studio. */
type Known={photo:ReferencePhoto;large:string};
const image=(v:unknown)=>allowedUrl(v,IMAGE_HOSTS)?.href??null;

/** One hit of an API answer, or null when anything needed is missing or not on Pixabay's own hosts. */
function known(value:unknown):Known|null{
 if(!value||typeof value!=='object')return null;
 const r=value as Raw;
 const id=typeof r.id==='number'&&Number.isSafeInteger(r.id)&&r.id>0?String(r.id):null;
 if(!id||!PHOTO_ID.test(id))return null;
 // webformatURL is 640 px on its long edge; the same address with _340 is the smaller one (Pixabay's documented sizes).
 const src=image(r.webformatURL),large=image(r.largeImageURL)??src;
 const thumb=src&&/_640\.(jpe?g|png)$/i.test(src)?src.replace(/_640\.(jpe?g|png)$/i,'_340.$1'):src;
 const credit=pixabayCredit(r);
 if(!src||!thumb||!large||!credit)return null;
 const page=allowedUrl(r.pageURL,['pixabay.com'])?.href;
 return {photo:{id,provider:'pixabay',thumb,src,width:size(r.imageWidth),height:size(r.imageHeight),alt:clean(r.tags,200),credit:page?{...credit,page}:credit},large};
}

// Answers kept 24 hours (Pixabay's rule): here per server, and in the shared cache.
type Kept={at:number;page:SearchPage;known:Known[]};
const searches=new Map<string,Kept>();
const photos=new Map<string,Known>();
function remember<K,V>(map:Map<K,V>,key:K,value:V,max:number){map.delete(key);map.set(key,value);if(map.size>max)map.delete(map.keys().next().value as K)}
/** The moment Pixabay said no request is left until (per server); 0 when requests may go. */
let pausedUntil=0;
/** Forgets kept searches, photos and the pause (tests). */
export function forgetPixabay(){searches.clear();photos.clear();pausedUntil=0}

const BUSY='Pixabay has had a lot of searches this minute. Try again in a moment.';
function apiFailure(response:Response,text:string,now:number){
 const status=response.status;
 console.error('Reference library request failed',JSON.stringify({provider:'pixabay',status,remaining:response.headers.get('x-ratelimit-remaining')}));
 if(status===429){pausedUntil=now+resetMs(response);return new ReferenceProviderError(BUSY,429)}
 // Pixabay says a bad key with a 400 and words about the key (its body is never shown or logged).
 if(status===401||status===403||(status===400&&/key/i.test(text)))return new ReferenceProviderError('Pixabay refused the Studio\'s access key. Ask Nmesis to check it.',503);
 if(status===404)return new ReferenceProviderError(GONE,404);
 return new ReferenceProviderError(UNREACHABLE,502);
}
const resetMs=(response:Response)=>{const s=Number(response.headers.get('x-ratelimit-reset'));return Number.isFinite(s)&&s>0?Math.min(s,120)*1000:60_000};

async function apiJson(params:URLSearchParams,key:string,call:ProviderCall,timeout:number):Promise<unknown>{
 const now=(call.now??Date.now)();
 if(pausedUntil>now)throw new ReferenceProviderError(BUSY,429);
 const url=new URL(API);
 url.searchParams.set('key',key);
 for(const [k,v] of params)url.searchParams.set(k,v);
 const response=await guardedFetch(url.href,{hosts:API_HOSTS,timeout,signal:call.signal,fetch:call.fetch,headers:{Accept:'application/json'}});
 if(response.headers.get('x-ratelimit-remaining')==='0')pausedUntil=now+resetMs(response);
 if(!response.ok){
  const text=new TextDecoder().decode(await readLimited(response,4000,UNREACHABLE).catch(()=>new Uint8Array(0)));
  throw apiFailure(response,text,now);
 }
 const text=new TextDecoder().decode(await readLimited(response,JSON_LIMIT,UNREACHABLE));
 try{return JSON.parse(text)}catch{throw new ReferenceProviderError(UNREACHABLE,502)}
}

/** An answer as the shared cache keeps it: when, the next page, and the API's own fields of each hit. */
type Stored={at:number;nextPage:number|null;hits:Raw[]};
const FIELDS=['id','pageURL','tags','webformatURL','largeImageURL','imageWidth','imageHeight','user','user_id'] as const;
const stored=(hit:unknown):Raw|null=>hit&&typeof hit==='object'?Object.fromEntries(FIELDS.map(f=>[f,(hit as Record<string,unknown>)[f]])):null;
/** The answer for this search: its hits read again (checked like a fresh answer), or null when it is not one or is 24 hours old. */
function keptFrom(value:unknown,now:number):Kept|null{
 const v=value as Stored|null;
 if(!v||typeof v!=='object'||typeof v.at!=='number'||now<v.at||now-v.at>=KEEP_MS||!Array.isArray(v.hits))return null;
 return keep(v.at,v.hits,typeof v.nextPage==='number'?v.nextPage:null);
}
function keep(at:number,hits:readonly unknown[],nextPage:number|null):Kept{
 const found=hits.map(known).filter((k):k is Known=>k!==null);
 return {at,known:found,page:{photos:found.map(k=>k.photo),nextPage}};
}

export const pixabay:ReferenceProvider={
 id:'pixabay',
 label:'Pixabay',
 unavailable:UNAVAILABLE,
 available:(env=process.env)=>pixabayKey(env)!==null,
 async search({query,page,perPage}:SearchQuery,call:ProviderCall={}):Promise<SearchPage>{
  const key=requireKey(call.env);
  const q=clean(query,100);
  if(!q)return {photos:[],nextPage:null};
  // Pixabay asks for 3 to 200 a page.
  const per=Math.min(200,Math.max(3,Math.round(perPage)));
  if(page>Math.ceil(MAX_HITS/per))return {photos:[],nextPage:null};
  const now=(call.now??Date.now)(),memo=`${q.toLowerCase()}|${page}|${per}`;
  let kept=searches.get(memo)??null;
  if(kept&&now-kept.at>=KEEP_MS){searches.delete(memo);kept=null}
  if(!kept&&call.cache){
   kept=keptFrom(await call.cache.get(memo).catch(()=>null),now);
   if(kept)remember(searches,memo,kept,500);
  }
  if(!kept){
   const body=await apiJson(new URLSearchParams({q,page:String(page),per_page:String(per),image_type:'photo',safesearch:'true',lang:'en'}),key,call,TIMEOUT.search) as {totalHits?:unknown;hits?:unknown}|null;
   const hits=(Array.isArray(body?.hits)?body.hits:[]).map(stored);
   const total=typeof body?.totalHits==='number'?Math.min(body.totalHits,MAX_HITS):0;
   const nextPage=hits.length>0&&page*per<total&&page<MAX_PAGE?page+1:null;
   kept=keep(now,hits,nextPage);
   remember(searches,memo,kept,500);
   const value:Stored={at:now,nextPage,hits:hits.filter((h):h is Raw=>known(h)!==null)};
   if(call.cache)await call.cache.set(memo,value).catch(()=>{/* a cache that can't be written is a miss next time */});
  }
  for(const k of kept.known)remember(photos,k.photo.id,k,2000);
  return kept.page;
 },
 async fetchForUse(id:string,call:ProviderCall={}){
  const key=requireKey(call.env);
  if(!PHOTO_ID.test(id)||!/^\d+$/.test(id))throw new ReferenceProviderError(GONE,404);
  // The picture's address comes from Pixabay's own answer (kept from a search, or asked for now), never from the request.
  let photo=photos.get(id)??null;
  if(!photo){
   const body=await apiJson(new URLSearchParams({id}),key,call,TIMEOUT.photo) as {hits?:unknown}|null;
   photo=Array.isArray(body?.hits)?known(body.hits[0]):null;
  }
  if(!photo||photo.photo.id!==id)throw new ReferenceProviderError(NOT_USABLE,422);
  const response=await guardedFetch(photo.large,{hosts:IMAGE_HOSTS,timeout:TIMEOUT.image,signal:call.signal,fetch:call.fetch,headers:{Accept:IMAGE_TYPES.join(',')}});
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok||!IMAGE_TYPES.includes(type)){
   await release(response);
   console.error('Reference library picture refused',JSON.stringify({provider:'pixabay',status:response.status,type:type.slice(0,40)}));
   // A kept address may have expired (Pixabay's picture addresses last about a day): ask again next time.
   photos.delete(id);
   throw new ReferenceProviderError(NOT_USABLE,502);
  }
  const bytes=await readLimited(response,IMAGE_LIMIT,'That photo is too large to use. Choose another.');
  return {bytes,type,photo:photo.photo};
 },
};
