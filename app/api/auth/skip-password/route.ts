export const runtime='nodejs';
import {sessionUser} from '@/lib/studio-context';
import {safeNext} from '@/lib/auth/words';
import {clearSteps} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// "Skip, I'll use email links": the card goes away for this sign-in only. With no
// password flag, the next link sign-in shows it again.
export async function POST(request:Request){
 const d=await body(request);if(!d)return refuse('unknown');
 if(!await sessionUser())return refuse('expired',401);
 await clearSteps();
 return answer({ok:true,next:safeNext(d.next)});
}
