import {NextResponse,type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';
// Workspace pages only (API routes verify the session themselves). Refreshes the
// Supabase session cookies, sends a signed-out visitor to sign in, and holds a
// person at "Choose your password" while that card is owed (set by the server
// after an invitation or recovery link). A deep link to a company's workspace
// (/?org=<id>, from the admin) goes to /auth/open, which checks it on the server.
const PUBLIC=/^\/(signin(\/.*)?|auth\/.*)$/;
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(PUBLIC.test(path))return NextResponse.next();
 const url=(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,''),key=(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
 const here=path+request.nextUrl.search;
 const toSignIn=()=>{const to=request.nextUrl.clone();to.pathname='/signin';to.search=here!=='/'?'?next='+encodeURIComponent(here):'';return NextResponse.redirect(to,303)};
 if(!url||!key)return toSignIn();
 let response=NextResponse.next({request});
 const secure=process.env.NODE_ENV==='production';
 const supabase=createServerClient(url,key,{
  cookieOptions:{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:60*60*24*30},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10_000)})},
  auth:{flowType:'pkce',detectSessionInUrl:false},
  cookies:{getAll:()=>request.cookies.getAll(),setAll:list=>{for(const c of list)request.cookies.set(c.name,c.value);response=NextResponse.next({request});for(const c of list)response.cookies.set(c.name,c.value,{...c.options,httpOnly:true,secure,sameSite:'lax',path:'/'})}},
 });
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user){const out=toSignIn();for(const c of response.cookies.getAll())out.cookies.set(c);return out}
 if(request.cookies.get('studio_step')?.value==='password'){
  const to=request.nextUrl.clone();to.pathname='/auth/password';to.search=path!=='/'?'?next='+encodeURIComponent(path):'';
  const out=NextResponse.redirect(to,303);for(const c of response.cookies.getAll())out.cookies.set(c);return out;
 }
 if(path==='/'&&request.nextUrl.searchParams.has('org')){
  const to=request.nextUrl.clone();to.pathname='/auth/open';to.search='?org='+encodeURIComponent((request.nextUrl.searchParams.get('org')||'').slice(0,64));
  const out=NextResponse.redirect(to,303);for(const c of response.cookies.getAll())out.cookies.set(c);return out;
 }
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!api/|_next/|favicon|.*\\.[a-z0-9]+$).*)']};
