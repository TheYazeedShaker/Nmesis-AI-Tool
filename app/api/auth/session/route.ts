export const runtime='nodejs';
import {serverAuth,authConfigured,toSessionUser} from '@/lib/auth/supabase';
import {problemFor} from '@/lib/auth/words';
import {landing} from '@/lib/auth/flow';
import {answer,body,refuse} from '@/lib/auth/respond';
// An emailed link that put its tokens after the # (invitations sent by the Nmesis
// admin): the page hands them over once, and Supabase verifies them here exactly
// like any other session before a cookie is written.
export async function POST(request:Request){
 if(!authConfigured())return refuse('not_configured',503);
 const d=await body(request);if(!d)return refuse('unknown');
 const access=typeof d.accessToken==='string'?d.accessToken:'',refresh=typeof d.refreshToken==='string'?d.refreshToken:'';
 if(!/^[A-Za-z0-9._-]{20,4096}$/.test(access)||!/^[A-Za-z0-9._-]{8,512}$/.test(refresh))return refuse('link_invalid');
 const {data,error}=await (await serverAuth()).auth.setSession({access_token:access,refresh_token:refresh});
 const user=toSessionUser(data.user);
 if(error||!user){const p=error?problemFor(error):'link_invalid';return refuse(p==='unknown'?'link_invalid':p,401)}
 return answer({ok:true,next:await landing(user,d.next,d.type)});
}
