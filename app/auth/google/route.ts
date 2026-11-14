export const runtime='nodejs';
import {serverAuth,authConfigured,googleEnabled} from '@/lib/auth/supabase';
import {linkOrigin} from '@/lib/auth/flow';
import {NO_STORE,redirect} from '@/lib/auth/respond';
// Google sign-in: built, and parked behind STUDIO_GOOGLE_SIGNIN (off).
export async function GET(request:Request){
 if(!authConfigured())return redirect(request,'/signin?problem=not_configured');
 if(!googleEnabled())return redirect(request,'/signin?problem=google_off');
 const {data,error}=await (await serverAuth()).auth.signInWithOAuth({provider:'google',options:{redirectTo:linkOrigin(request)+'/auth/callback',skipBrowserRedirect:true}});
 if(error||!data.url||!data.url.startsWith('https://'))return redirect(request,'/signin?problem=unknown');
 return new Response(null,{status:303,headers:{...NO_STORE,Location:data.url}});
}
