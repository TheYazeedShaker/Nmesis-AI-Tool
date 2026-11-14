export const runtime='nodejs';
import {serverAuth,authConfigured,toSessionUser} from '@/lib/auth/supabase';
import {problemFor} from '@/lib/auth/words';
import {landing} from '@/lib/auth/flow';
import {redirect} from '@/lib/auth/respond';
// Where emailed links (sign-in link, recovery) and Google come back with a code,
// swapped here for a session with the verifier this browser kept. A link that put
// its tokens after the # arrives with no code; the page hands those over itself
// (components/link-landing.tsx).
export async function GET(request:Request){
 const url=new URL(request.url);
 if(!authConfigured())return redirect(request,'/signin?problem=not_configured');
 const said=url.searchParams.get('error_code')||url.searchParams.get('error');
 if(said){const p=problemFor({code:said});return redirect(request,'/signin?problem='+(p==='unknown'?'link_invalid':p))}
 const code=url.searchParams.get('code');
 if(!code||code.length>512)return redirect(request,'/signin');
 const {data,error}=await (await serverAuth()).auth.exchangeCodeForSession(code);
 const user=toSessionUser(data.user);
 if(error||!user){const p=error?problemFor(error):'link_invalid';return redirect(request,'/signin?problem='+(p==='unknown'?'link_invalid':p))}
 return redirect(request,await landing(user,url.searchParams.get('next'),url.searchParams.get('type')));
}
