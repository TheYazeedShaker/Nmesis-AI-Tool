export const runtime='nodejs';
import {cookies} from 'next/headers';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {clearSteps} from '@/lib/auth/flow';
import {ORG_COOKIE} from '@/lib/studio-context';
import {redirect} from '@/lib/auth/respond';
// Sign out of this browser: a form POST from the workspace, never a GET link.
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return new Response(null,{status:403});
 if(authConfigured()){const {error}=await (await serverAuth()).auth.signOut({scope:'local'});if(error)console.warn('Sign-out: Supabase did not confirm',error.code||error.status||'error')}
 await clearSteps();(await cookies()).delete(ORG_COOKIE);
 return redirect(request,'/signin?signedOut=1');
}
