export const runtime='nodejs';
import {cookies} from 'next/headers';
import {sessionUser,ORG_COOKIE} from '@/lib/studio-context';
import {passwordProblem,safeNext} from '@/lib/auth/words';
import {clearSteps,setPasswordAndResume} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// Only ever for the person whose session this is: there is no user id in the
// request, only the verified session's.
export async function POST(request:Request){
 const d=await body(request);if(!d)return refuse('unknown');
 const user=await sessionUser();if(!user)return refuse('expired',401);
 const said=passwordProblem(d.password,d.confirm,user.email);if(said)return answer({error:said},400);
 const done=await setPasswordAndResume(user,d.password as string);
 if(!done.ok)return refuse(done.problem,done.problem==='rate_limited'?429:400);
 await clearSteps();
 if(!done.resumed){(await cookies()).delete(ORG_COOKIE);return answer({ok:true,signInAgain:true,next:'/signin?problem=expired'})}
 return answer({ok:true,next:safeNext(d.next)});
}
