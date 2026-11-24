export const runtime='nodejs';
import {bucket,context,fail,readJson,StudioError} from '@/lib/studio-server';
import {addRecent,cleanValue,readRecent,recentKey,type RecentKind} from '@/lib/editor/recent';

// This person's recent fonts and colours in the editor (lib/editor/recent.ts):
// kept under their own storage folder in the company, so every browser they
// use shows the same "Recent". GET reads both lists; PUT adds one value at the
// front of one list. Only ever the signed-in person's own (the server's prefix,
// never one from the request).
const KINDS:readonly RecentKind[]=['fonts','colours'];

export async function GET(request:Request){try{
 const ctx=await context(request),store=bucket(ctx.BUCKET);
 const object=await store.get(recentKey(ctx.prefix));
 return Response.json({recent:readRecent(object?await object.text():null)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return fail(e)}}

export async function PUT(request:Request){try{
 const ctx=await context(request,true),store=bucket(ctx.BUCKET);
 const body=await readJson(request,2000),kind=KINDS.find(k=>k===body.kind);
 const value=kind?cleanValue(kind,body.value):null;
 if(!kind||!value)throw new StudioError('That isn’t a font or a colour the editor keeps.');
 return Response.json({recent:await addRecent(store,ctx.prefix,kind,value)});
}catch(e){return fail(e)}}
