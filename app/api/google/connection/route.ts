export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {googleStatus,saveGoogleKey,removeGoogleKey} from '@/lib/gemini-server';
const headers={'Cache-Control':'no-store'};
function sameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Open Google connection settings in your studio.',403)}
export async function GET(request:Request){try{return Response.json(await googleStatus(await context(request)),{headers})}catch(e){return fail(e)}}
export async function POST(request:Request){try{
  sameOrigin(request);const ctx=await context(request,true),data=await readJson(request,2048);
  const key=typeof data.key==='string'?data.key.trim():'';
  // Google auth keys can contain punctuation (for example the AQ. prefix).
  // Treat credentials as opaque printable tokens; Google verifies validity.
  if(!/^[\x21-\x7e]{20,512}$/.test(key))throw new StudioError('Enter your Google AI Studio API key.');
  const models=await saveGoogleKey(ctx,key);
  return Response.json({...await googleStatus(ctx),notice:models.length===2?'Both models are available. Google billing must be enabled before generating.':'Key saved. Only one requested model is currently available to this project. Google billing must be enabled before generating.'},{headers});
}catch(e){return fail(e)}}
export async function DELETE(request:Request){try{sameOrigin(request);await removeGoogleKey(await context(request,true));return Response.json({removed:true},{headers})}catch(e){return fail(e)}}
