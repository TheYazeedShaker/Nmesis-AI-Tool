export const runtime='nodejs';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {getDirectory} from '@/lib/accounts/directory';
import {cleanEmail,problemFor,safeNext} from '@/lib/auth/words';
import {clearSteps} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// Sign in with an email address and a password. Nmesis staff (the same email and
// password as the admin) continue to the six-digit code; every request checks
// that again on the server, so this is only where the browser goes next.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const email=cleanEmail(d.email),password=typeof d.password==='string'?d.password:'';
 if(!email||!password||password.length>200)return refuse('bad_credentials',401);
 const {data,error}=await (await serverAuth()).auth.signInWithPassword({email,password});
 if(error){const problem=problemFor(error);return refuse(problem==='unknown'?'bad_credentials':problem,problem==='rate_limited'?429:problem==='unreachable'?503:401)}
 await clearSteps();
 const next=safeNext(d.next);
 let staff=false;
 try{staff=!!(data.user&&await getDirectory()?.staffRole(data.user.id))}catch(e){console.warn('Sign-in: the staff check failed; the workspace checks again',e instanceof Error?e.name:'UnknownError')}
 return answer({ok:true,next:staff?'/auth/code'+(next!=='/'?'?next='+encodeURIComponent(next):''):next});
}
