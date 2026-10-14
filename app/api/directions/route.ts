export const runtime='nodejs';
export const maxDuration=300;
import {apiKey} from '@/lib/credentials';
import {bucket,context,fail,imageKey,readJson,str,validId,StudioError} from '@/lib/studio-server';
import {localDirections} from '@/lib/studio';
export async function POST(request:Request){try{
 const ctx=await context(request,true);const key=await apiKey(ctx);const data=await readJson(request);const brief=str(data.brief);const angle=str(data.angle,120);if(brief.length<8)throw new StudioError('Add a little more detail to your campaign brief.');
 const fallback=localDirections(brief,angle);if(!key)return Response.json({directions:fallback,source:'suggested-searches'});
 const content:any[]=[{type:'input_text',text:'Create exactly three distinct Pinterest SEARCH QUERIES and creative directions for an automotive campaign. Do not claim to have searched Pinterest or invent pins. The attached car image (if present) defines camera and trim. Match reference recommendations to the actual view. Return short client-friendly title, query, reason (why this reference would help) and scene (generation art direction). Preserve car angle, trim and identity. Vehicle: '+str(data.vehicle,100)+'. Brief: '+brief+' Angle: '+angle+' Finish: '+str(data.finish,120)}];
 if(validId(data.sourceId)){const item=await bucket(ctx.BUCKET).get(imageKey(ctx.prefix,data.sourceId));if(item)content.push({type:'input_image',image_url:'data:'+item.httpMetadata?.contentType+';base64,'+Buffer.from(await item.arrayBuffer()).toString('base64')})}
 const schema={type:'object',properties:{directions:{type:'array',minItems:3,maxItems:3,items:{type:'object',properties:{title:{type:'string'},query:{type:'string'},reason:{type:'string'},scene:{type:'string'}},required:['title','query','reason','scene'],additionalProperties:false}}},required:['directions'],additionalProperties:false};
 const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:ctx.OPENAI_TEXT_MODEL||'gpt-5-mini',input:[{role:'user',content}],text:{format:{type:'json_schema',name:'creative_directions',strict:true,schema}},store:false,max_output_tokens:4000}),signal:AbortSignal.timeout(90000)});
 if(!res.ok)return Response.json({directions:fallback,source:'suggested-searches',notice:'AI suggestions are unavailable; these are brief-based search suggestions.'});
 const json:any=await res.json();const output=json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
 if(!output)return Response.json({directions:fallback,source:'suggested-searches'});
 const parsed=JSON.parse(output);return Response.json({...parsed,source:'ai-directions'});
 }catch(e){return fail(e)}}
