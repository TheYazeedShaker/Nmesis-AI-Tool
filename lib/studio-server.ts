import {getDatabase,type StudioDatabase} from '@/lib/portable/database';
import {getStorage,type StudioBucket} from '@/lib/portable/storage';
import {getStudioContext} from '@/lib/studio-context';
import {userPrefix} from '@/lib/portable/tenancy';
import {checkRoute,PlanError,type Entitlements,type Role} from '@/lib/accounts/plan';
import {NO_COMPANY} from '@/lib/auth/words';
import type {StudioContext} from '@/lib/accounts/context';
export type StudioEnv={DB?:StudioDatabase;BUCKET?:StudioBucket;OPENAI_API_KEY?:string;OPENAI_IMAGE_MODEL?:string;OPENAI_TEXT_MODEL?:string;KEY_ENCRYPTION_SECRET?:string};
export const bindings=():StudioEnv=>({DB:getDatabase(),BUCKET:getStorage(),OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_IMAGE_MODEL:process.env.OPENAI_IMAGE_MODEL,OPENAI_TEXT_MODEL:process.env.OPENAI_TEXT_MODEL,KEY_ENCRYPTION_SECRET:process.env.KEY_ENCRYPTION_SECRET});
// Plain fields: tests load studio sources under Node's strip-only TypeScript mode.
export class StudioError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
// What every route works with: the verified member, their company and plan, their
// own storage prefix (also the row owner) and a database bound to them for RLS.
export type RequestContext=StudioEnv&{prefix:string;org:string;userId:string;role:Role;entitlements:Entitlements;account:StudioContext};
export function requestContext(account:StudioContext,env:StudioEnv=bindings()):RequestContext{
 return {...env,DB:env.DB?.forUser(account.user.id),prefix:userPrefix(account.org.id,account.user.id),org:account.org.id,userId:account.user.id,role:account.role,entitlements:account.entitlements,account};
}
// Every API route starts here: sign-in, company, plan feature (from the single
// ROUTE_FEATURES table), viewer read-only and an ended subscription are all
// decided before the route reads its body.
export async function context(request:Request,write=false){
 const got=await getStudioContext();
 if(!got.ok)throw got.problem==='signed_out'?new StudioError('Please sign in to use your studio.',401):got.problem==='no_company'?new StudioError(NO_COMPANY,403):new StudioError('Signing in is not set up on this Studio yet.',503);
 if(write||request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new StudioError('This request must come from your studio.',403)}
 try{checkRoute(got.ctx,new URL(request.url).pathname,request.method)}catch(e){if(e instanceof PlanError)throw new StudioError(e.message,e.status);throw e}
 return requestContext(got.ctx);
}
export function bucket(value:StudioBucket|undefined){if(!value)throw new StudioError('Image storage is not connected yet. Your draft is still here.',503);return value}
export const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-z0-9-]{8,80}$/.test(id);
export const imageKey=(prefix:string,id:string)=>prefix+'images/'+id;
export function str(v:unknown,max=2000){return typeof v==='string'?v.trim().slice(0,max):''}
export function fail(error:unknown){if(error instanceof StudioError||error instanceof PlanError)return Response.json({error:error.message},{status:error.status});console.error('Studio request failed',error instanceof Error?error.name:'UnknownError');return Response.json({error:'Something went wrong. Your draft is safe; please try again.'},{status:500})}
export async function readJson(request:Request,maxBytes=16000):Promise<Record<string,any>>{if(Number(request.headers.get('content-length')||0)>maxBytes)throw new StudioError('The brief is too long.',413);let data:unknown;try{const text=await request.text();if(new TextEncoder().encode(text).length>maxBytes)throw new StudioError('The brief is too long.',413);data=JSON.parse(text)}catch(e){if(e instanceof StudioError)throw e;throw new StudioError('The request could not be read.')}if(!data||typeof data!=='object'||Array.isArray(data))throw new StudioError('Invalid request.');return data as Record<string,any>}
export function imageType(bytes:Uint8Array){if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';return null}
export async function providerError(response:Response){
 const body=await response.json().catch(()=>null) as {error?:{message?:unknown;param?:unknown;code?:unknown;type?:unknown}}|null;
 const safeTag=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_.\[\]-]{1,80}$/.test(v)?v:undefined;
 const code=safeTag(body?.error?.code),type=safeTag(body?.error?.type);
 console.error('Image provider rejected request',JSON.stringify({status:response.status,code,param:safeTag(body?.error?.param),requestId:safeTag(response.headers.get('x-request-id'))}));
 const detail=typeof body?.error?.message==='string'?body.error.message.replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/https?:\/\/\S+/g,'[link]').replace(/[A-Za-z0-9_+=.\/-]{60,}/g,'[redacted]').replace(/[\r\n]+/g,' ').slice(0,500):'';
 if(response.status===401)return new StudioError('OpenAI rejected the saved API key. Your company’s owner needs to reconnect an active key in Settings → OpenAI connection.'+(code?' ('+code+')':''),503);
 if(response.status===403)return new StudioError('OpenAI denied image generation access. '+(detail||'Check image-model access and image write permissions for the connected project.')+(code?' ('+code+')':''),503);
 if(response.status===404)return new StudioError('The configured OpenAI image model is unavailable to this project. '+detail,400);
 if(response.status===429){const quota=code==='insufficient_quota'||type==='insufficient_quota'||/quota|billing|credit|balance/i.test(detail);return new StudioError(quota?'OpenAI API credits or spending limit are exhausted. Your company’s owner needs to check API billing and project limits.':'OpenAI temporarily rate-limited this request. Wait before starting another generation.',429)}
 if(response.status===400)return new StudioError('OpenAI rejected the edit request: '+(detail||'Check the reference images and output settings.'),400);
 return new StudioError('OpenAI could not complete this request. Your references and brief are preserved.',502);
}
