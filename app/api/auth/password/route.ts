export const runtime='nodejs';
import {serverAuth,authConfigured} from '@/lib/auth/supabase';
import {cleanEmail,problemFor,safeNext} from '@/lib/auth/words';
import {clearSteps} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// Sign in with an email address and a password.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const email=cleanEmail(d.email),password=typeof d.password==='string'?d.password:'';
 if(!email||!password||password.length>200)return refuse('bad_credentials',401);
 const {error}=await (await serverAuth()).auth.signInWithPassword({email,password});
 if(error){const problem=problemFor(error);return refuse(problem==='unknown'?'bad_credentials':problem,problem==='rate_limited'?429:problem==='unreachable'?503:401)}
 await clearSteps();
 return answer({ok:true,next:safeNext(d.next)});
}
