export const runtime='nodejs';
import {context,fail,StudioError} from '@/lib/studio-server';
import {referenceProvider,REFERENCE_PROVIDERS} from '@/lib/references';
import {MAX_PAGE,ReferenceProviderError} from '@/lib/references/provider';
// GET ?q=&page=[&provider=]: one page of a photo library's search, for the
// References panel. Answers {provider, available, photos, nextPage}; while the
// library is not set up, the same shape with available:false and a plain sentence
// (200: a library that isn't set up is a state the panel and Smart pick show, not a failure,
// so the browser logs no error for it).
const PER_PAGE=24;
export async function GET(request:Request){try{
 await context(request);
 const params=new URL(request.url).searchParams;
 const provider=referenceProvider(params.get('provider')||REFERENCE_PROVIDERS[0].id);
 if(!provider)throw new StudioError('Choose a photo library.');
 const q=(params.get('q')||'').trim();
 if(!q||q.length>100)throw new StudioError('Type up to 100 characters to search for photos.');
 const pageText=params.get('page')||'1';
 const page=/^\d{1,2}$/.test(pageText)?Number(pageText):0;
 if(page<1||page>MAX_PAGE)throw new StudioError('That page of photos is not available.');
 if(!provider.available(process.env))return Response.json({error:provider.unavailable,provider:provider.id,available:false,photos:[],nextPage:null},{headers:{'Cache-Control':'no-store'}});
 const found=await provider.search({query:q,page,perPage:PER_PAGE},{signal:request.signal});
 return Response.json({provider:provider.id,available:true,photos:found.photos,nextPage:found.nextPage},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(e){return fail(e instanceof ReferenceProviderError?new StudioError(e.message,e.status):e)}}
