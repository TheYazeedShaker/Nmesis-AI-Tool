export const runtime='nodejs';
import {createHash} from 'node:crypto';
import {context,fail,StudioError} from '@/lib/studio-server';
import {getStorage} from '@/lib/portable/storage';
import {PHOTO_LIBRARIES,referenceProvider,REFERENCE_PROVIDERS} from '@/lib/references';
import {MAX_PAGE,ReferenceProviderError,type ReferencePhoto,type ReferenceProvider,type SearchCache} from '@/lib/references/provider';
// GET ?q=&page=[&provider=]: one page of a photo library's search, for the
// References panel. Answers {provider, available, photos, nextPage}; while the
// library is not set up, the same shape with available:false and a plain sentence
// (200: a library that isn't set up is a state the panel and Smart pick show, not a failure,
// so the browser logs no error for it).
// GET ?q=&page=&provider=all: every photo library of the editor's Photos panel
// at once (lib/references PHOTO_LIBRARIES), their photos taken in turn. Answers
// {libraries:[{id, label, on, notice?}], photos, nextPage}: a library that is
// off or fails says so in its own entry and the others still answer.
const PER_PAGE=24,PER_LIBRARY=16;

/** Search answers kept in the Studio's own storage (one Studio's servers share them), for a library whose rules ask for it. */
function storageCache(provider:string):SearchCache|undefined{
 const store=getStorage();if(!store)return undefined;
 const key=(k:string)=>`cache/photo-search/${provider}/${createHash('sha256').update(k).digest('hex')}.json`;
 return {
  async get(k){const o=await store.get(key(k));return o?await o.json():null},
  async set(k,v){await store.put(key(k),new TextEncoder().encode(JSON.stringify(v)),{httpMetadata:{contentType:'application/json'}})},
 };
}

type Answer={id:string;label:string;on:boolean;notice?:string;photos:ReferencePhoto[];nextPage:number|null};
async function searchAll(q:string,page:number,signal:AbortSignal){
 const answers=await Promise.all(PHOTO_LIBRARIES.map(async(p:ReferenceProvider):Promise<Answer>=>{
  const entry={id:p.id,label:p.label};
  if(!p.available(process.env))return {...entry,on:false,notice:p.unavailable,photos:[],nextPage:null};
  try{const found=await p.search({query:q,page,perPage:PER_LIBRARY},{signal,cache:storageCache(p.id)});return {...entry,on:true,photos:found.photos,nextPage:found.nextPage}}
  catch(e){if(signal.aborted)throw e;return {...entry,on:true,notice:e instanceof ReferenceProviderError?e.message:'This library didn’t answer. Try again.',photos:[],nextPage:null}}
 }));
 // In turn, so no library's photos all come first.
 const photos:ReferencePhoto[]=[];
 for(let i=0;answers.some(a=>i<a.photos.length);i++)for(const a of answers)if(i<a.photos.length)photos.push(a.photos[i]);
 const nextPage=answers.some(a=>a.nextPage!==null)?page+1:null;
 return {libraries:answers.map(a=>({id:a.id,label:a.label,on:a.on,notice:a.notice})),photos,nextPage};
}

export async function GET(request:Request){try{
 await context(request);
 const params=new URL(request.url).searchParams;
 const all=params.get('provider')==='all';
 const provider=referenceProvider(params.get('provider')||REFERENCE_PROVIDERS[0].id);
 if(!all&&!provider)throw new StudioError('Choose a photo library.');
 const q=(params.get('q')||'').trim();
 // No words with every library: only which libraries are on (the Photos panel, before a search).
 if(all&&!q)return Response.json({libraries:PHOTO_LIBRARIES.map(p=>p.available(process.env)?{id:p.id,label:p.label,on:true}:{id:p.id,label:p.label,on:false,notice:p.unavailable}),photos:[],nextPage:null},{headers:{'Cache-Control':'no-store'}});
 if(!q||q.length>100)throw new StudioError('Type up to 100 characters to search for photos.');
 const pageText=params.get('page')||'1';
 const page=/^\d{1,2}$/.test(pageText)?Number(pageText):0;
 if(page<1||page>MAX_PAGE)throw new StudioError('That page of photos is not available.');
 if(all||!provider)return Response.json(await searchAll(q,page,request.signal),{headers:{'Cache-Control':'private, max-age=60'}});
 if(!provider.available(process.env))return Response.json({error:provider.unavailable,provider:provider.id,available:false,photos:[],nextPage:null},{headers:{'Cache-Control':'no-store'}});
 const found=await provider.search({query:q,page,perPage:PER_PAGE},{signal:request.signal,cache:storageCache(provider.id)});
 return Response.json({provider:provider.id,available:true,photos:found.photos,nextPage:found.nextPage},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(e){return fail(e instanceof ReferenceProviderError?new StudioError(e.message,e.status):e)}}
