export const runtime='nodejs';
export const maxDuration=300;
import {context,bucket,fail,imageKey,readJson,validId,StudioError} from '@/lib/studio-server';
import {googleCredential,type GoogleImageInput} from '@/lib/gemini-server';
import {charged} from '@/lib/credits/charge';
import {inspectNanoReferences} from '@/lib/nano-analysis-server';
export async function POST(request:Request){try{
 const ctx=await context(request,true),d=await readJson(request),store=bucket(ctx.BUCKET);
 if(!validId(d.sourceId)||!validId(d.moodId))throw new StudioError('Choose a car and inspiration.');
 const cacheKey=ctx.prefix+'nano-inspections/v2-'+d.sourceId+'-'+d.moodId+'.json',cached=await store.get(cacheKey);if(cached)return Response.json({analysis:await cached.json(),cached:true});
 const images:GoogleImageInput[]=[];let total=0;
 for(const id of [d.sourceId,d.moodId]){const item=await store.get(imageKey(ctx.prefix,id));if(!item)throw new StudioError('A reference is missing.',404);total+=item.size;if(total>12_000_000)throw new StudioError('Use references under 12 MB total.');images.push({bytes:new Uint8Array(await item.arrayBuffer()),type:item.httpMetadata?.contentType||'image/png'})}
 const cred=await googleCredential(ctx);
 const {value:result,credits}=await charged(ctx,{tool:'studio.smart_reference',action:'Reference check',provider:'google',own:cred.own,cost:'google.text'},()=>inspectNanoReferences(cred.key,images));
 const id=crypto.randomUUID(),analysis={...result,id,sourceId:d.sourceId,moodId:d.moodId,createdAt:new Date().toISOString(),model:'gemini-3.8-flash'};
 await store.put(ctx.prefix+'nano-inspections/'+id+'.json',JSON.stringify(analysis),{httpMetadata:{contentType:'application/json'}});
 await store.put(cacheKey,JSON.stringify(analysis),{httpMetadata:{contentType:'application/json'}});
 return Response.json({analysis,cached:false,credits});
}catch(e){return fail(e)}}
