export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {grantSupport,supportState,withdrawSupport} from '@/lib/support-access';
// Company settings → "Allow Nmesis support access" (owners), and the log of
// Nmesis openings. Every request is the signed-in owner's own company.
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{return Response.json(await supportState(await context(request)),{headers})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const ctx=await context(request,true),d=await readJson(request,2048);return Response.json(await grantSupport(ctx,d.note),{headers})}catch(e){return fail(e)}}
export async function DELETE(request:Request){try{return Response.json(await withdrawSupport(await context(request,true)),{headers})}catch(e){return fail(e)}}
