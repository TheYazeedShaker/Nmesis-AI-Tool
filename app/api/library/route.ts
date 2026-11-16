export const runtime='nodejs';
export const maxDuration=60;
import {context,fail} from '@/lib/studio-server';
import {libraryPage,readQuery} from '@/lib/library-page';
// The one shared library, a page at a time, from the database alone:
// ?in=<all|unsorted|deleted|folder>&tool=&car=&who=you|others&q=&sort=new|old|name&offset=&limit=
export async function GET(request:Request){try{const ctx=await context(request);return Response.json(await libraryPage(ctx,readQuery(new URL(request.url))),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
