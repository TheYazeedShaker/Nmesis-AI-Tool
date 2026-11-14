// Where links in sign-in emails (magic link, recovery, Google) come back to.
// Pure, no imports, so tests load it directly.
//
// Supabase only redirects to addresses on its allow list and otherwise falls back
// to its Site URL (the admin), so the address must be a stable one, never the
// per-deployment address a request happened to arrive on, and never one built
// from the Host header. In order:
//   1. STUDIO_PUBLIC_ORIGIN, when set and valid (https, no path);
//   2. on Vercel Production, https://VERCEL_PROJECT_PRODUCTION_URL;
//   3. on a Vercel Preview, https://VERCEL_BRANCH_URL (the branch's stable address);
//   4. otherwise (local development) the request's own origin.
type Env=Record<string,string|undefined>;
const HOST=/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;
// An https origin with nothing after it, or null.
export function publicOrigin(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const raw=value.trim().replace(/\/+$/,'');
 if(!raw||raw.length>253)return null;
 let u:URL;try{u=new URL(raw)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!HOST.test(u.host))return null;
 return u.origin;
}
// A Vercel system variable is a bare host name (no scheme).
const vercelHost=(value:unknown)=>typeof value==='string'&&HOST.test(value.trim().toLowerCase())?'https://'+value.trim().toLowerCase():null;
let warned=false;
export function resolveLinkOrigin(requestUrl:string,env:Env=process.env):string{
 const configured=env.STUDIO_PUBLIC_ORIGIN?.trim();
 if(configured){
  const ok=publicOrigin(configured);if(ok)return ok;
  // One line, naming the variable and the rule, never the value.
  if(!warned){warned=true;console.error('Sign-in: STUDIO_PUBLIC_ORIGIN is ignored: it must be an https address with no path, e.g. https://studio.example.com')}
 }
 if(env.VERCEL_ENV==='production'){const o=vercelHost(env.VERCEL_PROJECT_PRODUCTION_URL);if(o)return o}
 if(env.VERCEL_ENV==='preview'){const o=vercelHost(env.VERCEL_BRANCH_URL);if(o)return o}
 return new URL(requestUrl).origin;
}
