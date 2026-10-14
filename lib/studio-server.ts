import {getDatabase} from '@/lib/portable/database';
import {getStorage} from '@/lib/portable/storage';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export type StudioEnv={DB?:D1Database;BUCKET?:R2Bucket;OPENAI_API_KEY?:string;OPENAI_IMAGE_MODEL?:string;OPENAI_TEXT_MODEL?:string;KEY_ENCRYPTION_SECRET?:string;SHARED_OPENAI_OWNER_EMAIL?:string;SHARED_OPENAI_GUEST_EMAILS?:string};
export const bindings=():StudioEnv=>({DB:getDatabase(),BUCKET:getStorage() as unknown as R2Bucket|undefined,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_IMAGE_MODEL:process.env.OPENAI_IMAGE_MODEL,OPENAI_TEXT_MODEL:process.env.OPENAI_TEXT_MODEL,KEY_ENCRYPTION_SECRET:process.env.KEY_ENCRYPTION_SECRET,SHARED_OPENAI_OWNER_EMAIL:process.env.SHARED_OPENAI_OWNER_EMAIL,SHARED_OPENAI_GUEST_EMAILS:process.env.SHARED_OPENAI_GUEST_EMAILS});
export class StudioError extends Error{constructor(message:string,public status=400){super(message)}}
export async function context(request:Request,write=false){
 const user=await getChatGPTUser();if(!user)throw new StudioError('Please sign in to use your studio.',401);
 if(write){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new StudioError('This request must come from your studio.',403)}
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId));
 const prefix='users/'+Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('')+'/';
 return {prefix,email:user.email,...bindings()};
}
export function bucket(value:R2Bucket|undefined){if(!value)throw new StudioError('Image storage is not connected yet. Your draft is still here.',503);return value}
export const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-z0-9-]{8,80}$/.test(id);
export const imageKey=(prefix:string,id:string)=>prefix+'images/'+id;
export function str(v:unknown,max=2000){return typeof v==='string'?v.trim().slice(0,max):''}
export function fail(error:unknown){if(error instanceof StudioError)return Response.json({error:error.message},{status:error.status});console.error('Studio request failed',error instanceof Error?error.name:'UnknownError');return Response.json({error:'Something went wrong. Your draft is safe; please try again.'},{status:500})}
export async function readJson(request:Request,maxBytes=16000):Promise<Record<string,any>>{if(Number(request.headers.get('content-length')||0)>maxBytes)throw new StudioError('The brief is too long.',413);let data:unknown;try{const text=await request.text();if(new TextEncoder().encode(text).length>maxBytes)throw new StudioError('The brief is too long.',413);data=JSON.parse(text)}catch(e){if(e instanceof StudioError)throw e;throw new StudioError('The request could not be read.')}if(!data||typeof data!=='object'||Array.isArray(data))throw new StudioError('Invalid request.');return data as Record<string,any>}
export function imageType(bytes:Uint8Array){if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';return null}
export async function providerError(response:Response){
 const body=await response.json().catch(()=>null) as {error?:{message?:unknown;param?:unknown;code?:unknown}}|null;
 const safeTag=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_.\[\]-]{1,80}$/.test(v)?v:undefined;
 console.error('Image provider rejected request',JSON.stringify({status:response.status,code:safeTag(body?.error?.code),param:safeTag(body?.error?.param),requestId:safeTag(response.headers.get('x-request-id'))}));
 if(response.status===400&&typeof body?.error?.message==='string'){
  const detail=body.error.message.replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').replace(/https?:\/\/\S+/g,'[link]').replace(/[\r\n]+/g,' ').slice(0,500);
  return new StudioError('OpenAI rejected the edit request: '+detail,400);
 }
 if(response.status===401||response.status===403)return new StudioError('Image generation access needs attention. Ask your studio owner to check the OpenAI connection.',503);if(response.status===429)return new StudioError('Generation is currently at its limit. Check account credit or try again later.',429);return new StudioError('The image service could not complete this request. Your references and brief are preserved.',502)}
