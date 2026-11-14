export const runtime='nodejs';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {clearSteps} from '@/lib/auth/flow';
import {redirect} from '@/lib/auth/respond';
// Sign out of this browser: a form POST from the workspace, never a GET link.
// The company choice (studio_org) is kept, so the next sign-in returns to the
// last company; it is only a wish, re-checked against the next user's access.
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return new Response(null,{status:403});
 if(authConfigured()){const {error}=await (await serverAuth()).auth.signOut({scope:'local'});if(error)console.warn('Sign-out: Supabase did not confirm',error.code||error.status||'error')}
 await clearSteps();
 return redirect(request,'/signin?signedOut=1');
}
