import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {AuthShell} from '@/components/auth/auth-shell';
import {SignInForm} from '@/components/auth/forms';
import {googleEnabled} from '@/lib/auth/supabase';
import {problemText,safeNext} from '@/lib/auth/words';
import {sessionUser} from '@/lib/studio-context';
export const metadata:Metadata={title:'Sign in · Nmesis Studio'};
export const dynamic='force-dynamic';
type Search=Promise<Record<string,string|string[]|undefined>>;
const one=(v:string|string[]|undefined)=>typeof v==='string'?v:'';
export default async function SignIn({searchParams}:{searchParams:Search}){
 const q=await searchParams,next=safeNext(one(q.next));
 if(!one(q.problem)&&await sessionUser().catch(()=>null))redirect(next);
 return <AuthShell eyebrow="NMESIS STUDIO" title="Sign in" lead="Use the email address your company’s Studio invitation was sent to." problem={one(q.problem)?problemText(one(q.problem)):undefined} note={one(q.signedOut)?'You are signed out.':undefined}>
  <SignInForm next={next} email={one(q.email).slice(0,254)} google={googleEnabled()}/>
 </AuthShell>;
}
