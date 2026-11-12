import {createServerClient} from '@supabase/ssr';
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
// The secret key: user lookups and password changes only. Never leaves the server.
export function adminAuth(){const e=env();return admin??=createClient(e.url,e.secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:timedFetch}})}
export type SessionUser={id:string;email:string;appMetadata:Record<string,unknown>};
export const toSessionUser=(u:User|null|undefined):SessionUser|null=>u&&typeof u.id==='string'?{id:u.id,email:(u.email||'').toLowerCase(),appMetadata:(u.app_metadata||{}) as Record<string,unknown>}:null;
