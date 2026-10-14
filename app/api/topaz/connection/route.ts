export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {topazStatus,saveTopazKey,removeTopazKey} from '@/lib/topaz-server';
const headers={'Cache-Control':'private, no-store'};
function sameOrigin(r:Request){if(r.headers.get('origin')!==new URL(r.url).origin)throw new StudioError('Open the Topaz connection in your studio.',403)}
export async function GET(r:Request){try{return Response.json(await topazStatus(await context(r)),{headers})}catch(e){return fail(e)}}
export async function POST(r:Request){try{sameOrigin(r);const ctx=await context(r,true),d=await readJson(r,2048),key=typeof d.key==='string'?d.key.trim():'';if(!/^[\x21-\x7e]{20,512}$/.test(key))throw new StudioError('Enter your complete Topaz API key.');await saveTopazKey(ctx,key);return Response.json(await topazStatus(ctx),{headers})}catch(e){return fail(e)}}
export async function DELETE(r:Request){try{sameOrigin(r);await removeTopazKey(await context(r,true));return Response.json({removed:true},{headers})}catch(e){return fail(e)}}
