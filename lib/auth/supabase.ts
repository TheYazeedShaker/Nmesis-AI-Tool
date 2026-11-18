import {createServerClient} from '@supabase/ssr';
import {profileName} from '@/lib/accounts/names';
import {createClient,type SupabaseClient,type User} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
// Supabase Auth, server-side only. The browser never holds a Supabase client or
// key: the session lives in httpOnly cookies written here, and every API route
// verifies it with Supabase (getUser) before doing anything.
const TIMEOUT_MS=10_000;
const env=()=>({url:(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,''),publishable:(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim(),secret:(process.env.SUPABASE_SECRET_KEY||'').trim()});
export const authConfigured=()=>{const e=env();return !!(e.url&&e.publishable&&e.secret)};
// Google is parked: built, and off unless STUDIO_GOOGLE_SIGNIN is "on".
export const googleEnabled=()=>process.env.STUDIO_GOOGLE_SIGNIN==='on';
// Every request to Supabase stops after ten seconds.
const timedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(TIMEOUT_MS)]):AbortSignal.timeout(TIMEOUT_MS)});
export const secureCookies=()=>process.env.NODE_ENV==='production';
export const cookieOptions=()=>({httpOnly:true,secure:secureCookies(),sameSite:'lax' as const,path:'/'});
type CookieStore=Awaited<ReturnType<typeof cookies>>;
// One client per request, reading and writing the session cookies. In a server
// component cookies cannot be written; the proxy refreshes them there instead.
export async function serverAuth(store?:CookieStore){
 const e=env(),jar=store??await cookies();
 return createServerClient(e.url,e.publishable,{
  cookieOptions:{...cookieOptions(),maxAge:60*60*24*30},
  global:{fetch:timedFetch},
  auth:{flowType:'pkce',detectSessionInUrl:false},
  cookies:{getAll:()=>jar.getAll(),setAll:list=>{try{for(const c of list)jar.set(c.name,c.value,{...c.options,...cookieOptions()})}catch{/* read-only in a server component: the proxy writes them */}}},
 });
}
let admin:SupabaseClient|undefined;
// The secret key: user lookups, password changes and the person's own name only. Never leaves the server.
export function adminAuth(){const e=env();return admin??=createClient(e.url,e.secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:timedFetch}})}
// The signed-in person's own name (user_metadata.full_name, which profileName
// reads first). `userId` is always the verified session's (ctx.userId), never a
// request's. Supabase merges user_metadata, so the person's other keys stay.
// Unanswered (the ten-second limit above) or refused: ok false, logged by kind
// only, and the caller says so in a sentence.
export async function saveOwnName(userId:string,name:string):Promise<{ok:true;name:string}|{ok:false}>{
 try{
  const {data,error}=await adminAuth().auth.admin.updateUserById(userId,{user_metadata:{full_name:name}});
  if(error||!data.user){console.error('Profile: the name was not saved',JSON.stringify({status:error?.status??null,code:error?.code||error?.name||'no-user'}));return {ok:false}}
  return {ok:true,name:profileName(data.user.user_metadata)??name};
 }catch(e){console.error('Profile: the name was not saved',e instanceof Error?e.name:'UnknownError');return {ok:false}}
}
// `aal` is the session's assurance level: 'aal2' only after the six-digit code
// (TOTP) in this session. `totp` says whether the account has a verified factor.
export type SessionUser={id:string;email:string;appMetadata:Record<string,unknown>;aal:'aal1'|'aal2';totp:boolean;/** The person's own name from their profile (user_metadata), when they gave one: shown in the account menu only. */name?:string};
// The `aal` claim of an access token. Only read from a token Supabase has just
// verified (verifiedUser below); anything unexpected reads as 'aal1'.
export function aalOf(token:string|undefined):'aal1'|'aal2'{
 const part=typeof token==='string'?token.split('.')[1]:undefined;if(!part)return 'aal1';
 try{const claims=JSON.parse(Buffer.from(part,'base64url').toString('utf8')) as {aal?:unknown};return claims?.aal==='aal2'?'aal2':'aal1'}catch{return 'aal1'}
}
export const toSessionUser=(u:User|null|undefined,token?:string):SessionUser|null=>u&&typeof u.id==='string'?{id:u.id,email:(u.email||'').toLowerCase(),appMetadata:(u.app_metadata||{}) as Record<string,unknown>,aal:aalOf(token),totp:!!u.factors?.some(f=>f.factor_type==='totp'&&f.status==='verified'),name:profileName(u.user_metadata)}:null;
// The signed-in user from the session cookie: the access token is sent to
// Supabase (getUser) and only that verified token's assurance level is used.
export async function verifiedUser(client?:Awaited<ReturnType<typeof serverAuth>>):Promise<SessionUser|null>{
 const auth=(client??await serverAuth()).auth;
 const {data:current}=await auth.getSession();const token=current.session?.access_token;
 if(!token)return null;
 const {data,error}=await auth.getUser(token);
 return error?null:toSessionUser(data.user,token);
}
