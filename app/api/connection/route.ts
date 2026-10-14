export const runtime='nodejs';
export const maxDuration=300;
import {context,fail,StudioError} from '@/lib/studio-server';
import {sponsorship} from '@/lib/sponsored-access';
import {saveKey,removeKey} from '@/lib/credentials';
function sameOrigin(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Open connection settings in your studio to continue.',403);
}
export async function POST(request:Request){try{
 const ctx=await context(request,true);sameOrigin(request);
 if(sponsorship(ctx).isGuest)throw new StudioError("Your connection is managed by the studio owner.",403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new StudioError('Invalid connection request.',415);
 const body=await request.text();if(body.length>2048)throw new StudioError('The connection request is too large.',413);
 let data;try{data=JSON.parse(body)}catch{throw new StudioError('The connection request could not be read.')}
 const key=typeof data?.key==='string'?data.key.trim():'';
 if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key))throw new StudioError('Enter a valid OpenAI API key.');
 if(!ctx.BUCKET||!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure key storage is not ready yet.',503);
 let response:Response;try{response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)})}catch{throw new StudioError('OpenAI could not be reached. Your key was not saved; please try again.',502)}
 if(response.status===401||response.status===403)throw new StudioError('OpenAI did not accept this key. Check that it is active and has permission to access models.',400);
 if(!response.ok)throw new StudioError('OpenAI could not verify the key right now. Your key was not saved; please try again.',502);
 const models:any=await response.json();const imageModel=ctx.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst';
 const imageAccess=Array.isArray(models.data)&&models.data.some((m:any)=>m.id===imageModel);
 await saveKey(ctx,key);
 return Response.json({connected:true,notice:imageAccess?'Connection verified. Image generation uses your OpenAI account.':'Key verified. The configured image model was not listed for this account; image generation may require additional access.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
export async function DELETE(request:Request){try{
 const ctx=await context(request,true);sameOrigin(request);await removeKey(ctx);
 return Response.json({removed:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e)}}
