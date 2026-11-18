import {ReferenceProviderError} from './provider.ts';
// Every request a reference provider makes goes through here: https only, to
// the provider's own hosts only (a redirect anywhere else is refused before it
// is followed), one deadline for the whole exchange including the body, and a
// size limit on what is read.

export type Guard={
 hosts:readonly string[];
 /** Milliseconds for the whole exchange, redirects and body included. */timeout:number;
 signal?:AbortSignal;
 fetch?:typeof fetch;
 headers?:Record<string,string>;
};

export const SLOW='The photo library is taking too long. Try again.';
export const UNREACHABLE='The photo library didn’t answer. Try again.';
const REFUSED='The photo library sent the Studio somewhere it does not go. Choose another photo.';
const REDIRECTS=new Set([301,302,303,307,308]),MAX_HOPS=3;

/** The address when it is https, on one of `hosts`, with no user, password or port; otherwise null. */
export function allowedUrl(value:unknown,hosts:readonly string[]):URL|null{
 if(typeof value!=='string'||!value)return null;
 let u:URL;try{u=new URL(value)}catch{return null}
 return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.includes(u.hostname)?u:null;
}

/** Lets go of a body nobody will read. */
export async function release(response:Response){
 try{await response.body?.cancel()}catch{/* already closed: nothing left to release */}
}

function networkError(e:unknown){
 const timedOut=e instanceof Error&&e.name==='TimeoutError';
 return new ReferenceProviderError(timedOut?SLOW:UNREACHABLE,timedOut?504:502);
}

/** Fetches `url`, following at most three redirects, each one checked against `guard.hosts`. */
export async function guardedFetch(url:string,guard:Guard):Promise<Response>{
 let target=allowedUrl(url,guard.hosts);
 if(!target)throw new ReferenceProviderError(REFUSED,502);
 const timer=AbortSignal.timeout(guard.timeout);
 const deadline=guard.signal?AbortSignal.any([guard.signal,timer]):timer;
 const f=guard.fetch??globalThis.fetch;
 for(let hop=0;hop<=MAX_HOPS;hop++){
  let response:Response;
  try{response=await f(target.href,{redirect:'manual',signal:deadline,headers:guard.headers,cache:'no-store'})}
  catch(e){throw networkError(e)}
  if(!REDIRECTS.has(response.status))return response;
  await release(response);
  const location=response.headers.get('location');
  let next:URL|null=null;
  if(location){try{next=allowedUrl(new URL(location,target).href,guard.hosts)}catch{next=null}}
  if(!next)throw new ReferenceProviderError(REFUSED,502);
  target=next;
 }
 throw new ReferenceProviderError(REFUSED,502);
}

/** The body, or a ReferenceProviderError(tooLarge, 422) as soon as it passes `limit` bytes. */
export async function readLimited(response:Response,limit:number,tooLarge:string):Promise<Uint8Array>{
 if(Number(response.headers.get('content-length')||0)>limit){await release(response);throw new ReferenceProviderError(tooLarge,422)}
 const reader=response.body?.getReader();
 if(!reader)return new Uint8Array(0);
 const chunks:Uint8Array[]=[];let total=0;
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>limit)throw new ReferenceProviderError(tooLarge,422);
   chunks.push(value);
  }
 }catch(e){
  try{await reader.cancel()}catch{/* the stream already failed: nothing left to cancel */}
  throw e instanceof ReferenceProviderError?e:networkError(e);
 }
 const bytes=new Uint8Array(total);let at=0;
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
 return bytes;
}
